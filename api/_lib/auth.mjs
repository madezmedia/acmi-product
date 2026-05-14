// api/_lib/auth.mjs — shared bearer-token middleware for Phase 4 write endpoints.
//
// Exports: AuthError, requireBearer(req), withAuth(handler)
//
// Used by: api/directive.mjs, api/inbox/[agent].mjs, api/hitl-create.mjs,
//          api/inbox/[agent]/[itemId].mjs, api/decision.mjs (plans 04-02..04-06).
//
// Reuses the OAuth 2.1 Bearer access-token path from api/mcp.mjs::extractCreds
// (Priority 1c) — same lookupAccessToken store, same token-record validation
// (sub + upstash_url + upstash_token + expires_at). Two break-glass env-bearer
// paths are ALSO accepted, both checked with constant-time comparison:
//   - MCP_DIRECT_AUTH_TOKEN (existing, shared with /api/mcp)
//   - ACMI_WRITE_BEARER (new for Phase 4, set in both prod envs 2026-05-13)
// Empty/missing envs MUST NOT validate empty bearers.
//
// Runtime: Node.js (node:crypto for constant-time compare + lookupAccessToken's
//          randomBytes/createHash dependency in storage.mjs). All 5 Phase 4
//          write endpoints set `export const config = { runtime: "nodejs", maxDuration: 30 }`.
//
// Why NOT api/_lib/redis.mjs::resolveInstance: that reads ?instance= query /
// cookie and falls back to deploy-owner env. Write endpoints MUST use the
// per-token tenant creds bound to the bearer's `sub` (multi-user OAuth model)
// — same as mcp.mjs does. resolveInstance is for read-only GETs.

import { timingSafeEqual } from "node:crypto";
import { createRedis } from "./redis.mjs";
import { lookupAccessToken } from "../oauth/_lib/storage.mjs";

/** Thrown by requireBearer on missing/invalid/expired bearer. status carries the HTTP code. */
export class AuthError extends Error {
  /**
   * @param {string} msg
   * @param {number} status
   */
  constructor(msg, status) {
    super(msg);
    this.status = status;
    this.name = "AuthError";
  }
}

/**
 * Pull the Authorization header value as a Bearer token string, sniffing whether
 * `req.headers` is Node-style (plain object) or Web-Request-style (Headers).
 * Returns null when header is absent or not Bearer-prefixed.
 * @param {object} req
 * @returns {string|null}
 */
function extractBearer(req) {
  let authHeader = "";
  if (req && req.headers) {
    if (typeof req.headers.get === "function") {
      authHeader = String(req.headers.get("authorization") || req.headers.get("Authorization") || "");
    } else {
      authHeader = String(req.headers.authorization || req.headers.Authorization || "");
    }
  }
  if (!authHeader.startsWith("Bearer ")) return null;
  const t = authHeader.slice(7).trim();
  return t.length > 0 ? t : null;
}

/**
 * Constant-time string equality. Returns false instantly on length mismatch
 * (which is information-theoretically necessary; Node's timingSafeEqual REQUIRES
 * equal-length buffers) and false on any empty input.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || b.length === 0) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Authenticate an incoming write request. Throws AuthError(401) on any failure.
 *
 * Priority order (matches api/mcp.mjs::extractCreds for shared token surface):
 *   1. OAuth 2.1 Bearer access token (via lookupAccessToken).
 *   2a. MCP_DIRECT_AUTH_TOKEN env-bearer break-glass (existing, shared w/ /api/mcp).
 *   2b. ACMI_WRITE_BEARER env-bearer break-glass (new for Phase 4).
 *
 * @param {object} req Node-style or Web-Request-style request object.
 * @returns {Promise<{sub:string, upstash_url:string, upstash_token:string, redis:Function, source:string}>}
 * @throws {AuthError} 401 on missing/invalid/expired token or missing tenant creds.
 */
