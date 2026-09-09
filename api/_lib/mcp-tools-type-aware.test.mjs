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
      case "ZREVRANGE":
        return [];
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
