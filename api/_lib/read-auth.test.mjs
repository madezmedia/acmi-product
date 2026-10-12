import { test } from "node:test";
import assert from "node:assert/strict";
import {
  READ_BEARER_ENV,
  authorizeFleetRead,
  constantTimeEqual,
  extractBearer,
  withFleetRead,
} from "./read-auth.mjs";
import fleetHandler from "../fleet.mjs";
import commsHandler from "../comms.mjs";
import workHandler from "../work.mjs";
import hitlHandler from "../hitl.mjs";
import eventsHandler from "../events.mjs";
import chainsHandler from "../chains.mjs";
import chainHandler from "../chain.mjs";
import storiesHandler from "../stories.mjs";
import gpuHandler from "../gpu.mjs";
import governanceHandler from "../governance.mjs";
import agentHandler from "../agent/[id].mjs";

const SECRET = "fleet-read-test-secret-value";
const WRONG = "fleet-read-test-secret-WRONG";

const EDGE_HANDLERS = [
  ["/api/fleet", fleetHandler],
  ["/api/comms", commsHandler],
  ["/api/work", workHandler],
  ["/api/events", eventsHandler],
  ["/api/chains", chainsHandler],
  ["/api/chain", chainHandler],
  ["/api/stories", storiesHandler],
  ["/api/gpu", gpuHandler],
  ["/api/governance", governanceHandler],
  ["/api/agent/bob", agentHandler],
];

function edgeReq(path, headers = {}, method = "GET") {
  return new Request("https://acmi-product.vercel.app" + path, { method, headers });
}

function nodeReq(method, path, headers = {}) {
  return {
    method,
    url: "https://acmi-product.vercel.app" + path,
    headers,
  };
}

function nodeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function readJson(res) {
  return JSON.parse(await res.text());
}

function withSecret(value, fn) {
  const previous = process.env[READ_BEARER_ENV];
  if (value === undefined) delete process.env[READ_BEARER_ENV];
  else process.env[READ_BEARER_ENV] = value;
  const restore = () => {
    if (previous === undefined) delete process.env[READ_BEARER_ENV];
    else process.env[READ_BEARER_ENV] = previous;
  };
  const out = fn();
  if (out && typeof out.then === "function") return out.finally(restore);
  restore();
  return out;
}

test("constantTimeEqual matches equal secrets and rejects empty or different lengths", () => {
  assert.equal(constantTimeEqual(SECRET, SECRET), true);
  assert.equal(constantTimeEqual(SECRET, WRONG), false);
  assert.equal(constantTimeEqual(SECRET, SECRET + "x"), false);
  assert.equal(constantTimeEqual("", ""), false);
  assert.equal(constantTimeEqual(SECRET, ""), false);
  assert.equal(constantTimeEqual("aa", "ab"), false);
});

test("extractBearer ignores query tokens and non-bearer schemes", () => {
  const req = edgeReq("/api/fleet?access_token=" + SECRET, { Authorization: "Basic " + SECRET });
  assert.equal(extractBearer(req), null);
  assert.equal(extractBearer(edgeReq("/api/fleet", { Authorization: "Bearer " + SECRET })), SECRET);
  assert.equal(extractBearer({ headers: { authorization: ["Bearer " + SECRET] } }), SECRET);
});

test("authorizeFleetRead: missing server secret fails closed even with a bearer", () => {
  withSecret(undefined, () => {
    const decision = authorizeFleetRead(edgeReq("/api/fleet", { Authorization: "Bearer " + SECRET }));
    assert.equal(decision.ok, false);
    assert.equal(decision.status, 401);
    assert.equal(decision.reason, "read_auth_unconfigured");
  });
  withSecret("   ", () => {
    const decision = authorizeFleetRead(edgeReq("/api/fleet", { Authorization: "Bearer " + SECRET }));
    assert.equal(decision.reason, "read_auth_unconfigured");
  });
});

test("authorizeFleetRead: no credential, wrong credential, valid credential", () => {
  withSecret(SECRET, () => {
    const missing = authorizeFleetRead(edgeReq("/api/fleet"));
    assert.equal(missing.reason, "missing_bearer");
    const wrong = authorizeFleetRead(edgeReq("/api/fleet", { Authorization: "Bearer " + WRONG }));
    assert.equal(wrong.reason, "invalid_bearer");
    const ok = authorizeFleetRead(edgeReq("/api/fleet", { Authorization: "Bearer " + SECRET }));
    assert.equal(ok.ok, true);
  });
});

