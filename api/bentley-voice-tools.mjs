/**
 * Bentley Voice — Ultra-simple VAPI tool handler
 * Returns immediate results, minimal processing, flat strings
 */

const COMPOSIO_KEY = 'ak_vaOPvXoztdPG9km0Oe4p';
const COMPOSIO_BASE = 'https://backend.composio.dev/tool_router/trs_LuHTrrdOQdEp/mcp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true });

  try {
    const body = req.body || {};
    
    // Extract tool call from VAPI format or direct format
    const toolCall = body.message?.toolCalls?.[0] || body.toolCalls?.[0] || body;
    const toolCallId = toolCall.id || toolCall.toolCallId || 'unknown';
    const fn = toolCall.function || {};
    const toolName = fn.name || body.name || body.tool || '';
    let args = {};
    try { args = JSON.parse(fn.arguments || '{}'); } catch { args = fn.arguments || body.arguments || body.args || {}; }

    if (!toolName) {
      return res.status(200).json({ results: [{ toolCallId, result: 'No tool specified' }] });
    }

    // Tool map
    const TOOL_MAP = {
      composioReadEmail: 'GMAIL_FETCH_EMAILS',
      composioListEmail: 'GMAIL_FETCH_EMAILS',
      composioSendEmail: 'GMAIL_SEND_EMAIL',
      composioCheckCalendar: 'GOOGLECALENDAR_EVENTS_LIST',
      composioWebSearch: 'COMPOSIO_SEARCH_WEB',
      composioAddTask: 'GOOGLETASKS_INSERT_TASK',
      composioMapsSearch: 'GOOGLE_MAPS_SEARCH',
    };

    const slug = TOOL_MAP[toolName];
    if (!slug) {
      return res.status(200).json({ results: [{ toolCallId, result: `Unknown tool: ${toolName}` }] });
    }

    // Add default task list ID for tasks
    if (slug === 'GOOGLETASKS_INSERT_TASK') {
      args.tasklist_id = args.tasklist_id || 'MTMwNTE3Mzk3OTE0NTA5MTI1NTI6MDow';
    }

    // Call Composio
    const resp = await fetch(COMPOSIO_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-api-key': COMPOSIO_KEY },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: slug, arguments: args }] } } })
    });

    const raw = await resp.text();
    let result = 'Done.';
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const sse = JSON.parse(line.slice(6));
          const text = sse?.result?.content?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            const msgs = parsed?.data?.results?.[0]?.response?.data?.messages;
            if (msgs) result = msgs.map(m => `${m.sender || '?'}: ${m.subject || m.preview?.subject || 'no subject'}`).join('. ');
            else result = parsed?.data?.results?.[0]?.response?.data?.answer || text.slice(0, 2000);
          }
        } catch {}
      }
    }

    return res.status(200).json({ results: [{ toolCallId, result }] });
  } catch (error) {
    return res.status(200).json({ results: [{ toolCallId: 'error', result: `Error: ${error.message}` }] });
  }
}
