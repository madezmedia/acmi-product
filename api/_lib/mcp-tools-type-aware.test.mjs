import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addListId,
  normTs,
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
        return item?.type === "list" ? item.value : [];
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
      case "ZRANGE":
      case "ZREVRANGE": {
        if (item?.type !== "zset") return [];
        const start = Number(args[1]) || 0;
        const stop = Number(args[2]) === -1 ? item.value.length - 1 : Number(args[2]) || 0;
        const withScores = args.map(String).some((arg) => arg.toUpperCase() === "WITHSCORES");
        const rows = [...item.value]
          .sort((a, b) => cmd === "ZREVRANGE" ? Number(b.score) - Number(a.score) : Number(a.score) - Number(b.score))
          .slice(start, stop + 1);
        return withScores ? rows.flatMap((row) => [row.member, String(row.score)]) : rows.map((row) => row.member);
      }
      case "ZRANGEBYSCORE": {
        if (item?.type !== "zset") return [];
        const min = Number(args[1]);
        const max = args[2] === "+inf" ? Infinity : Number(args[2]);
        const withScores = args.map(String).some((arg) => arg.toUpperCase() === "WITHSCORES");
        const rows = [...item.value]
          .filter((row) => Number(row.score) >= min && Number(row.score) <= max)
          .sort((a, b) => Number(a.score) - Number(b.score));
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

test("normTs normalizes seconds, microseconds, nanoseconds, and milliseconds", () => {
  assert.equal(normTs(1790861000), 1790861000000);
  assert.equal(normTs(1790861000123456), 1790861000123);
  assert.equal(normTs(1790861000123456789), 1790861000123);
  assert.equal(normTs(1790861000123), 1790861000123);
});

test("acmi_get recent events sort mixed score units by normalized timestamp", async () => {
  const redis = makeRedis({
    "acmi:thread:agent-coordination:profile": { type: "string", value: "{}" },
    "acmi:thread:agent-coordination:signals": { type: "string", value: "{}" },
    "acmi:thread:agent-coordination:timeline": {
      type: "zset",
      value: [
        {
          member: JSON.stringify({ ts: 1784562375594, summary: "old ns-scored July" }),
          score: 1784562375594000000,
        },
        {
          member: JSON.stringify({ ts: 1790861000000, summary: "fresh ms event" }),
          score: 1790861000000,
        },
      ],
    },
  });
  const tools = {};
  registerAcmiTools({
    tool(name, _description, _schema, handler) {
      tools[name] = handler;
    },
  }, redis);

  const result = parseToolResult(await tools.acmi_get({ namespace: "thread", id: "agent-coordination" }));
  assert.equal(result.timeline_recent[0].summary, "fresh ms event");
  assert.equal(result.timeline_recent[1].summary, "old ns-scored July");
});

test("acmi_cat since filters old ns-scored events after normalization", async () => {
  const now = Date.now;
  Date.now = () => 1790862000000;
  try {
    const redis = makeRedis({
      "acmi:thread:agent-coordination:timeline": {
        type: "zset",
        value: [
          {
            member: JSON.stringify({ ts: 1784562375594, kind: "old", summary: "old ns-scored July" }),
            score: 1784562375594000000,
          },
          {
            member: JSON.stringify({ ts: 1790861000000, kind: "fresh", summary: "fresh ms event" }),
            score: 1790861000000,
          },
        ],
      },
    });
    const tools = {};
    registerAcmiTools({
      tool(name, _description, _schema, handler) {
        tools[name] = handler;
      },
    }, redis);

    const result = parseToolResult(await tools.acmi_cat({
      keys: ["thread:agent-coordination"],
      since: "48h",
      limit: 10,
    }));
    assert.deepEqual(result.events.map((event) => event.summary), ["fresh ms event"]);
  } finally {
    Date.now = now;
  }
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
