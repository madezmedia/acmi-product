// GET /api/stories
// Returns acmi:work:* items grouped by .status enum from
// acmi:registry:work-status-vocab:v1 (DRAFT/READY/SHIPPED/DEPLOYED/LIVE).
// Items without a recognized status fall into DRAFT.
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

const FALLBACK_VOCAB = ["DRAFT", "READY", "SHIPPED", "DEPLOYED", "LIVE"];

function ageOf(ts) {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default async function handler(req) {
  try {
    const instance = resolveInstance(req);

    // Pull vocab, fall back if registry not yet ratified.
    const vocabRaw = await redis(instance, "GET", "acmi:registry:work-status-vocab:v1");
    const vocab = (tryParse(vocabRaw)?.enum) || FALLBACK_VOCAB;

    // Get all work items.
    const ids = (await redis(instance, "SMEMBERS", "acmi:work:list")) || [];
    if (ids.length === 0) {
      return json({ ok: true, instance: instance.id, vocab, columns: Object.fromEntries(vocab.map(v => [v, []])), count: 0, note: "no work items found" });
    }

    const items = [];
    for (const id of ids.slice(0, 200)) {
      const profileRaw = await redis(instance, "GET", `acmi:work:${id}:profile`);
      const profile = tryParse(profileRaw) || {};
      const status = (profile.status || "").toString().toUpperCase();
      const finalStatus = vocab.includes(status) ? status : "DRAFT";
      items.push({
        id,
        title: profile.title || profile.name || id,
        owner: profile.owner || profile.assignee || "—",
        age: ageOf(profile.created_ts || profile.ts),
        evidence: profile.evidence_count || profile.evidence || 0,
        fw: profile.framework || "ad",
        status: finalStatus,
        live: !!profile.live,
      });
    }

    const columns = Object.fromEntries(vocab.map(v => [v, []]));
    for (const it of items) columns[it.status].push(it);

    return json({ ok: true, instance: instance.id, vocab, columns, count: items.length, ts: Date.now() }, { sMaxage: 8 });
  } catch (e) {
    return err(e.message);
  }
}
