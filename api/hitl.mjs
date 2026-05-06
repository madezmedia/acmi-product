// GET /api/hitl?for=mikey&limit=20
// Returns HITL queue items for a user.
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const user = (url.searchParams.get("for") || "mikey").replace(/[^a-z0-9_-]/gi, "");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);

    const instance = resolveInstance(req);
    const key = `acmi:user:${user}:hitl-queue`;
    const raw = (await redis(instance, "ZREVRANGE", key, "0", String(limit - 1))) || [];
    const items = raw.map(tryParse).filter(e => e && typeof e === "object");

    // Bucket: pending (no resolved sibling) vs resolved.
    const resolvedCids = new Set(items.filter(e => /resolved|cleared/.test(e.kind || "")).map(e => e.correlationId).filter(Boolean));
    const pending = items.filter(e => /required|pending|escalate/.test(e.kind || "") && !resolvedCids.has(e.correlationId));
    const resolved = items.filter(e => /resolved|cleared/.test(e.kind || ""));

    return json({
      ok: true,
      instance: instance.id,
      user,
      key,
      count_total: items.length,
      count_pending: pending.length,
      count_resolved: resolved.length,
      pending,
      resolved,
      ts: Date.now(),
    }, { sMaxage: 5 });
  } catch (e) {
    return err(e.message);
  }
}
