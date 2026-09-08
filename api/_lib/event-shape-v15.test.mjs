import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEventV15,
  assertCamelCorrelationKeys,
  COMMS_V15_STAMP,
} from "./event-shape.mjs";

test("buildEventV15 stamps Comms v1.5 + madez", () => {
  const e = buildEventV15({
    source: "agent:grok-local",
    kind: "coord-note",
    summary: "[coord-note @fleet] smoke",
    correlationId: "fleet-acmi-protocol-enforce-v1-test",
  });
  assert.equal(e.acmi_version, "1.5");
  assert.equal(e.comms_protocol, "v1.5");
  assert.equal(e.comms_alignment, "active");
  assert.equal(e.tenant_id, "madez");
  assert.equal(e.actor_type, "agent");
  assert.equal(e.correlationId, "fleet-acmi-protocol-enforce-v1-test");
  assert.ok(!("correlation_id" in e));
});

test("assertCamelCorrelationKeys rejects snake_case", () => {
  assert.throws(
    () => assertCamelCorrelationKeys({ correlation_id: "x" }),
    /correlation_id forbidden/
  );
  assert.throws(
    () => assertCamelCorrelationKeys({ parent_correlation_id: "x" }),
    /parent_correlation_id forbidden/
  );
});

test("COMMS_V15_STAMP frozen madez", () => {
  assert.equal(COMMS_V15_STAMP.tenant_id, "madez");
  assert.throws(() => {
    COMMS_V15_STAMP.tenant_id = "other";
  });
});
