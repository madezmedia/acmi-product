// api/mcp.mjs — Streamable HTTP MCP server with JSON-RPC fallback.
//
// URL: https://acmi-product.vercel.app/api/mcp
// Listed at: https://smithery.ai/servers/madezmediapartners/acmi-mcp
//
// Two transport paths:
//   1. SSE-capable clients (Smithery proxy, sophisticated MCP clients) get the
//      SDK's StreamableHTTPServerTransport returning event-stream framed
//      JSON-RPC responses.
//   2. JSON-only clients (Claude Web's "add MCP integration" form, simple
//      curl probes) get a hand-rolled JSON-RPC dispatcher returning plain
//      application/json.
//
// Credential resolution:
//   - Smithery: ?config=<base64> with upstashRedisRestUrl + upstashRedisRestToken
//   - Direct (Claude Web): falls back to server env UPSTASH_REDIS_REST_URL /
//     UPSTASH_REDIS_REST_TOKEN (deploy owner's tenant — same creds the
//     read-only api/* edge endpoints already use)
//
// Runtime: Node.js (the SDK needs Node http types).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRedis } from "./_lib/redis.mjs";
import { registerAcmiTools } from "./_lib/mcp-tools.mjs";
import { TOOL_DEFS } from "./_lib/mcp-tool-defs.mjs";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

const SERVER_INFO = { name: "acmi", version: "1.3.0" };
const PROTOCOL_VERSION = "2024-11-05";

function decodeSmitheryConfig(req) {
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
  // Priority 1: per-request config (Smithery multi-tenant). Always allowed.
  const cfgUrl =
    cfg.upstashRedisRestUrl ||
    cfg.UPSTASH_REDIS_REST_URL ||
    cfg.url ||
    null;
  const cfgToken =
    cfg.upstashRedisRestToken ||
    cfg.UPSTASH_REDIS_REST_TOKEN ||
    cfg.token ||
    null;
  if (cfgUrl && cfgToken) {
    return { url: cfgUrl, token: cfgToken, source: "config" };
  }

  // Priority 2: env-var fallback — ONLY behind Bearer auth.
  // The deploy owns Upstash creds (acmi-product reads from those for the
  // ops-center edge endpoints). Direct clients (Claude Web) can use them
  // IF they prove they're authorized via Authorization: Bearer <token>
  // matching the MCP_DIRECT_AUTH_TOKEN env var.
  //
  // If MCP_DIRECT_AUTH_TOKEN is unset, env fallback is disabled entirely —
  // anonymous direct callers get 401, preserving the original deny-by-default
  // posture.
  const requiredToken = process.env.MCP_DIRECT_AUTH_TOKEN || null;
  if (requiredToken) {
    const authHeader = String(req.headers.authorization || req.headers.Authorization || "");
    const presented = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (presented && presented === requiredToken) {
      return {
        url: process.env.UPSTASH_REDIS_REST_URL || null,
        token: process.env.UPSTASH_REDIS_REST_TOKEN || null,
        source: "env-authed",
      };
    }
  }

  return { url: null, token: null, source: "none" };
}

// ─── Manual JSON-RPC dispatcher (for Accept: application/json clients) ──

function buildToolRegistry(redis) {
  const tools = {};
  const shim = {
    tool: (name, description, _schema, handler) => {
      tools[name] = { name, description, handler };
    },
  };
  registerAcmiTools(shim, redis);
  return tools;
}

async function dispatchJsonRpc(msg, tools) {
  const { id, method, params } = msg || {};
  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        },
      };
    }
    if (method === "notifications/initialized" || method === "initialized") {
      // notification — no response per JSON-RPC 2.0 spec
      return null;
    }
    if (method === "tools/list") {
      return { jsonrpc: "2.0", id: id ?? null, result: { tools: TOOL_DEFS } };
    }
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments || {};
      const t = tools[name];
      if (!t) {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          error: { code: -32601, message: `Tool not found: ${name}` },
        };
      }
      const result = await t.handler(args);
      return { jsonrpc: "2.0", id: id ?? null, result };
    }
    if (method === "ping") {
      return { jsonrpc: "2.0", id: id ?? null, result: {} };
    }
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32601, message: `Unknown method: ${method}` },
    };
  } catch (e) {
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32603, message: e.message || String(e) },
    };
  }
}

// ─── Main handler ───────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS for browser-initiated MCP clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    let cfg;
    try {
      cfg = decodeSmitheryConfig(req);
    } catch (e) {
      res.status(400).json({ error: e.message, where: "config decode" });
      return;
    }

    const { url, token, source } = extractCreds(cfg, req);
    if (!url || !token) {
      // 401 (not 400) — this is an auth failure, not a malformed request
      res.status(401).json({
        error: "authentication required",
        hint: "either pass ?config=<base64 JSON with upstashRedisRestUrl + upstashRedisRestToken> (Smithery pattern), or send Authorization: Bearer <MCP_DIRECT_AUTH_TOKEN> if the deploy owner has enabled direct access",
      });
      return;
    }
    // Surface which credential path was used (for debugging only — not secret)
    res.setHeader("X-MCP-Cred-Source", source);

    const redis = createRedis({ url, token });

    // Branch on Accept: SSE-capable clients get the SDK transport (preserves
    // server-initiated streaming for tool progress); JSON-only clients get a
    // plain JSON-RPC response.
    const acceptHdr = String(req.headers.accept || "").toLowerCase();
    const wantsSSE = acceptHdr.includes("text/event-stream");

    if (wantsSSE) {
      const server = new McpServer(SERVER_INFO);
      registerAcmiTools(server, redis);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // JSON-only path
    if (req.method === "GET") {
      // Smithery / health probe — return server card-style metadata
      res.status(200).json({
        ...SERVER_INFO,
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        transport: "streamable-http",
        toolCount: TOOL_DEFS.length,
      });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed", allowed: ["GET", "POST", "OPTIONS"] });
      return;
    }

    const msg = req.body;
    const tools = buildToolRegistry(redis);
    const reply = await dispatchJsonRpc(msg, tools);
    if (reply === null) {
      res.status(202).end();
      return;
    }
    res.status(200).setHeader("Content-Type", "application/json").end(JSON.stringify(reply));
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || String(e), where: "mcp.handler" });
    }
  }
}
