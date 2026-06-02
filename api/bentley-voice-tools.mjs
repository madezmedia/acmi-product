/**
 * Bentley Voice — Tool handler with ACMI read/write + Composio tools
 */

const COMPOSIO_KEY = 'ak_vaOPvXoztdPG9km0Oe4p';
const COMPOSIO_BASE = 'https://backend.composio.dev/tool_router/trs_LuHTrrdOQdEp/mcp';

// Upstash for ACMI ops
const UPSTASH_URL = 'https://loved-platypus-102968.upstash.io';
const UPSTASH_TOKEN = 'gQAAAAAAAZI4AAIgcDJhNDFlNmUwMjQ5ZWI0ZDNmYWUzNDU2NDc4ZWUxMmQwOA';

async function redis(cmd) {
  const r = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  return (await r.json()).result;
}

async function acmiEvent(namespace, id, source, summary, kind = 'coord-note') {
  const ts = Date.now();
  const ev = JSON.stringify({ ts, source, kind, correlationId: `vapi-${ts}`, summary });
  await redis(['ZADD', `acmi:${namespace}:${id}:timeline`, String(ts), ev]);
  await redis(['ZADD', 'acmi:bus:relay:events', String(ts), ev]);
  return `Logged to acmi:${namespace}:${id}`;
}

async function acmiGet(namespace, id) {
  const profile = await redis(['GET', `acmi:${namespace}:${id}:profile`]);
  const signals = await redis(['GET', `acmi:${namespace}:${id}:signals`]);
  const raw = await redis(['ZREVRANGE', `acmi:${namespace}:${id}:timeline`, '0', '4']);
  const timeline = (raw || []).map(e => { try { const d = JSON.parse(e); return `${d.kind}: ${d.summary?.slice(0, 100)}`; } catch { return e.slice(0, 100); } }).join('\n');
  return `Profile: ${(profile || 'none').slice(0, 200)}\nSignals: ${(signals || 'none').slice(0, 200)}\nRecent: ${timeline || 'none'}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, session: 'trs_LuHTrrdOQdEp' });

  try {
    const body = req.body || {};
    const toolCall = body.message?.toolCalls?.[0] || body.toolCalls?.[0] || body;
    const toolCallId = toolCall.id || toolCall.toolCallId || 'unknown';
    const fn = toolCall.function || {};
    const toolName = fn.name || body.name || body.tool || '';
    let args = {};
    try { args = JSON.parse(fn.arguments || '{}'); } catch { args = fn.arguments || body.arguments || body.args || {}; }

    if (!toolName) {
      return res.status(200).json({ results: [{ toolCallId, result: 'No tool specified' }] });
    }

    // === ACMI Tools (direct Upstash, no Composio) ===
    if (toolName === 'acmiWriteEvent') {
      const result = await acmiEvent(args.namespace || 'thread', args.id || 'vapi', 'agent:bentley', args.summary || 'VAPI event', args.kind || 'coord-note');
      return res.status(200).json({ results: [{ toolCallId, result }] });
    }
    if (toolName === 'acmiReadContext') {
      const result = await acmiGet(args.namespace || 'agent', args.id || 'bentley');
      return res.status(200).json({ results: [{ toolCallId, result }] });
    }
    if (toolName === 'acmiLogCall') {
      const summary = `VAPI call from ${args.caller || 'unknown'}: ${args.summary || 'no summary'}`;
      const result = await acmiEvent('thread', 'vapi-calls', 'agent:bentley', summary, 'vapi-call');
      return res.status(200).json({ results: [{ toolCallId, result }] });
    }
    if (toolName === 'acmiStatus') {
      const count = await redis(['ZCARD', 'acmi:thread:agent-coordination:timeline']);
      const bus = await redis(['ZCARD', 'acmi:bus:relay:events']);
      return res.status(200).json({ results: [{ toolCallId, result: `Fleet: ${count} timeline events, ${bus} bus events. ACMI v1.5 live.` }] });
    }

    // === Composio Tools ===
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

    if (slug === 'GOOGLETASKS_INSERT_TASK') {
      args.tasklist_id = args.tasklist_id || 'MTMwNTE3Mzk3OTE0NTA5MTI1NTI6MDow';
    }

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
