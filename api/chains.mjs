// GET /api/chains
// Returns active correlationId chains in flight (last 30 minutes) shaped for
// swim-lane rendering. Pulls events from a fixed set of coordination threads
// via ZRANGEBYSCORE, groups by root correlationId (walking parentCorrelationId
// up to its origin), and returns up to 30 chains sorted by last_ts desc.
// Single-event chains are dropped UNLESS kind === "hitl-required".
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

const WINDOW_MINUTES = 30;
const MAX_CHAINS = 30;
const MAX_EVENTS_PER_CHAIN = 8;

const THREADS = [
  "agent-coordination",
  "demo-amd-chain",
  "bentley-pm",
];

function asString(v, fallback = "") {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function truncate(s, n) {
  const str = asString(s, "");
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

function isCompleteKind(kind) {
  const k = (kind || "").toLowerCase();
  return k.includes("complete") || k.includes("shipped") || k.includes("publish-output");
}

// Walk parentCorrelationId chain up to its root. Bounded to prevent cycles.
function resolveRoot(cid, parentMap) {
  let cur = cid;
  const seen = new Set();
  while (cur && parentMap.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const parent = parentMap.get(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return cur;
}

export default async function handler(req) {
  try {
    const instance = resolveInstance(req);
    const now = Date.now();
    const minScore = now - WINDOW_MINUTES * 60 * 1000;

    // Pull all events in window across coordination threads in parallel.
    const perThread = await Promise.all(THREADS.map(async (thread) => {
      const key = `acmi:thread:${thread}:timeline`;
      try {
        const raw = await redis(instance, "ZRANGEBYSCORE", key, String(minScore), String(now));
        const list = Array.isArray(raw) ? raw : [];
        return list.map(tryParse).filter(e => e && typeof e === "object").map(e => ({
          ts: e.ts || 0,
          source: asString(e.source, ""),
          kind: asString(e.kind, ""),
          cid: asString(e.correlationId, ""),
          parent_cid: asString(e.parentCorrelationId, ""),
          summary: asString(e.summary, ""),
          payload: e.payload || null,
          thread,
        }));
      } catch {
        return [];
      }
    }));

    const allEvents = perThread.flat().filter(e => e.cid);
    if (allEvents.length === 0) {
      return json({
        ok: true,
        instance: instance.id,
        ts: now,
        count: 0,
        window_minutes: WINDOW_MINUTES,
        chains: [],
      }, { sMaxage: 5 });
    }

    // Build parent map: cid -> parent_cid (only when parent is set).
    const parentMap = new Map();
    for (const e of allEvents) {
      if (e.parent_cid && !parentMap.has(e.cid)) {
        parentMap.set(e.cid, e.parent_cid);
      }
    }

    // Group events by their resolved root cid.
    const chains = new Map();
    for (const e of allEvents) {
      const root = resolveRoot(e.cid, parentMap) || e.cid;
      if (!chains.has(root)) {
        chains.set(root, {
          root_correlation_id: root,
          first_ts: e.ts,
          last_ts: e.ts,
          agents: new Set(),
          kinds: [],
          events: [],
          has_hitl: false,
        });
      }
      const c = chains.get(root);
      if (e.ts < c.first_ts) c.first_ts = e.ts;
      if (e.ts > c.last_ts) c.last_ts = e.ts;
      if (e.source) c.agents.add(e.source);
      if (e.kind) c.kinds.push(e.kind);
      if ((e.kind || "").toLowerCase() === "hitl-required") c.has_hitl = true;
      c.events.push(e);
    }

    // Shape, filter, sort.
    const shaped = [];
    for (const c of chains.values()) {
      const eventCount = c.events.length;
      // Drop single-event chains unless they include a hitl-required event.
      if (eventCount < 2 && !c.has_hitl) continue;

      const sorted = c.events.slice().sort((a, b) => a.ts - b.ts);
      const last = sorted[sorted.length - 1];
      const kindsOrdered = sorted.map(e => e.kind).filter(Boolean);

      shaped.push({
        root_correlation_id: c.root_correlation_id,
        first_ts: c.first_ts,
        last_ts: c.last_ts,
        duration_ms: c.last_ts - c.first_ts,
        agents_involved: Array.from(c.agents),
        kinds: kindsOrdered,
        event_count: eventCount,
        is_complete: isCompleteKind(last && last.kind),
        last_event_summary: truncate(last && last.summary, 200),
        events: sorted.slice(-MAX_EVENTS_PER_CHAIN).map(e => ({
          ts: e.ts,
          agent: e.source,
          kind: e.kind,
          summary: truncate(e.summary, 160),
        })),
      });
    }

    shaped.sort((a, b) => b.last_ts - a.last_ts);
    const top = shaped.slice(0, MAX_CHAINS);

    return json({
      ok: true,
      instance: instance.id,
      ts: now,
      count: top.length,
      window_minutes: WINDOW_MINUTES,
      chains: top,
    }, { sMaxage: 5 });
  } catch (e) {
    return err(e.message);
  }
}
