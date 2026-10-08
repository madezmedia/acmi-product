import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addListId,
  readListIds,
  readObjectByType,
  registerAcmiTools,
} from "./mcp-tools.mjs";

function makeRedis(seed = {}) {
  const data = new Map(Object.entries(seed));
  const calls = [];

  async function redis(command, ...args) {
    const cmd = String(command).toUpperCase();
    calls.push([cmd, ...args]);
    const key = args[0];
    const item = data.get(key);

    switch (cmd) {
      case "TYPE":
        return item?.type || "none";
      case "GET":
        return item?.value ?? null;
      case "SET":
        data.set(key, { type: "string", value: args[1] });
        return "OK";
      case "SADD": {
        const current = item?.type === "set" ? new Set(item.value) : new Set();
        for (const value of args.slice(1)) current.add(String(value));
        data.set(key, { type: "set", value: current });
        return current.size;
      }
      case "SMEMBERS":
        return item?.type === "set" ? Array.from(item.value) : [];
      case "RPUSH": {
        const current = item?.type === "list" ? [...item.value] : [];
        current.push(...args.slice(1).map(String));
        data.set(key, { type: "list", value: current });
        return current.length;
      }
      case "LRANGE":
        if (item?.type !== "list") return [];
        return item.value.slice(Number(args[1]) || 0, Number(args[2]) === -1 ? undefined : Number(args[2]) + 1);
      case "HSET": {
        const current = item?.type === "hash" ? { ...item.value } : {};
        current[args[1]] = args[2];
        data.set(key, { type: "hash", value: current });
        return 1;
      }
      case "HDEL": {
        if (item?.type !== "hash") return 0;
        delete item.value[args[1]];
        return 1;
      }
      case "HGETALL": {
        if (item?.type !== "hash") return [];
        return Object.entries(item.value).flat();
      }
      case "KEYS": {
        const pattern = String(key).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        const re = new RegExp(`^${pattern}$`);
        return Array.from(data.keys()).filter((candidate) => re.test(candidate));
      }
      case "ZREVRANGE": {
        if (item?.type !== "zset") return [];
        const start = Number(args[1]) || 0;
        const stop = Number(args[2]) || 0;
        const withScores = args.map(String).some((arg) => arg.toUpperCase() === "WITHSCORES");
        const rows = [...item.value].sort((a, b) => Number(b.score) - Number(a.score)).slice(start, stop + 1);
        return withScores ? rows.flatMap((row) => [row.member, String(row.score)]) : rows.map((row) => row.member);
      }
      default:
        throw new Error(`unsupported fake redis command ${cmd}`);
    }
  }

  redis.data = data;
  redis.calls = calls;
  return redis;
}

function parseToolResult(result) {
  return JSON.parse(result.content[0].text);
}

test("addListId appends to JSON string list indexes without SADD WRONGTYPE", async () => {
  const redis = makeRedis({
    "acmi:work:list": { type: "string", value: JSON.stringify(["existing"]) },
  });

  await addListId(redis, "acmi:work:list", "new-work", { fieldNames: ["work_ids", "ids"] });

  assert.deepEqual(JSON.parse(redis.data.get("acmi:work:list").value), ["existing", "new-work"]);
  assert.equal(redis.calls.some(([cmd]) => cmd === "SADD"), false);
});

test("registered acmi_work_get reads legacy HASH objects and LIST timelines", async () => {
  const redis = makeRedis({
    "acmi:work:legacy:profile": { type: "hash", value: { title: "Legacy Work", status: "stalled" } },
    "acmi:work:legacy:signals": { type: "hash", value: { owner: "ops", status: "stalled" } },
    "acmi:work:legacy:timeline": {
      type: "list",
      value: [
        JSON.stringify({ ts: 123, kind: "note", summary: "legacy list event" }),
      ],
    },
  });
  const tools = {};
  registerAcmiTools({
    tool(name, _description, _schema, handler) {
      tools[name] = handler;
    },
  }, redis);

  const result = parseToolResult(await tools.acmi_work_get({ id: "legacy" }));
  assert.equal(result.profile.title, "Legacy Work");
  assert.equal(result.signals.owner, "ops");
  assert.equal(result.timeline[0].summary, "legacy list event");
  assert.deepEqual(result.read_warnings, []);
});

