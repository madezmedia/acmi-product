// GET /api/gpu — MI300X multi-framework agent traffic snapshot.
//
// Mirrors the HF Space (madezmedia-acmi-timeline-browser) loop pattern:
// hero stats / by-framework / by-source / by-kind / featured chain.
// Source: acmi:thread:demo-amd-chain:timeline — the live GPU bus where
// LangChain + CrewAI + plain-JS researcher/synthesizer/publisher land
// their events while running against the MI300X.

import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

// 6 framework lanes (matches HF Space):
//   trigger      — cron-fired research-requests
//   langchain    — LangChain agent runs
//   crewai       — CrewAI agent runs
//   researcher   — plain-JS researcher
//   synthesizer  — plain-JS synthesizer
//   publisher    — plain-JS publisher
const FRAMEWORK_LANES = [
  { key: "trigger",     label: "Trigger",      sources: ["mikey", "trigger", "demo-trigger", "cron"], kinds: ["research-request", "trigger"] },
  { key: "langchain",   label: "LangChain",    sources: ["langchain", "langchain-agent"], kinds: [] },
  { key: "crewai",      label: "CrewAI",       sources: ["crewai", "crewai-agent"], kinds: [] },
  { key: "researcher",  label: "Researcher (JS)", sources: ["researcher"], kinds: [] },
  { key: "synthesizer", label: "Synthesizer (JS)", sources: ["synthesizer"], kinds: [] },
  { key: "publisher",   label: "Publisher (JS)",  sources: ["publisher"], kinds: [] },
];

function classifyFramework(source, kind) {
  for (const lane of FRAMEWORK_LANES) {
    if (lane.sources.includes(source)) return lane.key;
    if (lane.kinds.includes(kind)) return lane.key;
  }
  return "other";
}

export default async function handler(req) {
  try {
    const instance = resolveInstance(req);
    const url = new URL(req.url);
    const windowHours = Math.max(1, Math.min(72, parseInt(url.searchParams.get("hours") || "24", 10)));
    const since = Date.now() - windowHours * 3600 * 1000;

    const raw = await redis(instance, "ZRANGEBYSCORE", "acmi:thread:demo-amd-chain:timeline", String(since), "+inf", "WITHSCORES");

    const events = [];
    for (let i = 0; i < (raw || []).length; i += 2) {
      const parsed = tryParse(raw[i]);
      if (!parsed) continue;
      events.push({ ...parsed, _score: Number(raw[i + 1]) });
    }

    const totalEvents = events.length;

    // By-framework counts (canonical 6 lanes + "other")
    const byFramework = Object.fromEntries(FRAMEWORK_LANES.map(l => [l.key, 0]));
    byFramework.other = 0;

    // By-source raw counts
    const bySource = {};

    // By-kind counts
    const byKind = {};

    // Chains keyed by correlationId
    const chainsMap = new Map();

    for (const ev of events) {
      const fw = classifyFramework(ev.source, ev.kind);
      byFramework[fw] = (byFramework[fw] || 0) + 1;

      bySource[ev.source || "?"] = (bySource[ev.source || "?"] || 0) + 1;
      byKind[ev.kind || "?"] = (byKind[ev.kind || "?"] || 0) + 1;

      const cid = ev.correlationId || "(no-cid)";
      let chain = chainsMap.get(cid);
      if (!chain) {
        chain = {
          correlationId: cid,
          first_ts: ev._score,
          last_ts: ev._score,
          frameworks: new Set(),
          sources: new Set(),
          kinds: new Set(),
          event_count: 0,
          last_summary: ev.summary,
          last_kind: ev.kind,
          first_source: ev.source,
        };
        chainsMap.set(cid, chain);
      }
      chain.first_ts = Math.min(chain.first_ts, ev._score);
      if (ev._score > chain.last_ts) {
        chain.last_ts = ev._score;
        chain.last_summary = ev.summary;
        chain.last_kind = ev.kind;
      }
      chain.frameworks.add(fw);
      chain.sources.add(ev.source || "?");
      chain.kinds.add(ev.kind || "?");
      chain.event_count++;
    }

    // Sort framework lanes by canonical order, attach metadata.
    const frameworkLanes = FRAMEWORK_LANES.map(l => ({
      key: l.key,
      label: l.label,
      count: byFramework[l.key] || 0,
      pct: totalEvents > 0 ? Math.round(((byFramework[l.key] || 0) / totalEvents) * 100) : 0,
    }));

    // Top chains by recency, ≤12 cards (matches HF Space featured-chain density).
    const chains = [...chainsMap.values()]
      .map(c => ({
        correlation_id: c.correlationId,
        first_ts: c.first_ts,
        last_ts: c.last_ts,
        duration_ms: c.last_ts - c.first_ts,
        event_count: c.event_count,
        frameworks: [...c.frameworks].sort(),
        sources: [...c.sources].sort(),
        kinds: [...c.kinds].sort(),
        last_kind: c.last_kind,
        last_summary: typeof c.last_summary === "string" ? c.last_summary.slice(0, 220) : "",
        first_source: c.first_source,
      }))
      .sort((a, b) => b.last_ts - a.last_ts)
      .slice(0, 12);

    // Hero stats
    const uniqueChains = chainsMap.size;
    const activeFrameworks = frameworkLanes.filter(l => l.count > 0).length;
    const completedChains = chains.filter(c =>
      c.kinds.some(k => /(complete|published|publish-output|shipped|done)/i.test(k))
    ).length;

    return json({
      ok: true,
      instance: instance.id,
      ts: Date.now(),
      window_hours: windowHours,
      since,
      hero: {
        total_events: totalEvents,
        unique_chains: uniqueChains,
        active_frameworks: activeFrameworks,
        completed_chains: completedChains,
        events_per_hour: windowHours > 0 ? Math.round(totalEvents / windowHours) : 0,
      },
      framework_lanes: frameworkLanes,
      by_source: Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ source: k, count: v })),
      by_kind: Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ kind: k, count: v })),
      chains,
      thread_key: "acmi:thread:demo-amd-chain:timeline",
      gpu_endpoint: "http://134.199.197.100:8000/v1",
    }, { sMaxage: 5 });
  } catch (e) {
    return err(e.message);
  }
}
