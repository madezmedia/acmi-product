// api/_lib/event-shape.mjs — Comms v1.1 envelope builder for Phase 4 endpoints.
//
// Exports: buildEvent({source, kind, summary, payload, parentCorrelationId, tags, correlationId, ts}),
//          generateCorrelationId(kind, ts?)
//
// Used by: api/directive.mjs, api/inbox/[agent].mjs, api/hitl-create.mjs,
//          api/inbox/[agent]/[itemId].mjs, api/decision.mjs (plans 04-02..04-06).
//
// CRITICAL: enforces strict camelCase correlationId / parentCorrelationId.
// drift-diff banned snake_case correlation_id / parent_correlation_id. Any
// emission of those keys here breaks Comms v1.1 compliance fleet-wide.
//
// Runtime: Node.js (uses node:crypto for randomBytes).

import { randomBytes } from "node:crypto";

/** Convert camelCase/PascalCase/space-or-snake to kebab-case (identity on already-kebab strings). */
function kebabCase(s) {
  return String(s || "")
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Build a deterministic-ish correlationId. Format: <kebab-kind>-<ts>-<4-byte-hex>.
 *
 * Example: generateCorrelationId("markResolved") → "mark-resolved-1715616000000-a3f1".
 *
 * @param {string} kind Event kind (any casing — kebab'd internally).
 * @param {number} [ts] Optional explicit timestamp (defaults to Date.now()).
 * @returns {string}
 */
export function generateCorrelationId(kind, ts) {
  const t = typeof ts === "number" && Number.isFinite(ts) ? ts : Date.now();
  const tail = randomBytes(4).toString("hex");
  return `${kebabCase(kind || "event")}-${t}-${tail}`;
}

/**
 * Build a Comms v1.1 envelope. All key naming is camelCase per drift-diff
 * contract.
 *
 * Required: source (non-empty), kind (non-empty).
 *
 * @param {object} args
 * @param {string} args.source              Originating agent/user id (e.g. "mikey", "claude-engineer").
 * @param {string} args.kind                Event kind (e.g. "directive", "inbox-item", "mark-resolved").
 * @param {string} [args.summary]           Human-readable line (truncated to 280 chars).
 * @param {object} [args.payload]           Arbitrary structured payload object.
 * @param {string} [args.parentCorrelationId] Link to parent event (camelCase only).
 * @param {string[]} [args.tags]            Optional tags array (sliced to 16).
 * @param {string} [args.correlationId]     Optional explicit id; auto-generated otherwise.
 * @param {number} [args.ts]                Optional explicit ms timestamp (defaults Date.now()).
 * @returns {{ts:number, source:string, kind:string, correlationId:string, parentCorrelationId?:string, summary:string, tags?:string[], payload?:object}}
 */
export function buildEvent({
  source,
  kind,
  summary,
  payload,
  parentCorrelationId,
  tags,
  correlationId,
  ts,
} = {}) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new Error("source required");
  }
  if (typeof kind !== "string" || kind.trim() === "") {
    throw new Error("kind required");
  }

  const tsResolved = typeof ts === "number" && Number.isFinite(ts) ? ts : Date.now();
  const envelope = {
    ts: tsResolved,
    source,
    kind,
    correlationId: typeof correlationId === "string" && correlationId
      ? correlationId
      : generateCorrelationId(kind, tsResolved),
    summary: String(summary || "").slice(0, 280),
  };

  if (typeof parentCorrelationId === "string" && parentCorrelationId.trim()) {
    envelope.parentCorrelationId = parentCorrelationId.trim();
  }
  if (Array.isArray(tags) && tags.length > 0) {
    envelope.tags = tags.slice(0, 16).map((t) => String(t)).filter((t) => t.length > 0);
    if (envelope.tags.length === 0) delete envelope.tags;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    envelope.payload = payload;
  }

  return envelope;
}
