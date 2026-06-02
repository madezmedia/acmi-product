/**
 * Bentley Voice — VAPI Webhook Handler
 * Deployed at: https://acmi-product.vercel.app/api/bentley-vapi-webhook
 *
 * Routes incoming VAPI calls to Composio MCP
 * Session: trs_LuHTrrdOQdEp
 */

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'ak_vaOPvXoztdPG9km0Oe4p';
const COMPOSIO_SESSION = 'trs_LuHTrrdOQdEp';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const body = req.body;
    console.log('[Bentley Voice] Incoming:', JSON.stringify(body).slice(0, 500));

    // VAPI webhook types:
    // - "call": incoming call
    // - "transcript": call transcript
    // - "end-of-call-report": summary
    // - "status": call status update
    const msgType = body.message?.type || body.type || 'unknown';

    // Route to Composio MCP
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
                  tool_slug: 'VAPI_GET_STRUCTURED_OUTPUTS',
                  arguments: {},
                },
              ],
            },
          },
        }),
      }
    );

    const composioData = await composioResp.json();

    console.log('[Bentley Voice] Composio response:', JSON.stringify(composioData).slice(0, 500));

    return res.status(200).json({
      received: true,
      type: msgType,
      composio: composioData?.result || 'routed',
    });
  } catch (err) {
    console.error('[Bentley Voice] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
