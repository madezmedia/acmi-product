// GET /api/governance — Lobster Trap DPI proxy decision feed.
//
// Pulls policy-decision events from acmi:thread:lobstertrap-decisions:timeline
// (PR #27 — sub-agent A's DPI proxy). Every agent egress/ingress hit lands as
// a Comms v1.1 event with decision/risk_score/intent payload. This endpoint
// aggregates them for the governance-dashboard.html surface (Veea Award path).

import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

const THREAD_KEY = "acmi:thread:lobstertrap-decisions:timeline";

// Canonical decision set (matches Lobster Trap rule engine).
const DECISION_TYPES = ["ALLOW", "DENY", "HUMAN_REVIEW", "LOG", "RATE_LIMIT", "QUARANTINE"];

// Known frameworks we expect to appear as agent_source.
const KNOWN_SOURCES = ["langchain", "crewai", "gemini", "vapi-bridge", "researcher", "synthesizer", "publisher"];

function bucketSource(s) {
  if (!s) return "other";
  const k = String(s).toLowerCase();
  if (KNOWN_SOURCES.includes(k)) return k;
  // Map common aliases
  if (k.includes("langchain")) return "langchain";
  if (k.includes("crewai") || k.includes("crew-ai")) return "crewai";
  if (k.includes("gemini")) return "gemini";
  if (k.includes("vapi")) return "vapi-bridge";
  return "other";
}

export default async function handler(req) {
  try {
    const instance = resolveInstance(req);
    const url = new URL(req.url);
    const windowHours = Math.max(1, Math.min(72, parseInt(url.searchParams.get("hours") || "24", 10)));
    const since = Date.now() - windowHours * 3600 * 1000;

    const raw = await redis(instance, "ZRANGEBYSCORE", THREAD_KEY, String(since), "+inf", "WITHSCORES");

    const events = [];
    for (let i = 0; i < (raw || []).length; i += 2) {
      const parsed = tryParse(raw[i]);
      if (!parsed) continue;
      events.push({ ...parsed, _score: Number(raw[i + 1]) });
    }

    // Hero counters
    const counts = Object.fromEntries(DECISION_TYPES.map(d => [d, 0]));
    let mismatchCount = 0;
    let riskSum = 0;
    let riskN = 0;

    // By-source aggregation. Derive from KNOWN_SOURCES (top of file) + "other"
    // so the aggregation can never diverge from bucketSource(). Adding a source
    // to KNOWN_SOURCES is now the only edit needed when a new agent type emits.
    const sourceBuckets = [...KNOWN_SOURCES, "other"];
    const bySource = Object.fromEntries(sourceBuckets.map(s => [s, {
      source: s, total: 0, allow: 0, deny: 0, human_review: 0, log: 0,
      rate_limit: 0, quarantine: 0, mismatch: 0,
    }]));

    // By-pattern (from mismatches[].pattern or rule_name fallback)
    const byPattern = new Map();

    // By-rule
    const byRule = new Map();

    for (const ev of events) {
      const p = ev.payload || {};
      const decision = String(p.decision || "").toUpperCase();
      if (counts[decision] != null) counts[decision]++;

      const declared = p.declared_intent || "";
      const detected = p.detected_intent || "";
      const isMismatch = (Array.isArray(p.mismatches) && p.mismatches.length > 0)
        || (declared && detected && declared !== detected);
      if (isMismatch) mismatchCount++;

      if (typeof p.risk_score === "number" && !Number.isNaN(p.risk_score)) {
        riskSum += p.risk_score;
        riskN++;
      }

      const bucket = bucketSource(p.agent_source || ev.source);
      const sb = bySource[bucket];
      sb.total++;
      if (decision === "ALLOW") sb.allow++;
      else if (decision === "DENY") sb.deny++;
      else if (decision === "HUMAN_REVIEW") sb.human_review++;
      else if (decision === "LOG") sb.log++;
      else if (decision === "RATE_LIMIT") sb.rate_limit++;
      else if (decision === "QUARANTINE") sb.quarantine++;
      if (isMismatch) sb.mismatch++;

      // Pattern extraction
      if (Array.isArray(p.mismatches)) {
        for (const m of p.mismatches) {
          const pat = (typeof m === "string" ? m : (m?.pattern || m?.type || m?.name)) || null;
          if (pat) byPattern.set(pat, (byPattern.get(pat) || 0) + 1);
        }
      }

      if (p.rule_name) byRule.set(p.rule_name, (byRule.get(p.rule_name) || 0) + 1);
    }

    const allow = counts.ALLOW || 0;
    const deny = counts.DENY || 0;
    const blockRate = (allow + deny) > 0 ? Math.round((deny / (allow + deny)) * 1000) / 10 : 0;

    // Attach block_rate to each source row
    for (const s of sourceBuckets) {
      const row = bySource[s];
      row.block_rate_pct = (row.allow + row.deny) > 0
        ? Math.round((row.deny / (row.allow + row.deny)) * 1000) / 10
        : 0;
    }

    // Recent decisions (top 30 latest first)
    const recent = events
      .sort((a, b) => b._score - a._score)
      .slice(0, 30)
      .map(ev => ({
        ts: ev._score,
        id: ev.id || null,
        source: ev.source || null,
        kind: ev.kind || null,
        summary: typeof ev.summary === "string" ? ev.summary.slice(0, 220) : "",
        payload: ev.payload || {},
        correlationId: ev.correlationId || null,
      }));

    return json({
      ok: true,
      instance: instance.id,
      ts: Date.now(),
      window_hours: windowHours,
      since,
      thread_key: THREAD_KEY,
      hero: {
        total_decisions: events.length,
        allow_count: counts.ALLOW,
        deny_count: counts.DENY,
        human_review_count: counts.HUMAN_REVIEW,
        log_count: counts.LOG,
        rate_limit_count: counts.RATE_LIMIT,
        quarantine_count: counts.QUARANTINE,
        intent_mismatch_count: mismatchCount,
        block_rate_pct: blockRate,
        avg_risk_score: riskN > 0 ? Math.round((riskSum / riskN) * 1000) / 1000 : 0,
      },
      by_agent_source: Object.values(bySource).sort((a, b) => b.total - a.total),
      by_blocked_pattern: [...byPattern.entries()]
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      by_rule: [...byRule.entries()]
        .map(([rule, matched]) => ({ rule, matched }))
        .sort((a, b) => b.matched - a.matched)
        .slice(0, 10),
      recent_decisions: recent,
    }, { sMaxage: 5 });
  } catch (e) {
    return err(e.message);
  }
}
