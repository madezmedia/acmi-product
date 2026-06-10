/**
 * Bentley Voice — VAPI Webhook Handler
 * Deployed at: https://acmi-product.vercel.app/api/bentley-vapi-webhook
 *
 * Routes incoming VAPI calls to Composio MCP
 * Parses SSE responses correctly (Composio tool_router uses SSE transport)
 */

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'ak_xHrrW-9SrFPEC1LPv6eJ';
const COMPOSIO_SESSION = 'trs_LuHTrrdOQdEp';
const COMPOSIO_BASE = `https://backend.composio.dev/tool_router/${COMPOSIO_SESSION}/mcp`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = req.body;
    const msgType = body.message?.type || body.type || 'unknown';

    // Route selected VAPI intents to Composio tools
    let toolSlug = null;
    let toolArgs = {};

    // Map VAPI message types to Composio tools
    if (msgType === 'call' || msgType === 'inbound') {
      // Look up caller info
      const caller = body.call?.from || body.from || 'unknown';
      toolSlug = 'COMPOSIO_SEARCH_WEB';
      toolArgs = { query: `lookup ${caller}`, limit: 3 };
    }

    if (toolSlug) {
      const resp = await fetch(COMPOSIO_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-api-key': COMPOSIO_API_KEY },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'tools/call', id: 1,
          params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: toolSlug, arguments: toolArgs }] } }
        })
      });

      const raw = await resp.text();
      let resultText = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const sse = JSON.parse(line.slice(6));
            const inner = sse?.result?.content?.[0]?.text;
            if (inner) { resultText = inner; break; }
          } catch {}
        }
      }

      return res.status(200).json({ received: true, type: msgType, result: resultText || 'routed' });
    }

    return res.status(200).json({ received: true, type: msgType });
  } catch (err) {
    return res.status(200).json({ received: true, error: err.message });
  }
}