test("gated edge reads: four auth cases, no secret in the body, no redis call when denied", async () => {
  let fetches = 0;
  const original = global.fetch;
  global.fetch = async () => {
    fetches += 1;
    return {
      ok: true,
      json: async () => ({ result: [] }),
    };
  };
  const logs = [];
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;
  console.warn = (...args) => logs.push(args.join(" "));
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
  try {
    await withSecret(undefined, async () => {
      for (const [path, handler] of EDGE_HANDLERS) {
        const res = await handler(edgeReq(path, { Authorization: "Bearer " + SECRET }));
        assert.equal(res.status, 401, path);
        const body = await readJson(res);
        assert.equal(body.reason, "read_auth_unconfigured", path);
        assert.equal(JSON.stringify(body).includes(SECRET), false, path);
        assert.equal(res.headers.get("cache-control"), "private, no-store", path);
      }
      assert.equal(fetches, 0);
    });

    await withSecret(SECRET, async () => {
      for (const [path, handler] of EDGE_HANDLERS) {
        const missing = await handler(edgeReq(path));
        assert.equal(missing.status, 401, path + " missing");
        assert.equal((await readJson(missing)).reason, "missing_bearer");

        const wrong = await handler(edgeReq(path, { Authorization: "Bearer " + WRONG }));
        assert.equal(wrong.status, 401, path + " wrong");
        const wrongBody = await readJson(wrong);
        assert.equal(wrongBody.reason, "invalid_bearer");
        assert.equal(JSON.stringify(wrongBody).includes(SECRET), false);
        assert.equal(JSON.stringify(wrongBody).includes(WRONG), false);
      }
      assert.equal(fetches, 0);

      const ok = await fleetHandler(edgeReq("/api/fleet", { Authorization: "Bearer " + SECRET }));
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get("cache-control"), "private, no-store");
      const body = await readJson(ok);
      assert.equal(body.ok, true);
      assert.equal(body.fleet, null);
      assert.ok(fetches > 0);

      const preflight = await fleetHandler(edgeReq("/api/fleet", {}, "OPTIONS"));
      assert.equal(preflight.status, 204);
    });
  } finally {
    global.fetch = original;
    console.warn = originalWarn;
    console.log = originalLog;
    console.error = originalError;
    if (url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = url;
    if (token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = token;
  }
  const leaked = logs.join("\n");
  assert.equal(leaked.includes(SECRET), false);
  assert.equal(leaked.includes(WRONG), false);
});

test("GET /api/hitl uses the same fail-closed gate; POST stays on the write bearer", async () => {
  await withSecret(undefined, async () => {
    const res = nodeRes();
    await hitlHandler(nodeReq("GET", "/api/hitl", { authorization: "Bearer " + SECRET }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.reason, "read_auth_unconfigured");
    assert.equal(JSON.stringify(res.body).includes(SECRET), false);
  });

  await withSecret(SECRET, async () => {
    const missing = nodeRes();
    await hitlHandler(nodeReq("GET", "/api/hitl"), missing);
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.body.reason, "missing_bearer");

    const wrong = nodeRes();
    await hitlHandler(nodeReq("GET", "/api/hitl", { authorization: "Bearer " + WRONG }), wrong);
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.body.reason, "invalid_bearer");

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
    const original = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ result: [] }) });
    try {
      const ok = nodeRes();
      await hitlHandler(
        nodeReq("GET", "/api/hitl?for=mikey", { host: "acmi-product.vercel.app", authorization: "Bearer " + SECRET }),
        ok
      );
      assert.equal(ok.statusCode, 200);
      assert.equal(ok.body.ok, true);
      assert.equal(ok.headers["Cache-Control"], "private, no-store");
    } finally {
      global.fetch = original;
      if (url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = url;
      if (token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = token;
    }

    const post = nodeRes();
    await hitlHandler(nodeReq("POST", "/api/hitl", { authorization: "Bearer " + SECRET }), post);
    assert.equal(post.statusCode, 401);
    assert.notEqual(post.body.reason, "missing_bearer");
    assert.equal(post.body.reason, undefined);
    assert.equal(typeof post.body.error, "string");
  });
});

test("withFleetRead does not invoke the handler when the secret is unset", async () => {
  let called = 0;
  const gated = withFleetRead(async () => {
    called += 1;
    return new Response("nope");
  });
  await withSecret(undefined, async () => {
    const res = await gated(edgeReq("/api/fleet", { Authorization: "Bearer " + SECRET }));
    assert.equal(res.status, 401);
    assert.equal(called, 0);
  });
});
