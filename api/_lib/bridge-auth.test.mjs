import { test } from "node:test";
import assert from "node:assert/strict";
import { bridgeToken, BRIDGE_TOKEN_ENV_NAMES } from "./bridge-auth.mjs";

test("bridgeToken: reads ACMI_BRIDGE_TOKEN", () => {
  assert.equal(bridgeToken({ ACMI_BRIDGE_TOKEN: "tok-a" }), "tok-a");
});

test("bridgeToken: reads UPSTASH_REDIS_REST_TOKEN", () => {
  assert.equal(bridgeToken({ UPSTASH_REDIS_REST_TOKEN: "tok-b" }), "tok-b");
});

test("bridgeToken: prefers ACMI_BRIDGE_TOKEN over the alias", () => {
  assert.equal(bridgeToken({ ACMI_BRIDGE_TOKEN: "tok-a", UPSTASH_REDIS_REST_TOKEN: "tok-b" }), "tok-a");
});

test("bridgeToken: trims surrounding whitespace", () => {
  assert.equal(bridgeToken({ ACMI_BRIDGE_TOKEN: "  tok-a  " }), "tok-a");
});

test("bridgeToken: throws when neither variable is set", () => {
  assert.throws(() => bridgeToken({}), /Missing bridge token/);
});

test("bridgeToken: throws when the variable is empty", () => {
  assert.throws(() => bridgeToken({ ACMI_BRIDGE_TOKEN: "" }), /Missing bridge token/);
});

test("bridgeToken: throws when the variable is whitespace only", () => {
  assert.throws(() => bridgeToken({ ACMI_BRIDGE_TOKEN: "   " }), /Missing bridge token/);
});

test("bridgeToken: the error names both accepted variables", () => {
  try {
    bridgeToken({});
    assert.fail("expected a throw");
  } catch (e) {
    for (const name of BRIDGE_TOKEN_ENV_NAMES) {
      assert.ok(e.message.includes(name), `error should name ${name}`);
    }
  }
});

test("bridgeToken: there is no hardcoded fallback value", () => {
  // A bundled default bearer would let anyone who reads the source reach the
  // fleet datastore. The only way to get a token is from the environment.
  assert.throws(() => bridgeToken({}), /Missing bridge token/);
  assert.throws(() => bridgeToken({ ACMI_BRIDGE_TOKEN: undefined }), /Missing bridge token/);
});
