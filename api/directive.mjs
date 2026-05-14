// POST /api/directive
// Operator-originated directive event. Logs kind=directive to addressed
// agent's timeline (acmi:thread:<agent>:timeline) AND to the agent's own
// inbox-watch surface (acmi:agent:<agent>:timeline) for symmetry.
//
// Auth: OAuth 2.1 Bearer (shared with /api/mcp) OR env-bearer break-glass
//       (MCP_DIRECT_AUTH_TOKEN / ACMI_WRITE_BEARER). Enforced via withAuth wrapper.
// Idempotency: Idempotency-Key header → 24h dedupe on acmi:idem:directive:<key>.
// Event shape: Comms v1.1 envelope — strict camelCase correlationId.
//
// Wave 2 plan 04-02: closes phase success criterion #1 (POST /api/directive logs
// kind=directive event to addressed agent's timeline) and partially closes #6
// (401 without bearer with WWW-Authenticate header).
//
// Runtime: Node.js (auth.mjs depends on node:crypto + lookupAccessToken storage).

import { withAuth } from "./_lib/auth.mjs";
import { extractIdempotencyKey, checkIdempotency } from "./_lib/idempotency.mjs";
import { buildEvent } from "./_lib/event-shape.mjs";

export const config = { runtime: "nodejs", maxDuration: 30 };

// Allowlist of agent ids that can receive directives. Mirrors the agents-known
// surface from PROJECT.md (Claude, Bentley, Gemini CLI, Codex, Director, Gene)
// PLUS coordination broadcast targets ('agent-coordination', 'fleet') and
// thread-style targets used by Roundtable + cloud-sync ('bentley-pm',
// 'claude-daily-driver', 'newsroom', 'cloud-handoffs', 'daily-agents-fleet',
// 'revenue'). Plus 'test-agent' for E2E smoke (user prompt explicitly tests it).
const VALID_AGENTS = new Set([
  "claude", "claude-engineer", "claude-web",
  "bentley", "bentley-main", "bentley-temp", "bentley-pm",
  "gemini", "gemini-cli",
  "codex",
  "director",
  "gene",
  "agent-coordination", "fleet",
  "claude-daily-driver", "newsroom", "cloud-handoffs", "daily-agents-fleet",
  "revenue",
  "test-agent",
]);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", allowed: ["POST"] });
  }

  try {
    // Parse body. Vercel Node runtime auto-parses JSON when Content-Type is
    // application/json, but be defensive against string-mode delivery.
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    // Accept BOTH `agent` (canonical, matches CreateDirectiveInput in
    // cowork-kanban/src/lib/acmi-client.ts) AND `addressed_agent` (raw curl
    // convenience, mentioned in 04-02 user prompt). camelCase + snake_case
    // both accepted on input; only camelCase emitted on output.
    const agent = typeof body.agent === "string"
      ? body.agent
      : (typeof body.addressed_agent === "string" ? body.addressed_agent : null);
    const { summary, payload, tags, parentCorrelationId } = body;

    if (!agent || typeof agent !== "string") {
      return res.status(400).json({ error: "agent (string) required — use 'agent' or 'addressed_agent' field" });
    }
    if (!VALID_AGENTS.has(agent)) {
      return res.status(400).json({
        error: `agent "${agent}" not in allowlist`,
        valid: [...VALID_AGENTS],
      });
    }
    if (!summary || typeof summary !== "string" || summary.trim().length === 0) {
      return res.status(400).json({ error: "summary (non-empty string) required" });
    }

    const { redis, sub } = req.acmiAuth;
    const idemKey = extractIdempotencyKey(req);

    const result = await checkIdempotency(redis, "directive", idemKey, async () => {
      const event = buildEvent({
        source: sub || "operator",
        kind: "directive",
        summary,
        payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : undefined,
        tags: Array.isArray(tags) ? tags : undefined,
        parentCorrelationId: typeof parentCorrelationId === "string" ? parentCorrelationId : undefined,
      });

      const threadKey = `acmi:thread:${agent}:timeline`;
      const agentKey = `acmi:agent:${agent}:timeline`;

      // Defensive try/catch per Phase 1 hotfix 8880f23 + Phase 4 hotfix ef471db.
      // Upstash REST throws on errors; primary timeline write is fatal if it
      // fails (we can't claim ok:true without it). Symmetry write is non-fatal
      // (logged but doesn't abort) — the agent fan-in surface tolerates gaps.
      try {
        await redis("ZADD", threadKey, String(event.ts), JSON.stringify(event));
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn(`[directive] ZADD ${threadKey} failed:`, msg);
        throw new Error(`failed to write to thread timeline: ${msg}`);
      }

      try {
        await redis("ZADD", agentKey, String(event.ts), JSON.stringify(event));
      } catch (e) {
        // Non-fatal: agent-fan-in mirror is best-effort; primary already persisted.
        const msg = e && e.message ? e.message : String(e);
        console.warn(`[directive] ZADD ${agentKey} failed (non-fatal):`, msg);
      }

      return {
        ok: true,
        correlationId: event.correlationId,
        event,
        written_to: [threadKey, agentKey],
      };
    });

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(result);
  } catch (e) {
    if (!res.headersSent) {
      const msg = e && e.message ? e.message : String(e);
      console.error("[directive] handler error:", msg);
      return res.status(500).json({ error: msg, where: "directive.handler" });
    }
    return undefined;
  }
}

export default withAuth(handler);