export async function requireBearer(req) {
  const bearer = extractBearer(req);
  if (!bearer) {
    throw new AuthError("missing bearer token", 401);
  }

  // Priority 1: OAuth access token (Upstash-backed token store).
  let oauthLookupError = null;
  try {
    const tok = await lookupAccessToken(bearer);
    if (tok) {
      if ((tok.expires_at ?? 0) <= Math.floor(Date.now() / 1000)) {
        throw new AuthError("expired bearer token", 401);
      }
      if (!tok.upstash_url || !tok.upstash_token) {
        throw new AuthError("token missing tenant creds", 401);
      }
      return {
        sub: tok.sub,
        upstash_url: tok.upstash_url,
        upstash_token: tok.upstash_token,
        redis: createRedis({ url: tok.upstash_url, token: tok.upstash_token }),
        source: "oauth",
      };
    }
  } catch (e) {
    // If it's an AuthError, propagate. Otherwise, capture and fall through to env-bearer.
    if (e instanceof AuthError) throw e;
    oauthLookupError = e;
  }

  // Priority 2a: MCP_DIRECT_AUTH_TOKEN env-bearer (existing, shared w/ /api/mcp).
  const mcpDirect = process.env.MCP_DIRECT_AUTH_TOKEN || "";
  const upUrl = process.env.UPSTASH_REDIS_REST_URL || "";
  const upTok = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (mcpDirect && constantTimeEqual(bearer, mcpDirect) && upUrl && upTok) {
    return {
      sub: "env-break-glass",
      upstash_url: upUrl,
      upstash_token: upTok,
      redis: createRedis({ url: upUrl, token: upTok }),
      source: "env-authed-mcp",
    };
  }

  // Priority 2b: ACMI_WRITE_BEARER env-bearer (new for Phase 4).
  const acmiWrite = process.env.ACMI_WRITE_BEARER || "";
  if (acmiWrite && constantTimeEqual(bearer, acmiWrite) && upUrl && upTok) {
    return {
      sub: "env-break-glass-write",
      upstash_url: upUrl,
      upstash_token: upTok,
      redis: createRedis({ url: upUrl, token: upTok }),
      source: "env-authed-write",
    };
  }

  // No path validated. Best diagnostic = "invalid bearer token". Suppress
  // upstream lookup errors (Upstash transient errors shouldn't leak to clients;
  // they're already logged via console.warn below).
  if (oauthLookupError) {
    console.warn("[auth.requireBearer] lookupAccessToken error:", oauthLookupError.message);
  }
  throw new AuthError("invalid bearer token", 401);
}

/**
 * Wrap a Node-runtime Vercel handler `(req, res) => Promise<void>` with bearer auth.
 * On success: attaches `req.acmiAuth = { sub, upstash_url, upstash_token, redis, source }`
 * and delegates to handler.
 * On AuthError: sets WWW-Authenticate header (RFC 9728 protected-resource-metadata
 * pointer, mirrors api/mcp.mjs lines 240-245) and returns the AuthError status + JSON body.
 * On other error: returns 500 JSON.
 *
 * @template T
 * @param {(req:any, res:any) => Promise<T>} handler
 * @returns {(req:any, res:any) => Promise<void>}
 */
export function withAuth(handler) {
  return async function authedHandler(req, res) {
    try {
      const auth = await requireBearer(req);
      req.acmiAuth = auth;
      return await handler(req, res);
    } catch (e) {
      if (e instanceof AuthError) {
        const proto = (req.headers?.["x-forwarded-proto"] || "https").toString().split(",")[0];
        const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "acmi-product.vercel.app";
        const issuer = `${proto}://${host}`;
        try {
          res.setHeader(
            "WWW-Authenticate",
            `Bearer realm="acmi-write", resource_metadata="${issuer}/.well-known/oauth-protected-resource"`
          );
        } catch {
          // Web-Response-style res may not have setHeader; ignore.
        }
        return res.status(e.status).json({
          error: e.message,
          hint: "OAuth 2.1 + PKCE; discover via /.well-known/oauth-authorization-server. Or pass Bearer <MCP_DIRECT_AUTH_TOKEN> or Bearer <ACMI_WRITE_BEARER> (deploy-owner break-glass).",
        });
      }
      console.error("[withAuth] non-AuthError:", e);
      return res.status(500).json({ error: e?.message || String(e), where: "auth" });
    }
  };
}
