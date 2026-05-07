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

function extractCreds(cfg) {
  // Priority 1: per-request config (Smithery multi-tenant)
  let url =
    cfg.upstashRedisRestUrl ||
    cfg.UPSTASH_REDIS_REST_URL ||
    cfg.url ||
    null;
  let token =
    cfg.upstashRedisRestToken ||
    cfg.UPSTASH_REDIS_REST_TOKEN ||
    cfg.token ||
    null;

  // Priority 2: server env (Claude Web direct, dev probes, default tenant).
  // The deploy-owner's tenant becomes the default for clients that can't
  // pass query params. Same creds as the read-only api/* endpoints — no
  // additional exposure surface.
  if (!url) url = process.env.UPSTASH_REDIS_REST_URL || null;
  if (!token) token = process.env.UPSTASH_REDIS_REST_TOKEN || null;

  return { url, token };
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

    const { url, token } = extractCreds(cfg);
    if (!url || !token) {
      res.status(500).json({
        error: "no credentials available — neither ?config= nor server env vars",
        hint: "set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN on the deploy, or pass per-request via ?config=<base64 JSON>",
      });
      return;
    }

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
