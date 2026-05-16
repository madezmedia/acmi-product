// GET /api/comms?thread=<thread-name>&limit=50
// Returns timeline events from acmi:thread:<name>:timeline, parsed.
// Default thread: agent-coordination.
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

const ALLOWED_THREADS = new Set([
  "agent-coordination",
  "bentley-pm",
  "claude-daily-driver",
  "newsroom",
  "cloud-handoffs",
  "daily-agents-fleet",
  "lobster-trap-fleet-guardian",
]);

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const thread = (url.searchParams.get("thread") || "agent-coordination").replace(/[^a-z0-9_-]/gi, "");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

    if (!ALLOWED_THREADS.has(thread)) {
      return err(`thread "${thread}" not in allowlist`, 400);
    }

    const instance = resolveInstance(req);
    const key = `acmi:thread:${thread}:timeline`;
    const raw = (await redis(instance, "ZREVRANGE", key, "0", String(limit - 1))) || [];
    const events = raw.map(tryParse).filter(e => e && typeof e === "object");

    return json({
      ok: true,
      instance: instance.id,
      thread,
      key,
      count: events.length,
      events,
      ts: Date.now(),
    }, { sMaxage: 5 });
  } catch (e) {
    return err(e.message);
  }
}
