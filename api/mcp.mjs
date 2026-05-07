// api/mcp.mjs — Streamable HTTP MCP server.
//
// URL: https://acmi-product.vercel.app/api/mcp
// Listed at: https://smithery.ai/server/madezmediapartners/acmi-mcp (URL-published)
//
// Smithery passes per-tenant Upstash credentials as base64-encoded JSON in
// the ?config= query param. The route decodes them per-request, builds a
// scoped redis client, and connects a fresh stateless Streamable HTTP
// transport. No server-side env-var fallback — leaking Mikey's tenant to
// hosted Smithery clients would be a security failure.
//
// Pattern: stateless (sessionIdGenerator: undefined), per-request server
// instance, deterministic teardown after handleRequest returns. Suitable
// for Vercel Node functions (serverless, stateless by nature).
//
// Runtime: Node.js (not Edge — @modelcontextprotocol/sdk needs Node
// stream/http types that aren't available in Edge runtime).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRedis } from "./_lib/redis.mjs";
import { registerAcmiTools } from "./_lib/mcp-tools.mjs";

export const config = {
  // Vercel: explicit Node runtime. Node version is selected from
  // package.json engines.node (>=20.0.0 here). The legacy config format
  // only accepts "edge" / "experimental-edge" / "nodejs" — NOT
  // "nodejs20.x" (that's the newer framework-specific format).
  runtime: "nodejs",
  // Allow longer execution (MCP can hold connections for streaming)
  maxDuration: 60,
};

function decodeSmitheryConfig(req) {
  // Smithery: ?config=<base64-encoded JSON>
  const url = new URL(req.url || "/api/mcp", "https://acmi-product.vercel.app");
  const cfgB64 = url.searchParams.get("config");
  if (!cfgB64) return {};
  try {
    const json = Buffer.from(cfgB64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`invalid base64 config: ${e.message}`);
  }
}

function extractCreds(cfg, req) {
  // Accept both schema-naming conventions Smithery may forward:
  //   - configSchema property names (camelCase: upstashRedisRestUrl)
  //   - env-var-style ALL_CAPS (UPSTASH_REDIS_REST_URL)
  // Also accept Authorization header pass-through if the host wraps it.
  const url =
    cfg.upstashRedisRestUrl ||
    cfg.UPSTASH_REDIS_REST_URL ||
    cfg.url ||
    null;
  const token =
    cfg.upstashRedisRestToken ||
    cfg.UPSTASH_REDIS_REST_TOKEN ||
    cfg.token ||
    null;
  return { url, token };
}

export default async function handler(req, res) {
  try {
    // 1. Decode Smithery config
    let cfg;
    try {
      cfg = decodeSmitheryConfig(req);
    } catch (e) {
      res.status(400).json({ error: e.message, where: "config decode" });
      return;
    }

    // 2. Extract tenant creds — NEVER fall back to process.env
    const { url, token } = extractCreds(cfg, req);
    if (!url || !token) {
      res.status(400).json({
        error: "missing upstashRedisRestUrl + upstashRedisRestToken in ?config=<base64>",
        hint: "Smithery passes these from the user's session config; if you're calling /api/mcp directly, encode JSON {\"upstashRedisRestUrl\":\"...\",\"upstashRedisRestToken\":\"...\"} as base64 and pass as ?config=",
      });
      return;
    }

    // 3. Build a scoped redis client for this request only
    const redis = createRedis({ url, token });

    // 4. Build a fresh MCP server instance per request (stateless).
    // McpServer (high-level) exposes .tool(...) which mcp-tools.mjs uses.
    const server = new McpServer({ name: "acmi", version: "1.3.0" });
    registerAcmiTools(server, redis);

    // 5. Stateless Streamable HTTP transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });
    await server.connect(transport);

    // 6. Tolerate clients that don't send both Accept types.
    // Spec requires Accept: application/json AND text/event-stream, and the
    // SDK's StreamableHTTP transport returns 406 if either is missing.
    // Real clients (Claude.ai, some proxies) only send application/json — we
    // augment the header so the SDK accepts the request. The response is
    // still SSE; SSE-incapable proxies that wanted JSON-only see SSE frames
    // (they parse the `data:` line as the JSON-RPC response — works in
    // practice for Smithery's proxy and Claude's integration).
    const accept = String(req.headers.accept || "");
    const parts = new Set(accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
    if (!parts.has("application/json") && !parts.has("*/*")) parts.add("application/json");
    if (!parts.has("text/event-stream") && !parts.has("*/*")) parts.add("text/event-stream");
    req.headers.accept = Array.from(parts).join(", ");

    // 7. Hand the request body to the transport
    // Vercel Node functions pre-parse JSON bodies to req.body. The transport
    // expects either a parsed object or undefined for GET probes.
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    // Avoid leaking stack traces; return a structured error.
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || String(e), where: "mcp.handler" });
    }
  }
}