test("registered acmi_work_get returns warnings instead of failing on bad key types", async () => {
  const redis = makeRedis({
    "acmi:work:mixed:profile": { type: "set", value: new Set(["bad"]) },
    "acmi:work:mixed:signals": { type: "string", value: JSON.stringify({ status: "open" }) },
    "acmi:work:mixed:timeline": {
      type: "zset",
      value: [
        { member: JSON.stringify({ kind: "event", summary: "still readable" }), score: 456 },
      ],
    },
  });
  const tools = {};
  registerAcmiTools({
    tool(name, _description, _schema, handler) {
      tools[name] = handler;
    },
  }, redis);

  const result = parseToolResult(await tools.acmi_work_get({ id: "mixed" }));
  assert.equal(result.profile, null);
  assert.equal(result.signals.status, "open");
  assert.equal(result.timeline[0].ts, 456);
  assert.equal(result.timeline[0].summary, "still readable");
  assert.equal(result.read_warnings.length, 1);
  assert.match(result.read_warnings[0].message, /unsupported object key type/);
});

test("registered acmi_work_get reads legacy JSON string timelines", async () => {
  const redis = makeRedis({
    "acmi:work:string-timeline:profile": { type: "string", value: JSON.stringify({ title: "String Timeline" }) },
    "acmi:work:string-timeline:signals": { type: "string", value: JSON.stringify({ status: "open" }) },
    "acmi:work:string-timeline:timeline": {
      type: "string",
      value: JSON.stringify([{ ts: 789, kind: "note", summary: "timeline in a string" }]),
    },
  });
  const tools = {};
  registerAcmiTools({
    tool(name, _description, _schema, handler) {
      tools[name] = handler;
    },
  }, redis);

  const result = parseToolResult(await tools.acmi_work_get({ id: "string-timeline" }));
  assert.equal(result.profile.title, "String Timeline");
  assert.equal(result.timeline[0].ts, 789);
  assert.equal(result.timeline[0].summary, "timeline in a string");
  assert.deepEqual(result.read_warnings, []);
});

test("readListIds handles set/string/list/hash indexes and profile-key fallback", async () => {
  const redis = makeRedis({
    "acmi:agent:list": { type: "set", value: new Set(["set-id"]) },
    "acmi:agent:from-profile:profile": { type: "string", value: "{}" },
  });
  assert.deepEqual(
    await readListIds(redis, "acmi:agent:list", {
      namespace: "agent",
      profilePattern: "acmi:agent:*:profile",
    }),
    ["from-profile", "set-id"]
  );

  const stringRedis = makeRedis({
    "acmi:work:list": { type: "string", value: JSON.stringify({ work_ids: ["a", "b"] }) },
  });
  assert.deepEqual(
    await readListIds(stringRedis, "acmi:work:list", { fieldNames: ["work_ids", "ids"] }),
    ["a", "b"]
  );

  const listRedis = makeRedis({
    "acmi:work:list": { type: "list", value: ["c", "d"] },
  });
  assert.deepEqual(await readListIds(listRedis, "acmi:work:list"), ["c", "d"]);

  const hashRedis = makeRedis({
    "acmi:work:list": { type: "hash", value: { e: "1", f: "1" } },
  });
  assert.deepEqual(await readListIds(hashRedis, "acmi:work:list"), ["e", "f"]);
});

test("readObjectByType supports active_context stored as HASH or JSON string", async () => {
  const hashRedis = makeRedis({
    "acmi:agent:codex:active_context": {
      type: "hash",
      value: { "thread:agent-coordination": JSON.stringify({ role: "lead" }) },
    },
  });
  assert.deepEqual(await readObjectByType(hashRedis, "acmi:agent:codex:active_context"), {
    "thread:agent-coordination": { role: "lead" },
  });

  const stringRedis = makeRedis({
    "acmi:agent:codex:active_context": {
      type: "string",
      value: JSON.stringify({ "thread:agent-coordination": { role: "participant" } }),
    },
  });
  assert.deepEqual(await readObjectByType(stringRedis, "acmi:agent:codex:active_context"), {
    "thread:agent-coordination": { role: "participant" },
  });
});

test("registered acmi_work_list and acmi_bootstrap use TYPE-aware helpers", async () => {
  const redis = makeRedis({
    "acmi:work:list": { type: "string", value: JSON.stringify({ work_ids: ["indexed-work"] }) },
    "acmi:work:profile-only:profile": { type: "string", value: "{}" },
    "acmi:agent:codex:active_context": {
      type: "string",
      value: JSON.stringify({ "thread:agent-coordination": { role: "participant" } }),
    },
  });
  const tools = {};
  registerAcmiTools({
    tool(name, _description, _schema, handler) {
      tools[name] = handler;
    },
  }, redis);

  const workList = parseToolResult(await tools.acmi_work_list({}));
  assert.deepEqual(workList.work_ids, ["indexed-work", "profile-only"]);

  const bootstrap = parseToolResult(await tools.acmi_bootstrap({ agentId: "codex" }));
  assert.deepEqual(bootstrap.active_context, {
    "thread:agent-coordination": { role: "participant" },
  });
});
