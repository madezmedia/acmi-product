// GET /api/hitl?for=mikey&limit=20 — existing read path, preserved 1:1.
// POST /api/hitl                  — NEW write path, bearer-protected.
//
// Runtime: Node (required for OAuth lookupAccessToken via node:crypto).
// GET still cached as before (s-maxage=5, stale-while-revalidate=30).
// POST writes to acmi:user:<user>:hitl-queue (ZSET, score = ts) + mirrors as
// hitl-pending event on acmi:agent:<source-or-operator>:timeline.
//
// Wave 2 plan 04-04: closes phase success criterion #3 (POST /api/hitl creates
// queue item surfacing in Todos + HITL queue) and partially closes #6 (401
// without bearer with WWW-Authenticate header).

// tryParse only — `resolveInstance` and Edge `redis` are NOT imported because
// this file is Node runtime and uses inlined `resolveInstanceFromNodeReq` +
// `nodeRedis` helpers below. Importing Edge helpers here would dead-import
// and risk executor confusion (checker advisory commit 4bb6b5c).
import { tryParse } from "./_lib/redis.mjs";
import { requireBearer, AuthError } from "./_lib/auth.mjs";
import { extractIdempotencyKey, checkIdempotency } from "./_lib/idempotency.mjs";
import { buildEvent, generateCorrelationId } from "./_lib/event-shape.mjs";

export const config = { runtime: "nodejs", maxDuration: 30 };

const VALID_PRIORITY = new Set(["P0", "P1", "P2", "P3"]);

