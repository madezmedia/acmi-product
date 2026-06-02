/**
 * Bentley Voice — Tool Router (used by VAPI assistant)
 * Deployed at: https://acmi-product.vercel.app/api/bentley-voice-tools
 *
 * Handles tool calls from the Bentley Voice VAPI assistant.
 * Routes to Composio MCP for execution.
 */

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'ak_vaOPvXoztdPG9km0Oe4p';
const COMPOSIO_SESSION = 'trs_LuHTrrdOQdEp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Bentley Voice Tools online', session: COMPOSIO_SESSION });
  }

  try {
    const { tool, args } = req.body || {};

    if (!tool) {
      return res.status(400).json({ error: 'tool required' });
    }

    console.log(`[Bentley Tools] Calling ${tool}`, JSON.stringify(args).slice(0, 300));

    const composioResp = await fetch(
      `https://backend.composio.dev/tool_router/${COMPOSIO_SESSION}/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': COMPOSIO_API_KEY,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
            arguments: {
              tools: [
                {
                  tool_slug: tool,
                  arguments: args || {},
                },
              ],
            },
          },
        }),
      }
    );

    const data = await composioResp.json();

    return res.status(200).json({
      success: true,
      tool,
      result: data?.result || data,
    });
  } catch (err) {
    console.error('[Bentley Tools] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
