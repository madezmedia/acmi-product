import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import handler, {
  verifyWhopSignature,
} from "./whop-webhook.mjs";

function makeStandardHeaders(rawBody, secret, {
  id = "msg_test",
  timestamp = Math.floor(Date.now() / 1000),
  key = Buffer.from(secret, "utf8"),
} = {}) {
  const signed = `${id}.${timestamp}.${rawBody}`;
  const sig = crypto.createHmac("sha256", key).update(signed).digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${sig}`,
  };
}

function makeReq(body, headers = {}) {
  const req = Readable.from([body]);
  req.method = "POST";
  req.headers = headers;
  return req;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function runHandler(body, headers, fetchImpl) {
  const originalSecret = process.env.WHOP_WEBHOOK_SECRET;
  const originalFetch = global.fetch;
  process.env.WHOP_WEBHOOK_SECRET = `whsec_${Buffer.from("decoded_test_key").toString("base64")}`;
  global.fetch = fetchImpl || (async () => ({
    ok: true,
    async json() { return { result: 1 }; },
  }));
  try {
    const req = makeReq(body, headers);
    const res = makeRes();
    await handler(req, res);
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  } finally {
    if (originalSecret === undefined) delete process.env.WHOP_WEBHOOK_SECRET;
    else process.env.WHOP_WEBHOOK_SECRET = originalSecret;
    global.fetch = originalFetch;
  }
}

test("verifyWhopSignature accepts a valid Standard Webhooks signature", () => {
  const rawBody = JSON.stringify({ type: "payment.succeeded", amount: 3900 });
  const secret = `whsec_${Buffer.from("decoded_test_key").toString("base64")}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = makeStandardHeaders(rawBody, secret, {
    timestamp,
    key: Buffer.from("decoded_test_key"),
  });

  assert.deepEqual(verifyWhopSignature(rawBody, headers, secret), {
    ok: true,
    mode: "standard",
  });
});

test("handler acknowledges but does not process a wrong Standard Webhooks key", async () => {
  const rawBody = JSON.stringify({ type: "payment.succeeded", amount: 3900 });
  const headers = makeStandardHeaders(rawBody, "wrong-key");
  let fetchCalls = 0;

  const result = await runHandler(rawBody, headers, async () => {
    fetchCalls += 1;
    return { ok: true, async json() { return { result: 1 }; } };
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, "signature-mismatch");
  assert.equal(fetchCalls, 0);
});

test("handler acknowledges unsigned requests when WHOP_WEBHOOK_SECRET is set", async () => {
  const result = await runHandler(JSON.stringify({ type: "payment.succeeded" }), {});

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, "missing-standard-signature");
});

test("handler rejects expired Standard Webhooks timestamps with 2xx ack", async () => {
  const rawBody = JSON.stringify({ type: "payment.succeeded", amount: 3900 });
  const secret = `whsec_${Buffer.from("decoded_test_key").toString("base64")}`;
  const headers = makeStandardHeaders(rawBody, secret, {
    timestamp: Math.floor(Date.now() / 1000) - 301,
    key: Buffer.from("decoded_test_key"),
  });

  const result = await runHandler(rawBody, headers);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, "stale-timestamp");
});

test("handler acknowledges ACMI save failures with ok:false", async () => {
  const rawBody = JSON.stringify({ type: "payment.succeeded", amount: 3900 });
  const secret = `whsec_${Buffer.from("decoded_test_key").toString("base64")}`;
  const headers = makeStandardHeaders(rawBody, secret, {
    key: Buffer.from("decoded_test_key"),
  });

  const result = await runHandler(rawBody, headers, async () => ({
    ok: false,
    status: 503,
    async json() { return { error: "down" }; },
  }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, "acmi-save-failed");
});
