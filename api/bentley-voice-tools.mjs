/**
 * Bentley Voice — Tool Router
 * Deployed at: https://acmi-product.vercel.app/api/bentley-voice-tools
 *
 * Handles VAPI tool-calls ({message.toolCalls[].function}) 
 * and routes to Composio MCP for execution.
 */

const COMPOSIO_KEY = process.env.COMPOSIO_API_KEY || 'ak_vaOPvXoztdPG9km0Oe4p';
const COMPOSIO_SESSION = 'trs_LuHTrrdOQdEp';
const COMPOSIO_BASE = `https://backend.composio.dev/tool_router/${COMPOSIO_SESSION}/mcp`;

const TOOL_MAP = {
  composioSendEmail: { slug: 'GMAIL_SEND_EMAIL', transform: (a) => ({ recipient_email: a.recipient_email || a.to || a.email, subject: a.subject, body: a.body, is_html: false }) },
  composioReadEmail: { slug: 'GMAIL_FETCH_EMAILS', transform: (a) => ({ max_results: a.max_results || a.max_emails || 5, query: a.query || '', include_spam_trash: false }) },
  composioListEmail: { slug: 'GMAIL_FETCH_EMAILS', transform: (a) => ({ max_results: a.max_results || a.max_emails || 5, query: a.query || '', include_spam_trash: false }) },
  composioCheckCalendar: { slug: 'GOOGLECALENDAR_EVENTS_LIST', transform: (a) => ({ time_min: a.time_min, time_max: a.time_max, max_results: a.max_results || 10, single_events: true, order_by: 'startTime' }) },
  composioCreateEvent: { slug: 'GOOGLECALENDAR_CREATE_EVENT', transform: (a) => ({ summary: a.summary, start_datetime: a.start_time, end_datetime: a.end_time, description: a.description || '' }) },
  composioAddTask: { slug: 'GOOGLETASKS_INSERT_TASK', transform: (a) => ({ title: a.title, notes: a.notes || '', due: a.due || null }) },
  composioWebSearch: { slug: 'COMPOSIO_SEARCH_WEB', transform: (a) => ({ query: a.query, limit: a.num_results || 5 }) },
  composioMapsSearch: { slug: 'GOOGLE_MAPS_SEARCH', transform: (a) => ({ query: a.query, location: a.location || '' }) },
};

async function callComposio(toolSlug, toolArgs) {
  const resp = await fetch(COMPOSIO_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-api-key': COMPOSIO_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: toolSlug, arguments: toolArgs }] } } })
  });
  const raw = await resp.text();
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const sse = JSON.parse(line.slice(6));
        const inner = sse?.result?.content?.[0]?.text;
        if (inner) {
          const data = JSON.parse(inner);
          // Extract human-readable summary for voice
          const msgs = data?.data?.results?.[0]?.response?.data?.messages;
          if (msgs && Array.isArray(msgs)) {
            return msgs.map(m => `${m.sender || '?'}: ${(m.subject || m.preview?.subject || 'no subject')}`).join('\n');
          }
          const answer = data?.data?.results?.[0]?.response?.data?.answer;
          if (answer) return answer;
          // Fallback: strip to essentials
          return inner.slice(0, 2000);
        }
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
    console.log('[Bentley Tools] Full body type:', typeof body, 'keys:', Object.keys(body).join(','));

    // VAPI format: body.message.toolCalls[].function
    const msg = body.message || {};
    const toolCalls = msg.toolCalls || body.toolCalls || [];
    
    // Also support direct format {name, arguments, toolCallId} or {tool, args}
    let results = [];

    if (toolCalls.length > 0) {
      // VAPI tool-calls format
      console.log(`[Bentley Tools] Processing ${toolCalls.length} VAPI tool calls`);
      for (const tc of toolCalls) {
        const toolCallId = tc.id || 'unknown';
        const fn = tc.function || {};
        const toolName = fn.name || '';
        let toolArgs = {};
        try { toolArgs = JSON.parse(fn.arguments || '{}'); } catch { toolArgs = fn.arguments || {}; }

        const toolDef = TOOL_MAP[toolName];
        if (!toolDef) {
          results.push({ toolCallId, result: `Unknown tool: ${toolName}` });
          continue;
        }

        const resultText = await callComposio(toolDef.slug, toolDef.transform(toolArgs));
const fl = typeof resultText === 'string' ? resultText : JSON.stringify(resultText);
results.push({ toolCallId, result: fl.length > 3000 ? fl.slice(0, 3000) + '...' : fl });
      }
    } else {
      // Direct format fallback
      const toolCallId = body.toolCallId || body.id || 'direct';
      let toolName = body.name || body.tool;
      let toolArgs = body.arguments || body.args || {};

      if (toolName) {
        const toolDef = TOOL_MAP[toolName];
        if (toolDef) {
          const resultText = await callComposio(toolDef.slug, toolDef.transform(toolArgs));
        const flat = typeof resultText === 'string' ? resultText : JSON.stringify(resultText);
        results.push({ toolCallId, result: flat.length > 3000 ? flat.slice(0, 3000) + '...' : flat });
        } else {
          results.push({ toolCallId, result: `Unknown tool: ${toolName}` });
        }
      }
    }

    // VAPI expects response per tool call
    if (results.length === 1) {
      const single = results[0];
      return res.status(200).json({ results: [{ toolCallId: single.toolCallId, result: single.result || '' }] });
    }
    return res.status(200).json({ results: results.map(r => ({ toolCallId: r.toolCallId, result: r.result || '' })) });
  } catch (error) {
    console.error('[Bentley Tools] Fatal:', error.message);
    return res.status(200).json({ toolCallId: 'error', result: `Error: ${error.message}` });
  }
}
