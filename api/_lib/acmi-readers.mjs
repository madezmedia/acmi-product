export function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function parseHashArray(arr) {
  const out = {};
  for (let i = 0; i < (arr || []).length; i += 2) {
    out[arr[i]] = parseMaybeJson(arr[i + 1]);
  }
  return out;
}

function addWarning(readWarnings, key, type, message) {
  readWarnings.push({ key, type, message });
}

export async function redisType(redis, key) {
  const type = await redis("TYPE", key);
  return String(type || "none").toLowerCase();
}

export async function readObjectByRedisType(redis, key, readWarnings = []) {
  try {
    const type = await redisType(redis, key);
    if (type === "none") return { value: null, type };
    if (type === "string") return { value: parseMaybeJson(await redis("GET", key)), type };
    if (type === "hash") return { value: parseHashArray(await redis("HGETALL", key)), type };
    addWarning(readWarnings, key, type, `unsupported object key type: ${type}`);
    return { value: null, type };
  } catch (e) {
    addWarning(readWarnings, key, "unknown", String(e.message || e));
    return { value: null, type: "unknown" };
  }
}

export function normalizeTimelineEvent(member, score = null) {
  const parsed = parseMaybeJson(member);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const event = { ...parsed };
    if (score !== null && event.ts === undefined) event.ts = Number(score);
    return event;
  }
  return {
    ts: score !== null ? Number(score) : 0,
    summary: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
  };
}

export async function readTimelineByRedisType(redis, key, {
  limit = 50,
  readWarnings = [],
} = {}) {
  try {
    const type = await redisType(redis, key);
    if (type === "none") return { events: [], scored: [], type };
    if (type === "zset") {
      const raw = await redis("ZREVRANGE", key, 0, Math.max(0, limit - 1), "WITHSCORES");
      const scored = [];
      for (let i = 0; i < (raw || []).length; i += 2) {
        const score = Number(raw[i + 1]);
        const event = normalizeTimelineEvent(raw[i], Number.isFinite(score) ? score : null);
        scored.push({ event, score: Number.isFinite(score) ? score : (Number(event.ts) || 0) });
      }
      return { events: scored.map((item) => item.event), scored, type };
    }
    if (type === "string") {
      const parsed = parseMaybeJson(await redis("GET", key));
      const members = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      const scored = members.slice(0, limit).map((member, index) => {
        const event = normalizeTimelineEvent(
          typeof member === "string" ? member : JSON.stringify(member),
          typeof member === "object" && member !== null && Number.isFinite(Number(member.ts))
            ? Number(member.ts)
            : index,
        );
        return { event, score: Number(event.ts) || 0 };
      });
      return { events: scored.map((item) => item.event), scored, type };
    }
    if (type === "list") {
      const raw = await redis("LRANGE", key, 0, Math.max(0, limit - 1));
      const scored = (raw || []).map((member) => {
        const event = normalizeTimelineEvent(member);
        return { event, score: Number(event.ts) || 0 };
      });
      return { events: scored.map((item) => item.event), scored, type };
    }
    addWarning(readWarnings, key, type, `unsupported timeline key type: ${type}`);
    return { events: [], scored: [], type };
  } catch (e) {
    addWarning(readWarnings, key, "unknown", String(e.message || e));
    return { events: [], scored: [], type: "unknown" };
  }
}

export async function readWorkItemByType(redis, id, { limit = 50 } = {}) {
  const prefix = `acmi:work:${id}`;
  const read_warnings = [];
  const [profileResult, signalsResult, timelineResult] = await Promise.all([
    readObjectByRedisType(redis, `${prefix}:profile`, read_warnings),
    readObjectByRedisType(redis, `${prefix}:signals`, read_warnings),
    readTimelineByRedisType(redis, `${prefix}:timeline`, { limit, readWarnings: read_warnings }),
  ]);
  return {
    id,
    profile: profileResult.value,
    signals: signalsResult.value,
    timeline: timelineResult.events,
    timeline_scored: timelineResult.scored,
    read_warnings,
    _types: {
      profile: profileResult.type,
      signals: signalsResult.type,
      timeline: timelineResult.type,
    },
  };
}