// Node runtime emulation of resolveInstance from edge-style redis.mjs.
// We can't call resolveInstance(req) because that uses Web Request `req.headers.get`.
// For GET we still want the deploy-owner read path (matches old behavior).
function resolveInstanceFromNodeReq(req) {
  const url = new URL(req.url, `https://${req.headers.host || "acmi-product.vercel.app"}`);
  const queryId = url.searchParams.get("instance");
  const cookieMatch = (req.headers.cookie || "").match(/acmi-instance=([^;]+)/);
  const cookieId = cookieMatch?.[1];
  const id = (queryId || cookieId || "default").trim();
  if (id === "default") {
    return {
      id: "default",
      url: process.env.UPSTASH_REDIS_REST_URL || "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    };
  }
  const slug = id.toUpperCase().replace(/-/g, "_");
  return {
    id,
    url: process.env[`UPSTASH_URL_${slug}`] || process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env[`UPSTASH_TOKEN_${slug}`] || process.env.UPSTASH_REDIS_REST_TOKEN || "",
  };
}

// Node-style redis fetch (same logic as edge redis.mjs but uses Node fetch).
async function nodeRedis(instance, ...cmd) {
  if (!instance.url || !instance.token) {
    throw new Error(`No credentials for instance "${instance.id}"`);
  }
  const endpoint = instance.url.replace(/\/$/, "") + "/";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${instance.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  return data.result;
}

// ─── GET (preserved 1:1) ────────────────────────────────────────────────
async function handleGet(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "acmi-product.vercel.app"}`);
  const user = (url.searchParams.get("for") || "mikey").replace(/[^a-z0-9_-]/gi, "");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);

  const instance = resolveInstanceFromNodeReq(req);
  const key = `acmi:user:${user}:hitl-queue`;
  let raw;
  try {
    raw = (await nodeRedis(instance, "ZREVRANGE", key, "0", String(limit - 1))) || [];
  } catch (e) {
    // Per Phase 4 hotfix ef471db: defensive — return empty array, not 500.
    console.warn(`hitl GET: ZREVRANGE failed:`, e.message);
    raw = [];
  }
  const items = raw.map(tryParse).filter((e) => e && typeof e === "object");
  const resolvedCids = new Set(
    items.filter((e) => /resolved|cleared/.test(e.kind || "")).map((e) => e.correlationId).filter(Boolean)
  );
  const pending = items.filter(
    (e) => /required|pending|escalate/.test(e.kind || "") && !resolvedCids.has(e.correlationId)
  );
  const resolved = items.filter((e) => /resolved|cleared/.test(e.kind || ""));

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", `public, s-maxage=5, stale-while-revalidate=30`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({
    ok: true,
    instance: instance.id,
    user,
    key,
    count_total: items.length,
    count_pending: pending.length,
    count_resolved: resolved.length,
    pending,
    resolved,
    ts: Date.now(),
  });
}

// ─── POST (new, bearer-protected) ──────────────────────────────────────
async function handlePost(req, res) {
  let auth;
  try {
    auth = await requireBearer(req);
  } catch (e) {
    if (e instanceof AuthError) {
      const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0];
      const host = req.headers["x-forwarded-host"] || req.headers.host || "acmi-product.vercel.app";
      try {
        res.setHeader(
          "WWW-Authenticate",
          `Bearer realm="acmi-write", resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"`
        );
      } catch {
        // res may not have setHeader in some test harnesses; ignore.
      }
      return res.status(e.status).json({
        error: e.message,
        hint: "OAuth 2.1 + PKCE via /.well-known/oauth-authorization-server. Or pass Bearer <MCP_DIRECT_AUTH_TOKEN> or Bearer <ACMI_WRITE_BEARER>.",
      });
    }
    throw e;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: `invalid JSON body: ${e.message}` });
  }

  const { user, summary, kind, payload, priority, parentCorrelationId } = body;
  const userSlug =
    (typeof user === "string" ? user : "mikey").replace(/[^a-z0-9_-]/gi, "") || "mikey";

  if (!summary || typeof summary !== "string" || summary.trim().length === 0) {
    return res.status(400).json({ error: "summary (non-empty string) required" });
  }

  const itemKind =
    typeof kind === "string" && kind.trim() ? kind.trim().slice(0, 64) : "hitl-pending";
  const itemPriority =
    typeof priority === "string" && VALID_PRIORITY.has(priority) ? priority : "P2";

  const { redis, sub } = auth;
  const idemKey = extractIdempotencyKey(req);

  const result = await checkIdempotency(redis, "hitl-write", idemKey, async () => {
    const ts = Date.now();
    const correlationId = generateCorrelationId(itemKind, ts);
    const item = buildEvent({
      source: sub || "operator",
      kind: itemKind, // satisfies GET-path /required|pending|escalate/ regex when default
      summary: summary.trim(),
      payload:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? { ...payload, priority: itemPriority, user: userSlug }
          : { priority: itemPriority, user: userSlug },
      tags: ["hitl", `priority:${itemPriority}`],
      parentCorrelationId:
        typeof parentCorrelationId === "string" ? parentCorrelationId : undefined,
      correlationId,
      ts,
    });

    const queueKey = `acmi:user:${userSlug}:hitl-queue`;
    const agentTl = `acmi:agent:${sub || "operator"}:timeline`;

    // Defensive try/catch per Phase 1 hotfix 8880f23 + Phase 4 hotfix ef471db.
    // Primary HITL-queue write is fatal if it fails (we can't claim ok:true
    // without it). Agent-timeline mirror is non-fatal — same shape as
    // directive.mjs symmetry write.
    try {
      await redis("ZADD", queueKey, String(ts), JSON.stringify(item));
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.warn(`[hitl POST] ZADD ${queueKey} failed:`, msg);
      throw new Error(`failed to write HITL item: ${msg}`);
    }
    try {
      await redis("ZADD", agentTl, String(ts), JSON.stringify(item));
    } catch (e) {
      // Non-fatal: agent-fan-in mirror is best-effort.
      const msg = e && e.message ? e.message : String(e);
      console.warn(`[hitl POST] ZADD ${agentTl} failed (non-fatal):`, msg);
    }

    return {
      ok: true,
      correlationId,
      user: userSlug,
      item,
      written_to: [queueKey, agentTl],
    };
  });

  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(result);
}

// ─── Method router ─────────────────────────────────────────────────────
// GET stays anonymous + cached (every page-load reads /api/hitl). POST is
// bearer-protected via inline requireBearer in handlePost. We can't use the
// withAuth() wrapper here because it would force auth on GET too.
export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await handleGet(req, res);
    if (req.method === "POST") return await handlePost(req, res);
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
      return res.status(204).end();
    }
    return res.status(405).json({ error: "Method not allowed", allowed: ["GET", "POST", "OPTIONS"] });
  } catch (e) {
    if (!res.headersSent) {
      const msg = e && e.message ? e.message : String(e);
      console.error("[hitl] handler error:", msg);
      return res.status(500).json({ error: msg, where: "hitl.handler" });
    }
    return undefined;
  }
}
