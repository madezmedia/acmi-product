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
    if (method === "resources/list") {
      return { jsonrpc: "2.0", id: id ?? null, result: { resources: [] } };
    }
    if (method === "prompts/list") {
      return { jsonrpc: "2.0", id: id ?? null, result: { prompts: [] } };
    }
    if (method === "triggers/list") {
      return { jsonrpc: "2.0", id: id ?? null, result: { triggers: [] } };
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

// Methods that return public metadata only — no Upstash access needed.
// Smithery's deployment proxy probes a wider set than just initialize +
// tools/list during scan; resources/list, prompts/list, triggers/list are
// also part of the discovery sweep. We don't expose any resources, prompts,
// or triggers, so these all return empty arrays — but they must succeed
// (200 + JSON-RPC result), not 401, or Smithery wraps the error into an
// authorizationUrl response and the scan flags them as auth-failures.
const PUBLIC_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "initialized",
  "tools/list",
  "resources/list",
  "prompts/list",
  "triggers/list",
  "ping",
]);

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

    // Determine whether this request requires authenticated tenant creds.
    // GET probes + JSON-RPC metadata methods are public; tools/call (and any
    // unrecognized method) require auth.
    const method = req.body && req.body.method;
    const requiresAuth = req.method === "POST" && !PUBLIC_METHODS.has(method);

    const { url, token, source } = extractCreds(cfg, req);
    let redis;
    if (url && token) {
      redis = createRedis({ url, token });
      res.setHeader("X-MCP-Cred-Source", source);
    } else if (requiresAuth) {
      res.status(401).json({
        error: "authentication required for tool execution",
        hint: "either pass ?config=<base64 JSON with upstashRedisRestUrl + upstashRedisRestToken> (Smithery pattern), or send Authorization: Bearer <MCP_DIRECT_AUTH_TOKEN> if the deploy owner has enabled direct access. initialize and tools/list don't require auth.",
      });
      return;
    } else {
      // Public-method path with no creds — stub redis throws if a handler
      // accidentally tries to use it (defense in depth; should never fire
      // because PUBLIC_METHODS handlers don't touch redis).
      redis = async () => {
        throw new Error("Redis not available for unauthenticated requests");
      };
      res.setHeader("X-MCP-Cred-Source", "anon-public");
    }

    // Branch on Accept: SSE-capable clients get the SDK transport (preserves
    // server-initiated streaming for tool progress); JSON-only clients get a
    // plain JSON-RPC response.
    const acceptHdr = String(req.headers.accept || "").toLowerCase();
    const wantsSSE = acceptHdr.includes("text/event-stream");

    // Short-circuit empty-list methods for SSE clients too — the SDK's
    // McpServer returns -32601 Method not found for resources/list +
    // prompts/list because we never register handlers (we have none to
    // register), and for triggers/list because it's a Smithery extension
    // the SDK doesn't know. Smithery's scan flags those as warnings.
    // Bypass the SDK and reply directly with an empty result envelope.
    const reqMethod = req.body && req.body.method;
    if (
      req.method === "POST" &&
      (reqMethod === "resources/list" ||
        reqMethod === "prompts/list" ||
        reqMethod === "triggers/list")
    ) {
      const key = reqMethod.split("/")[0]; // "resources" | "prompts" | "triggers"
      const reply = {
        jsonrpc: "2.0",
        id: (req.body && req.body.id) ?? null,
        result: { [key]: [] },
      };
      if (wantsSSE) {
        res.status(200).setHeader("Content-Type", "text/event-stream");
        res.end(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
      } else {
        res.status(200).setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(reply));
      }
      return;
    }

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
