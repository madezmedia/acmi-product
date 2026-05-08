// GET /api/chain?thread=demo-amd-chain&limit=20
// Returns recent demo chain events from acmi:thread:<thread>:timeline,
// enriched with model + latency + tokens metadata extracted from each
// event's payload.inference (when present). Used by ops-center.html
// "MI300X Live" panel for AMD demo recording.
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

const ALLOWED = new Set([
  "demo-amd-chain",
  "agent-coordination",
]);

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const thread = (url.searchParams.get("thread") || "demo-amd-chain").replace(/[^a-z0-9_-]/gi, "");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
    if (!ALLOWED.has(thread)) {
      return err(`thread "${thread}" not in allowlist`, 400);
    }

    const instance = resolveInstance(req);
    const key = `acmi:thread:${thread}:timeline`;
    const raw = (await redis(instance, "ZREVRANGE", key, "0", String(limit - 1))) || [];
    const events = raw.map(tryParse).filter(e => e && typeof e === "object").map(e => {
      const inf = e.payload && e.payload.inference;
      return {
        ts: e.ts,
        source: e.source,
        kind: e.kind,
        cid: e.correlationId,
        summary: e.summary,
        model: (e.payload && e.payload.model) || (inf && inf.model_id) || null,
        tokens_in: inf && inf.tokens_in,
        tokens_out: inf && inf.tokens_out,
        latency_ms: inf && inf.ollama_latency_ms,
      };
    });

    // Group by cid to surface chain progress
    const chains = {};
    for (const e of events) {
      if (!e.cid) continue;
      if (!chains[e.cid]) chains[e.cid] = { cid: e.cid, events: [], started_ts: e.ts };
      chains[e.cid].events.push(e);
      if (e.ts < chains[e.cid].started_ts) chains[e.cid].started_ts = e.ts;
    }
    const chainList = Object.values(chains)
      .map(c => ({
        cid: c.cid,
        started_ts: c.started_ts,
        steps: c.events.sort((a, b) => a.ts - b.ts),
        status: c.events.find(e => e.kind === "publish-output") ? "complete"
              : c.events.find(e => e.kind === "synthesis-output") ? "publishing"
              : c.events.find(e => e.kind === "research-output") ? "synthesizing"
              : "researching",
        wall_clock_ms: c.events.length > 1 ? c.events[c.events.length - 1].ts - c.started_ts : null,
      }))
      .sort((a, b) => b.started_ts - a.started_ts);

    return json({
      ok: true,
      instance: instance.id,
      thread,
      key,
      event_count: events.length,
      chain_count: chainList.length,
      events,
      chains: chainList.slice(0, 10),
      ts: Date.now(),
    }, { sMaxage: 3 });
  } catch (e) {
    return err(e.message);
  }
}
