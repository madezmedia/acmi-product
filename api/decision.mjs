// POST /api/decision
// Operator-emitted decision events beyond accept/reject. Four flows:
//
//   flow="operator-note"      → kind=decision-note
//                              (operator notes a directional decision without
//                               immediately resolving; e.g. "lean toward option B")
//
//   flow="handling-offline"   → kind=decision-handling-offline
//                              (operator marks agent/decision as being handled
//                               outside the system — Telegram, in-person, etc.)
//
//   flow="resolved"           → kind=decision-resolved
//                              (operator marks a decision as resolved with
//                               disposition; parentCorrelationId binds to HITL/inbox item)
//
//   flow="with-memo"          → kind=decision-with-memo
//                              (full-context decision; payload.memo carries
//                               the long-form reasoning for posterity)
//
// Auth: OAuth 2.1 Bearer (shared with /api/mcp) OR env-bearer break-glass
//       (MCP_DIRECT_AUTH_TOKEN / ACMI_WRITE_BEARER). Enforced via withAuth wrapper.
// Idempotency: Idempotency-Key header → 24h dedupe on acmi:idem:decision:<key>.
// Event shape: Comms v1.1 envelope — strict camelCase correlationId.
// Writes: acmi:agent:<sub>:timeline (operator audit trail) AND
//         acmi:thread:agent-coordination:timeline (coordination visibility).
//
// Wave 2 plan 04-06: closes phase success criterion #5 (4 extended flows return
// 200 with correct event shapes, no silent 500s) and finalizes #6 (all 5 Phase
// 4 write endpoints reject 401 without bearer).
//
// Runtime: Node.js (auth.mjs depends on node:crypto + lookupAccessToken storage).

import { withAuth } from "./_lib/auth.mjs";
import { extractIdempotencyKey, checkIdempotency } from "./_lib/idempotency.mjs";
import { buildEvent } from "./_lib/event-shape.mjs";

export const config = { runtime: "nodejs", maxDuration: 30 };

const VALID_FLOWS = new Set(["operator-note", "handling-offline", "resolved", "with-memo"]);

// Each flow gets a deterministic event-kind suffix.
const FLOW_TO_KIND = {
  "operator-note": "decision-note",
  "handling-offline": "decision-handling-offline",
  "resolved": "decision-resolved",
  "with-memo": "decision-with-memo",
};

function buildFlowPayload(flow, body) {
  const base = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? { ...body.payload }
    : {};
  if (flow === "handling-offline") {
    base.agent_state = "offline";
    if (body.payload?.agent_id) base.agent_id = String(body.payload.agent_id);
    if (body.payload?.reason) base.reason = String(body.payload.reason).slice(0, 280);
  } else if (flow === "with-memo") {
    // memo is required for this flow — fall back to summary when not provided
    base.memo = String(body.payload?.memo || body.summary || "").slice(0, 4096);
  } else if (flow === "resolved") {
    base.disposition = body.payload?.disposition || "resolved";
    if (body.payload?.outcome) base.outcome = String(body.payload.outcome).slice(0, 280);
  } else if (flow === "operator-note") {
    if (body.payload?.lean) base.lean = String(body.payload.lean).slice(0, 80);
  }
  return base;
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", allowed: ["POST"] });
  }

  let parsedFlow = null;
  try {
    // Parse body. Vercel Node runtime auto-parses JSON when Content-Type is
    // application/json, but be defensive against string-mode delivery.
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { flow, summary, itemId, parentCorrelationId: parentIn, tags } = body;
    parsedFlow = typeof flow === "string" ? flow : null;

    if (!flow || !VALID_FLOWS.has(flow)) {
      return res.status(400).json({
        error: `flow required: one of ${[...VALID_FLOWS].join(", ")}`,
        valid: [...VALID_FLOWS],
      });
    }
    if (!summary || typeof summary !== "string" || summary.trim().length === 0) {
      return res.status(400).json({ error: "summary (non-empty string) required" });
    }
    if (flow === "with-memo" && !body.payload?.memo && summary.trim().length < 32) {
      return res.status(400).json({
        error: "with-memo flow requires payload.memo OR a summary ≥32 chars (which will be promoted to memo)",
      });
    }

    const { redis, sub } = req.acmiAuth;
    const idemKey = extractIdempotencyKey(req);

    const result = await checkIdempotency(redis, "decision", idemKey, async () => {
      const ts = Date.now();
      const kind = FLOW_TO_KIND[flow];
      const parent = (typeof itemId === "string" && itemId.trim())
        ? itemId.trim()
        : (typeof parentIn === "string" && parentIn.trim() ? parentIn.trim() : undefined);
      const payload = buildFlowPayload(flow, body);

      const event = buildEvent({
        source: sub || "operator",
        kind,
        summary: summary.trim(),
        payload,
        tags: Array.isArray(tags) ? [...tags, `flow:${flow}`] : [`flow:${flow}`, "operator-initiation"],
        parentCorrelationId: parent,
        ts,
      });

      const operatorTl = `acmi:agent:${sub || "operator"}:timeline`;
      const coordTl = `acmi:thread:agent-coordination:timeline`;

      // Defensive try/catch per Phase 1 hotfix 8880f23 + Phase 4 hotfix ef471db.
      // Operator audit trail is fatal (no ok:true without it). Coordination
      // thread + offline-mark are best-effort (logged but non-fatal).
      try {
        await redis("ZADD", operatorTl, String(ts), JSON.stringify(event));
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn(`[decision] ZADD ${operatorTl} failed:`, msg);
        throw new Error(`failed to write decision to operator timeline: ${msg}`);
      }

      try {
        await redis("ZADD", coordTl, String(ts), JSON.stringify(event));
      } catch (e) {
        // Non-fatal: coordination thread is visibility, not audit.
        const msg = e && e.message ? e.message : String(e);
        console.warn(`[decision] ZADD ${coordTl} failed (non-fatal):`, msg);
      }

      // Special-case: handling-offline ALSO sets a marker key for the named
      // agent so polling /api/fleet can surface offline state. Best-effort.
      if (flow === "handling-offline" && body.payload?.agent_id) {
        try {
          const safeAgentId = String(body.payload.agent_id).replace(/[^a-z0-9_-]/gi, "");
          if (safeAgentId) {
            const offlineKey = `acmi:agent:${safeAgentId}:offline-mark`;
            await redis(
              "SET",
              offlineKey,
              JSON.stringify({ marked_by: sub || "operator", ts, reason: payload.reason || null }),
              "EX",
              String(86400 * 7)
            );
          }
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          console.warn(`[decision] offline-mark SET failed (non-fatal):`, msg);
        }
      }

      return {
        ok: true,
        flow,
        kind,
        correlationId: event.correlationId,
        event,
        written_to: [operatorTl, coordTl],
      };
    });

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(result);
  } catch (e) {
    // Phase success criterion #5: NO SILENT 500s. Every error wrapped into
    // structured JSON before response goes out, with flow echoed for debug.
    if (!res.headersSent) {
      const msg = e && e.message ? e.message : String(e);
      console.error("[decision] handler error:", msg);
      return res.status(500).json({
        error: msg,
        where: "decision.handler",
        flow_attempted: parsedFlow,
      });
    }
    return undefined;
  }
}

export default withAuth(handler);
