/**
 * Bentley Voice — Tool Router
 * Deployed at: https://acmi-product.vercel.app/api/bentley-voice-tools
 *
 * Handles tool calls from VAPI assistant and routes to Composio MCP.
 * Accepts both VAPI format ({name, arguments, toolCallId}) and direct format ({tool, args}).
 */

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'ak_xHrrW-9SrFPEC1LPv6eJ';
const COMPOSIO_SESSION = 'trs_LuHTrrdOQdEp';
const COMPOSIO_BASE = `https://backend.composio.dev/tool_router/${COMPOSIO_SESSION}/mcp`;

// Tool map matching bentley-voice_tools.mjs
const TOOL_MAP = {
  composioSendEmail: { slug: 'GMAIL_SEND_EMAIL', transform: (a) => ({ recipient_email: a.recipient_email || a.to, subject: a.subject, body: a.body, is_html: false }) },
  composioReadEmail: { slug: 'GMAIL_FETCH_EMAILS', transform: (a) => ({ max_results: a.max_results || 5, query: a.query || '', include_spam_trash: false }) },
  composioCheckCalendar: { slug: 'GOOGLECALENDAR_EVENTS_LIST', transform: (a) => ({ time_min: a.time_min, time_max: a.time_max, max_results: a.max_results || 10, single_events: true, order_by: 'startTime' }) },
  composioCreateEvent: { slug: 'GOOGLECALENDAR_CREATE_EVENT', transform: (a) => ({ summary: a.summary, start_datetime: a.start_time, end_datetime: a.end_time, description: a.description || '' }) },
  composioAddTask: { slug: 'GOOGLETASKS_INSERT_TASK', transform: (a) => ({ title: a.title, notes: a.notes || '', due: a.due || null }) },
  composioWebSearch: { slug: 'COMPOSIO_SEARCH_WEB', transform: (a) => ({ query: a.query, limit: a.num_results || 5 }) },
  composioMapsSearch: { slug: 'GOOGLE_MAPS_SEARCH', transform: (a) => ({ query: a.query, location: a.location || '' }) },
};

async function callComposio(toolSlug, toolArgs) {
  const resp = await fetch(COMPOSIO_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-api-key': COMPOSIO_API_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: toolSlug, arguments: toolArgs }] } } })
  });
  const raw = await resp.text();
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const sse = JSON.parse(line.slice(6));
        const inner = sse?.result?.content?.[0]?.text;
        if (inner) return inner;
        if (sse?.result?.data?.results?.[0]?.response?.data) return JSON.stringify(sse.result.data.results[0].response.data);
        if (sse?.error) return `Error: ${sse.error.message || sse.error}`;
      } catch {}
    }
  }
  return 'Done.';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'bentley-voice-tools', tools: Object.keys(TOOL_MAP) });

  try {
    const body = req.body || {};
    console.log(`[Bentley Tools] Received body:`, JSON.stringify(body).slice(0, 500));
    // Support both VAPI format {name, arguments, toolCallId} and direct {tool, args}
    const toolCallId = body.toolCallId || body.id || 'unknown';
    let toolName = body.name || body.tool;
    let toolArgs = body.arguments || body.args || {};

    if (!toolName) {
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: 'Unknown tool.' }] } });
    }

    const toolDef = TOOL_MAP[toolName];
    if (!toolDef) {
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }] } });
    }

    const resultText = await callComposio(toolDef.slug, toolDef.transform(toolArgs));
    return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: resultText }] } });
  } catch (error) {
    return res.status(200).json({ toolCallId: req.body?.toolCallId || 'unknown', result: { content: [{ type: 'text', text: `Error: ${error.message}` }] } });
  }
}
