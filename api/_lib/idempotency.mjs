// api/_lib/idempotency.mjs — 24h write de-duplication helper for Phase 4 endpoints.
//
// Exports: extractIdempotencyKey(req), checkIdempotency(redis, scope, key, executeFn)
//
// Used by: api/directive.mjs, api/inbox/[agent].mjs, api/hitl-create.mjs,
//          api/inbox/[agent]/[itemId].mjs, api/decision.mjs (plans 04-02..04-06).
//
// Storage: acmi:idem:<scope>:<key> → JSON.stringify(result), TTL 86400s.
//
// Defensive: every Upstash call wrapped in try/catch. If Upstash itself throws
// (Phase 1 hotfix 8880f23 / Phase 4 hotfix ef471db lesson), we fall through and
// execute the inner fn anyway — idempotency caching must NEVER cause a 500.
//
// Runtime: Node.js (matches auth.mjs runtime requirement).

const IDEM_TTL_SECONDS = 86400;
const KEY_REGEX = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Pull the Idempotency-Key header off the incoming request and validate format.
 * Sniffs Node-style vs Web-Request-style headers. Returns string when matching
 * /^[A-Za-z0-9_-]{8,128}$/, else null. NEVER throws — invalid keys just disable
 * caching for this request.
 * @param {object} req
 * @returns {string|null}
 */
export function extractIdempotencyKey(req) {
  if (!req || !req.headers) return null;
  let raw = "";
  if (typeof req.headers.get === "function") {
    raw = String(req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key") || "");
  } else {
    raw = String(
      req.headers["idempotency-key"] ||
      req.headers["Idempotency-Key"] ||
      req.headers.idempotencyKey ||
      ""
    );
  }
  raw = raw.trim();
  if (!raw) return null;
  return KEY_REGEX.test(raw) ? raw : null;
}

/**
 * Run executeFn() with idempotent caching. If `key` is null/missing → just
 * delegates with no cache. Otherwise stores result in acmi:idem:<scope>:<key>
 * for 24h. Replays return the cached result with `_idempotent_replay: true`
 * merged in.
 *
 * @template T
 * @param {Function} redis Per-tenant redis function from createRedis().
 * @param {string} scope Endpoint identifier (e.g. "directive", "inbox-inject").
 * @param {string|null} key Idempotency key from extractIdempotencyKey().
 * @param {() => Promise<T>} executeFn The actual write-and-return logic.
 * @returns {Promise<T | (T & {_idempotent_replay: true})>}
 */
export async function checkIdempotency(redis, scope, key, executeFn) {
  if (typeof executeFn !== "function") {
    throw new Error("checkIdempotency: executeFn required");
  }
  if (!key || typeof redis !== "function") {
    return await executeFn();
  }
  const idemKey = `acmi:idem:${scope}:${key}`;

  // Try cached replay first. If Upstash blows up here we degrade gracefully.
  try {
    const cached = await redis("GET", idemKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          return { ...parsed, _idempotent_replay: true };
        }
      } catch (parseErr) {
        console.warn(`[idempotency] cached JSON.parse failed for ${idemKey}:`, parseErr.message);
        // Fall through to fresh execution.
      }
    }
  } catch (getErr) {
    console.warn(`[idempotency] redis GET ${idemKey} threw:`, getErr.message);
    // Fall through to fresh execution.
  }

  // Cache miss (or read failure) — execute fresh. Never cache on error.
  const result = await executeFn();
  try {
    await redis("SET", idemKey, JSON.stringify(result), "EX", String(IDEM_TTL_SECONDS));
  } catch (setErr) {
    console.warn(`[idempotency] redis SET ${idemKey} threw:`, setErr.message);
    // Result still returned to caller; we just lost replay protection.
  }
  return result;
}
