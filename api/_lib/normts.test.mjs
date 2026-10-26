import { test } from "node:test";
import assert from "node:assert/strict";
import { normTs, parseZWithScores } from "./mcp-tools.mjs";

const MS = 1791731538741;

test("normTs leaves millisecond timestamps unchanged", () => {
  assert.equal(normTs(MS), MS);
});

test("normTs converts microseconds and nanoseconds back to milliseconds", () => {
  assert.equal(normTs(MS * 1e3), MS);
  assert.equal(normTs(MS * 1e6), MS);
});

test("normTs converts epoch seconds to milliseconds", () => {
  assert.equal(normTs(1700000000), 1700000000000);
});

test("normTs leaves small values unchanged", () => {
  assert.equal(normTs(1000), 1000);
});

test("normTs converts a real nanosecond score without a 1ms float error", () => {
  assert.equal(normTs(1791853034186350600), 1791853034186);
  assert.equal(normTs(1791853034186000000), 1791853034186);
});

test("normTs parses ISO and space-separated date strings", () => {
  const expected = Date.parse("2026-10-12T20:52:00Z");
  assert.equal(normTs("2026-10-12T20:52:00Z"), expected);
  assert.equal(normTs("2026-10-12 20:52Z"), expected);
  assert.notEqual(expected, 0);
});

test("normTs parses numeric strings and rejects non-dates", () => {
  assert.equal(normTs("1791731538741"), 1791731538741);
  assert.equal(normTs("not a date"), 0);
});

test("parseZWithScores normalises ts and keeps the stored score", () => {
  const raw = "1791853034186000000";
  const rows = parseZWithScores([
    JSON.stringify({ summary: "ns event" }),
    raw,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ts, 1791853034186);
  assert.equal(rows[0].raw_score, raw);
  assert.deepEqual(rows[0].data, { summary: "ns event" });
});
