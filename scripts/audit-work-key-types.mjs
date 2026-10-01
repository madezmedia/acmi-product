#!/usr/bin/env node
import { restEndpoint } from "../api/_lib/redis.mjs";

const TARGET_WORK_IDS = [
  "workspace-cleanup-2026-05-12",
  "fleet-cloudflare-expert",
  "client-signals-update",
  "avery-rei-scaffold-20260714",
  "avery-rei-scaffold",
];

const migrate = process.argv.includes("--migrate");
const url = restEndpoint(process.env.ACMI_BRIDGE_URL || process.env.UPSTASH_REDIS_REST_URL || "");
const token = process.env.ACMI_BRIDGE_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

if (!url || !token) {
  console.error("Missing ACMI_BRIDGE_URL/ACMI_BRIDGE_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

async function redis(...cmd) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Redis REST ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Redis REST: ${data.error}`);
  return data.result;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function hashToObject(arr) {
  const out = {};
  for (let i = 0; i < (arr || []).length; i += 2) {
    out[arr[i]] = parseMaybeJson(arr[i + 1]);
  }
  return out;
}

function normalizeEvent(member, fallbackTs = Date.now()) {
  const parsed = parseMaybeJson(member);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const event = { ...parsed };
    if (!Number.isFinite(Number(event.ts))) event.ts = fallbackTs;
    return event;
  }
  return { ts: fallbackTs, summary: String(parsed ?? "") };
}

async function typeOf(key) {
  return String(await redis("TYPE", key) || "none").toLowerCase();
}

async function migrateObjectKey(key, type) {
  if (type === "string" || type === "none") return { changed: false, reason: "already-standard" };
  if (type !== "hash") return { changed: false, reason: `unsupported-object-type:${type}` };
  const object = hashToObject(await redis("HGETALL", key));
  await redis("DEL", key);
  await redis("SET", key, JSON.stringify(object));
  return { changed: true, from: type, to: "string" };
}

async function migrateTimelineKey(key, type) {
  if (type === "zset" || type === "none") return { changed: false, reason: "already-standard" };
  let raw;
  if (type === "list") {
    raw = await redis("LRANGE", key, 0, -1);
  } else if (type === "string") {
    const parsed = parseMaybeJson(await redis("GET", key));
    raw = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } else {
    return { changed: false, reason: `unsupported-timeline-type:${type}` };
  }
  const events = (raw || []).map((member, index) => normalizeEvent(member, Date.now() + index));
  await redis("DEL", key);
  for (const event of events) {
    await redis("ZADD", key, String(Number(event.ts) || Date.now()), JSON.stringify(event));
  }
  return { changed: true, from: type, to: "zset", events: events.length };
}

const report = {
  ok: true,
  mode: migrate ? "migrate" : "dry-run",
  migrated: false,
  checked_at: new Date().toISOString(),
  work_ids: [],
};

for (const id of TARGET_WORK_IDS) {
  const families = [
    { label: "legacy", base: `acmi:work:${id}` },
    { label: "madez", base: `acmi:madez:work:${id}` },
  ];
  const item = { id, families: [] };
  for (const family of families) {
    const keys = {
      profile: `${family.base}:profile`,
      signals: `${family.base}:signals`,
      timeline: `${family.base}:timeline`,
    };
    const types = {
      profile: await typeOf(keys.profile),
      signals: await typeOf(keys.signals),
      timeline: await typeOf(keys.timeline),
    };
    const familyReport = { label: family.label, keys, types };
    if (migrate) {
      familyReport.migration = {
        profile: await migrateObjectKey(keys.profile, types.profile),
        signals: await migrateObjectKey(keys.signals, types.signals),
        timeline: await migrateTimelineKey(keys.timeline, types.timeline),
      };
      report.migrated = true;
    }
    item.families.push(familyReport);
  }
  report.work_ids.push(item);
}

console.log(JSON.stringify(report, null, 2));
