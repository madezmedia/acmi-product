// GET /api/work
// Returns FLAT list of acmi:work:* items shaped for the Work Tracker view.
// Pulls profile + signals + last 10 timeline events per work-id from the
// live Upstash ACMI bus. No mock data — empty fields stay empty when keys
// return null. Sorted P0 first, then by most-recent activity.
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
const COMPLETE_PHASE_STATES = new Set(["SHIPPED", "LIVE", "DEPLOYED", "COMPLETE", "DONE"]);

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

// Count evidence keys/items inside an event payload.
function evidenceInPayload(payload) {
  if (!payload || typeof payload !== "object") return 0;
  const ev = payload.evidence;
  if (!ev) return 0;
  if (typeof ev === "number") return ev;
  if (Array.isArray(ev)) return ev.length;
  if (typeof ev === "object") return Object.keys(ev).length;
  return 0;
}

// Compute phase progress from the phases array on profile.
function phaseProgress(phases) {
  if (!Array.isArray(phases) || phases.length === 0) {
    return { total: 0, complete: 0, pct: 0 };
  }
  const total = phases.length;
  let complete = 0;
  for (const p of phases) {
    const st = (p?.status || "").toString().toUpperCase();
    if (COMPLETE_PHASE_STATES.has(st)) complete += 1;
  }
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  return { total, complete, pct };
}

function priorityKey(p) {
  const norm = (p || "").toString().toUpperCase();
  return PRIORITY_RANK[norm] ?? 99;
}

export default async function handler(req) {
  try {
    const instance = resolveInstance(req);

    const ids = (await redis(instance, "SMEMBERS", "acmi:work:list")) || [];
    if (ids.length === 0) {
      return json({
        ok: true,
        instance: instance.id,
        ts: Date.now(),
        count: 0,
        items: [],
        note: "no work items found",
      });
    }

    // Fetch profile + signals + last 10 timeline events for each id in parallel.
    const items = await Promise.all(ids.slice(0, 200).map(async (id) => {
      const [profileRaw, signalsRaw, timelineRaw] = await Promise.all([
        redis(instance, "GET", `acmi:work:${id}:profile`),
        redis(instance, "GET", `acmi:work:${id}:signals`),
        redis(instance, "ZREVRANGE", `acmi:work:${id}:timeline`, "0", "9", "WITHSCORES"),
      ]);
      const profile = tryParse(profileRaw) || {};
      const signals = tryParse(signalsRaw) || {};

      // Parse ZREVRANGE WITHSCORES output: [member1, score1, member2, score2, ...]
      const events = [];
      const scores = [];
      const tl = Array.isArray(timelineRaw) ? timelineRaw : [];
      for (let i = 0; i < tl.length; i += 2) {
        const ev = tryParse(tl[i]);
        const sc = Number(tl[i + 1]);
        if (ev && typeof ev === "object") {
          events.push(ev);
          scores.push(Number.isFinite(sc) ? sc : (ev.ts || 0));
        }
      }

      // Latest event = first (ZREVRANGE is desc). Earliest = last in this slice.
      const latest = events[0] || null;
      const latestScore = scores[0] || (latest && latest.ts) || 0;
      const earliestEvent = events[events.length - 1] || null;
      const earliestScore = scores[scores.length - 1] || (earliestEvent && earliestEvent.ts) || 0;

      // Evidence count = sum across recent timeline events.
      let evidenceCount = 0;
      for (const e of events) evidenceCount += evidenceInPayload(e.payload);

      const phases = phaseProgress(profile.phases);

      const ageTs = earliestScore || profile.created_ts || profile.created_at || 0;
      const ageIso = ageTs ? new Date(ageTs).toISOString() : null;

      const status = (profile.status || "").toString().toUpperCase() || "DRAFT";
      const priority = (profile.priority || "").toString().toUpperCase() || "P3";

      return {
        id,
        title: asString(profile.title || profile.name || id, id),
        status,
        priority,
        parent_id: asString(profile.parent_work_id || profile.parent_id, "") || null,
        description: truncate(profile.description || profile.summary || "", 200),
        owner: asString(profile.owner || profile.assignee || signals.owner, "—"),
        phases_total: phases.total,
        phases_complete: phases.complete,
        phase_progress_pct: phases.pct,
        signals,
        last_event_ts: latestScore || null,
        last_event_kind: latest ? asString(latest.kind, "") : null,
        last_event_summary: latest ? truncate(latest.summary || "", 200) : null,
        age_iso: ageIso,
        evidence_count: evidenceCount,
      };
    }));

    // Sort: P0 first by priority rank, then by last_event_ts desc.
    items.sort((a, b) => {
      const pa = priorityKey(a.priority);
      const pb = priorityKey(b.priority);
      if (pa !== pb) return pa - pb;
      return (b.last_event_ts || 0) - (a.last_event_ts || 0);
    });

    return json({
      ok: true,
      instance: instance.id,
      ts: Date.now(),
      count: items.length,
      items,
    }, { sMaxage: 5 });
  } catch (e) {
    return err(e.message);
  }
}
