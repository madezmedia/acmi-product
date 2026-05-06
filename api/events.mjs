// GET /api/events?since=<ts>&limit=50
// Tail-style fan-in across active agent timelines.
// Polling-based (Upstash REST has no native push). Client polls every 1-3s.
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

const FW_SUFFIX_FROM_FRAMEWORK = {
  langgraph: "lg", crewai: "cr", agno: "ag", autogen: "ad",
};

function shortKind(rawKind) {
  if (!rawKind) return "emit";
  const k = rawKind.toLowerCase();
  if (/(error|failed|err)/.test(k)) return "err";
  if (/(hitl|gate|approval)/.test(k)) return "gate";
  if (/(tool|fetch|search|query)/.test(k)) return "tool";
  if (/(state|transition|status)/.test(k)) return "state";
  return "emit";
}

function toneFor(kind) {
  if (kind === "err") return "err";
  if (kind === "gate") return "warn";
  return "ok";
}

function timeStamp(ts) {
  const d = new Date(ts || Date.now());
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const since = parseInt(url.searchParams.get("since") || "0", 10);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

    const instance = resolveInstance(req);

    // Discover active agent timelines (cap at 30 to keep edge response under budget).
    const agentKeys = (await redis(instance, "KEYS", "acmi:agent:*:timeline")) || [];
    const sample = agentKeys.slice(0, 30);

    // Fan-in: ZRANGEBYSCORE since min, latest 10 from each.
    const minScore = since > 0 ? since : Date.now() - 6 * 60 * 60 * 1000;
    const merged = [];
    for (const key of sample) {
      const raw = (await redis(instance, "ZRANGEBYSCORE", key, String(minScore), "+inf", "LIMIT", "0", "10")) || [];
      for (const item of raw) {
        const ev = tryParse(item);
        if (!ev || typeof ev !== "object") continue;
        const agentId = key.split(":")[2];
        const fw = FW_SUFFIX_FROM_FRAMEWORK[ev.framework || ""] || "ad";
        const k = shortKind(ev.kind);
        merged.push({
          t: timeStamp(ev.ts),
          ts: ev.ts || 0,
          a: ev.source || agentId,
          kind: k,
          text: (ev.summary || JSON.stringify(ev.payload || {})).slice(0, 140),
          fw,
          tone: toneFor(k),
          _key: key,
        });
      }
    }

    merged.sort((a, b) => b.ts - a.ts);
    const events = merged.slice(0, limit);

    return json({
      ok: true,
      instance: instance.id,
      polled_keys: sample.length,
      since,
      next_since: events.length > 0 ? events[0].ts + 1 : Date.now(),
      count: events.length,
      events,
      ts: Date.now(),
    }, { sMaxage: 1 });
  } catch (e) {
    return err(e.message);
  }
}
