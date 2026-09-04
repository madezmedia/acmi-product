import { test } from "node:test";
import assert from "node:assert/strict";
import { isBridgeUrl, restEndpoint } from "./redis.mjs";

const POLAR = "https://acmi-redis-u70402.vm.elestio.app/bridge/exec";

test("isBridgeUrl: Polar exec", () => {
  assert.equal(isBridgeUrl(POLAR), true);
  assert.equal(isBridgeUrl(POLAR + "/"), true);
  assert.equal(isBridgeUrl("https://loved-platypus-102968.upstash.io"), false);
});

test("restEndpoint: Polar never keeps a trailing slash", () => {
  assert.equal(restEndpoint(POLAR), POLAR);
  assert.equal(restEndpoint(POLAR + "/"), POLAR);
  assert.equal(restEndpoint(POLAR + "///"), POLAR);
});

test("restEndpoint: Upstash Cloud keeps a trailing slash", () => {
  assert.equal(restEndpoint("https://loved-platypus-102968.upstash.io"), "https://loved-platypus-102968.upstash.io/");
  assert.equal(restEndpoint("https://loved-platypus-102968.upstash.io/"), "https://loved-platypus-102968.upstash.io/");
});

test("restEndpoint: empty stays empty", () => {
  assert.equal(restEndpoint(""), "");
  assert.equal(restEndpoint(null), "");
});
