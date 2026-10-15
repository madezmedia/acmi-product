// api/_lib/read-auth.mjs — fail-closed bearer gate for fleet/data read endpoints.
//
// Env: ACMI_READ_BEARER (server-side only). Unset, empty, or whitespace-only
// means every gated read returns 401. A presented credential is compared with
// a constant-time equal-length byte compare and is never logged.
//
// ACMI_WRITE_BEARER is intentionally not accepted. That secret authorizes
// mutations (api/_lib/auth.mjs) and its helper also accepts OAuth tokens when
// the write secret is unset, which would not fail closed. A distinct read
// secret keeps a dashboard credential from becoming a write credential.
//
// Edge-safe: no node:crypto import. Equal-length UTF-8 bytes are compared
// with XOR accumulation (same constraint as timingSafeEqual, which requires
// equal lengths). Length mismatch returns false without a short-circuit on
// the secret's contents.

export const READ_BEARER_ENV = "ACMI_READ_BEARER";

const WWW_AUTHENTICATE = 'Bearer realm="acmi-fleet-read"';

/** Trimmed server secret, or "" when the gate must fail closed. */
export function fleetReadSecret() {
  const raw = process.env[READ_BEARER_ENV];
  if (typeof raw !== "string") return "";
  return raw.trim();
}

/**
 * Authorization: Bearer <token> from a Web Request or a Node IncomingMessage.
 * Query-string tokens are ignored. Returns null when absent or not Bearer.
 * @param {object} req
 * @returns {string|null}
 */
export function extractBearer(req) {
  let authHeader = "";
  if (req && req.headers) {
    if (typeof req.headers.get === "function") {
      authHeader = String(req.headers.get("authorization") || req.headers.get("Authorization") || "");
    } else {
      const raw = req.headers.authorization || req.headers.Authorization || "";
      authHeader = String(Array.isArray(raw) ? raw[0] || "" : raw);
    }
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authHeader);
  if (!match) return null;
  return match[1];
}

/**
 * Constant-time equality for non-empty strings.
 * Returns false on type mismatch, empty input, or UTF-8 length mismatch
 * (timingSafeEqual cannot compare unequal buffers). Equal-length inputs
 * are compared with XOR so the loop does not return early on the first
 * differing byte.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || b.length === 0) return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let mismatch = 0;
  for (let i = 0; i < ab.length; i++) mismatch |= ab[i] ^ bb[i];
  return mismatch === 0;
}

/**
 * @param {object} req
 * @returns {{ok:true}|{ok:false, status:401, reason:string}}
 */
export function authorizeFleetRead(req) {
  const secret = fleetReadSecret();
  if (!secret) {
    return { ok: false, status: 401, reason: "read_auth_unconfigured" };
  }
  const bearer = extractBearer(req);
  if (!bearer) {
    return { ok: false, status: 401, reason: "missing_bearer" };
  }
  if (!constantTimeEqual(bearer, secret)) {
    return { ok: false, status: 401, reason: "invalid_bearer" };
  }
  return { ok: true };
}

function denyBody(decision) {
  return { error: "unauthorized", reason: decision.reason };
}

/** Edge Response for a failed read, or null when the request is authorized. */
export function fleetReadRejection(req) {
  const decision = authorizeFleetRead(req);
  if (decision.ok) return null;
  return new Response(JSON.stringify(denyBody(decision)), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "WWW-Authenticate": WWW_AUTHENTICATE,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Wrap an Edge handler. OPTIONS is a no-data preflight. Every other method
 * requires the read bearer before the handler runs. Successful responses are
 * marked private so a shared cache cannot replay an authenticated body.
 * @param {(req:any, res?:any) => Promise<any>} handler
 */
export function withFleetRead(handler) {
  return async function gatedFleetRead(req, res) {
    const method = String(req?.method || "GET").toUpperCase();
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const denied = fleetReadRejection(req);
    if (denied) return denied;
    const out = await handler(req, res);
    if (out instanceof Response) {
      const headers = new Headers(out.headers);
      headers.set("Cache-Control", "private, no-store");
      return new Response(out.body, {
        status: out.status,
        statusText: out.statusText,
        headers,
      });
    }
    return out;
  };
}

/**
 * Node (req, res) variant used by GET /api/hitl. Writes 401 and returns true
 * when the request must not continue. Returns false when authorized.
 * @param {object} req
 * @param {object} res
 * @returns {boolean}
 */
export function rejectFleetReadNode(req, res) {
  const decision = authorizeFleetRead(req);
  if (decision.ok) return false;
  try {
    res.setHeader("WWW-Authenticate", WWW_AUTHENTICATE);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json");
  } catch {
    // Some test doubles omit setHeader.
  }
  res.status(401).json(denyBody(decision));
  return true;
}
