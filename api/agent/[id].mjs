// GET /api/agent/<id> — full detail bundle for one agent.
// Returns: profile, signals, timeline (last 50), spawns (last 10),
// active_context (HASH), rollup_latest. Matches what acmi_bootstrap returns.
import { resolveInstance, redis, tryParse, json, err } from "../_lib/redis.mjs";

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    // Edge dynamic routes pass id via the path; for portability we also
    // accept ?id= as a fallback.
    const id = url.pathname.split("/").pop().replace(".mjs", "")
      || url.searchParams.get("id");
    if (!id || id === "[id]") return err("missing agent id", 400);

    const instance = resolveInstance(req);
    const prefix = `acmi:agent:${id}`;

    const [profile, signals, timeline, spawns, active, rollup] = await Promise.all([
      redis(instance, "GET", `${prefix}:profile`),
      redis(instance, "GET", `${prefix}:signals`),
      redis(instance, "ZREVRANGE", `${prefix}:timeline`, "0", "49"),
      redis(instance, "ZREVRANGE", `${prefix}:spawns`, "0", "9", "WITHSCORES"),
      redis(instance, "HGETALL", `${prefix}:active_context`),
      redis(instance, "GET", `${prefix}:rollup:latest`),
    ]);

    const parsedTimeline = (timeline || []).map(tryParse);

    const parsedSpawns = [];
    for (let i = 0; i < (spawns || []).length; i += 2) {
      parsedSpawns.push({ ts: Number(spawns[i + 1]), data: tryParse(spawns[i]) });
    }

    const parsedActive = {};
    for (let i = 0; i < (active || []).length; i += 2) {
      parsedActive[active[i]] = tryParse(active[i + 1]);
    }

    if (!profile && !signals && parsedTimeline.length === 0) {
      return err(`agent "${id}" not found`, 404);
    }

    return json({
      ok: true,
      instance: instance.id,
      agent_id: id,
      profile: tryParse(profile),
      signals: tryParse(signals),
      timeline: parsedTimeline,
      spawns: parsedSpawns,
      active_context: parsedActive,
      rollup_latest: tryParse(rollup),
      ts: Date.now(),
    }, { sMaxage: 5 });
  } catch (e) {
    return err(e.message);
  }
}
