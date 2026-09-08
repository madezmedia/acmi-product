// POST /api/acmi-emit
// Fleet write endpoint for Comms v1.5 envelopes (parent: fleet-acmi-protocol-enforce-v1).
//
// Validates camelCase correlation keys, stamps acmi_version/comms_protocol v1.5,
// locks tenant to madez, and ZADDs to:
//   - acmi:madez:agent:<id>:timeline   (fatal)
//   - acmi:madez:thread:agent-coordination:timeline  (best-effort)
//   - acmi:madez:bus:events            (best-effort)
//
// Auth: withAuth (OAuth bearer or MCP_DIRECT_AUTH_TOKEN / ACMI_WRITE_BEARER).
// Redis: Polar HTTPS exec via existing UPSTASH_*/ACMI_BRIDGE_* env (restEndpoint slash-safe).
// Idempotency: Idempotency-Key → acmi:idem:acmi-emit:<key> (24h).

import { withAuth } from "./_lib/auth.mjs";
import { extractIdempotencyKey, checkIdempotency } from "./_lib/idempotency.mjs";
import {
  buildEventV15,
  assertCamelCorrelationKeys,
  generateCorrelationId,
} from "./_lib/event-shape.mjs";

export const config = { runtime: "nodejs", maxDuration: 30 };

const TENANT = "madez";
const COORD_KEY = `acmi:${TENANT}:thread:agent-coordination:timeline`;
const BUS_KEY = `acmi:${TENANT}:bus:events`;

function unwrapBody(raw) {
  const body = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
  if (body && typeof body === "object") {
    if (body.event && typeof body.event === "object") return { wrapper: body, event: body.event };
    if (body.envelope && typeof body.envelope === "object") {
      return { wrapper: body, event: body.envelope };
    }
  }
  return { wrapper: body, event: body };
}

function resolveAgentId(wrapper, event) {
  const candidates = [
    wrapper?.agent,
    wrapper?.agentId,
    wrapper?.agent_id,
    event?.agent,
    event?.agentId,
    event?.agent_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return c.trim().replace(/^agent:/, "");
    }
  }
  const source = typeof event?.source === "string" ? event.source.trim() : "";
  if (source.startsWith("agent:") && source.length > 6) return source.slice(6);
  if (source && !source.includes(":")) return source;
  return null;
}

function resolveTenant(wrapper, event) {
  const t = wrapper?.tenant ?? wrapper?.tenant_id ?? event?.tenant ?? event?.tenant_id;
  if (t === undefined || t === null || t === "") return TENANT;
  return String(t).trim();
}

function deriveActorType(source) {
  const s = String(source || "");
  if (s.startsWith("user:") || s === "mikey" || s === "operator") return "user";
  if (s.startsWith("agent:")) return "agent";
  return "agent";
}

function normalizeEventInput(wrapper, eventIn) {
  assertCamelCorrelationKeys(wrapper);
  assertCamelCorrelationKeys(eventIn);
  if (eventIn?.payload) assertCamelCorrelationKeys(eventIn.payload);

  const source = typeof eventIn.source === "string" ? eventIn.source.trim() : "";
  const kind = typeof eventIn.kind === "string" ? eventIn.kind.trim() : "";
  const summary = typeof eventIn.summary === "string" ? eventIn.summary.trim() : "";

  if (!source) throw Object.assign(new Error("source (non-empty string) required"), { status: 400 });
  if (!kind) throw Object.assign(new Error("kind (non-empty string) required"), { status: 400 });
  if (!summary) throw Object.assign(new Error("summary (non-empty string) required"), { status: 400 });

  const ts =
    typeof eventIn.ts === "number" && Number.isFinite(eventIn.ts)
      ? eventIn.ts
      : Date.now();

  const correlationId =
    typeof eventIn.correlationId === "string" && eventIn.correlationId.trim()
      ? eventIn.correlationId.trim()
      : generateCorrelationId(kind, ts);

  const parentCorrelationId =
    typeof eventIn.parentCorrelationId === "string" && eventIn.parentCorrelationId.trim()
      ? eventIn.parentCorrelationId.trim()
      : undefined;

  return buildEventV15({
    source,
    kind,
    summary,
    payload: eventIn.payload,
    tags: eventIn.tags,
    correlationId,
    parentCorrelationId,
    ts,
    actor_type: eventIn.actor_type || deriveActorType(source),
  });
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", allowed: ["POST"] });
  }

  try {
    const { wrapper, event: eventIn } = unwrapBody(req.body);

    const tenant = resolveTenant(wrapper, eventIn);
    if (tenant !== TENANT) {
      return res.status(403).json({
        error: `tenant locked to ${TENANT}`,
        received: tenant,
      });
    }

    const agentId = resolveAgentId(wrapper, eventIn);
    if (!agentId) {
      return res.status(400).json({
        error: "agent id required — pass agent / agentId or source as agent:<id>",
      });
    }

    let event;
    try {
      event = normalizeEventInput(wrapper, eventIn);
    } catch (e) {
      const status = e.status || 400;
      return res.status(status).json({ error: e.message || String(e) });
    }

    // Prefer agent: prefix on source for fleet readers.
    if (!String(event.source).startsWith("agent:") && !String(event.source).startsWith("user:")) {
      event = { ...event, source: `agent:${agentId}` };
    }

    const { redis } = req.acmiAuth;
    const idemKey = extractIdempotencyKey(req);
    const agentKey = `acmi:${TENANT}:agent:${agentId}:timeline`;

    const result = await checkIdempotency(redis, "acmi-emit", idemKey, async () => {
      const member = JSON.stringify(event);
      const score = String(event.ts);
      const wrote = { agent: false, coord: false, bus: false };

      try {
        await redis("ZADD", agentKey, score, member);
        wrote.agent = true;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn(`[acmi-emit] ZADD ${agentKey} failed:`, msg);
        throw new Error(`failed to write agent timeline: ${msg}`);
      }

      try {
        await redis("ZADD", COORD_KEY, score, member);
        wrote.coord = true;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn(`[acmi-emit] ZADD ${COORD_KEY} failed (non-fatal):`, msg);
      }

      try {
        await redis("ZADD", BUS_KEY, score, member);
        wrote.bus = true;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn(`[acmi-emit] ZADD ${BUS_KEY} failed (non-fatal):`, msg);
      }

      return {
        ok: true,
        event,
        keys: { agent: agentKey, coord: COORD_KEY, bus: BUS_KEY },
        wrote,
        parent: "fleet-acmi-protocol-enforce-v1",
      };
    });

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(result);
  } catch (e) {
    if (!res.headersSent) {
      const msg = e && e.message ? e.message : String(e);
      console.error("[acmi-emit] handler error:", msg);
      return res.status(500).json({ error: msg, where: "acmi-emit.handler" });
    }
    return undefined;
  }
}

export default withAuth(handler);
