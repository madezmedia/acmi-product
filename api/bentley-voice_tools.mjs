/**
 * VAPI → Composio Webhook Handler — v8 (All tools working)
 */

const COMPOSIO_BASE = 'https://backend.composio.dev/tool_router/trs_LuHTrrdOQdEp/mcp';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'ak_xHrrW-9SrFPEC1LPv6eJ';

// Sent messaging — direct REST (not Composio)
const SENT_API_BASE = 'https://api.sent.dm/v3';
const SENT_API_KEY = process.env.SENT_API_KEY || '';

const TOOL_MAP = {
  composioSendEmail: { slug: 'GMAIL_SEND_EMAIL', transform: (a) => ({ recipient_email: a.recipient_email, subject: a.subject, body: a.body, is_html: false }) },
  composioReadEmail: { slug: 'GMAIL_FETCH_EMAILS', transform: (a) => ({ max_results: a.max_results || 5, query: a.query || '', include_spam_trash: false }) },
  composioCheckCalendar: { slug: 'GOOGLECALENDAR_EVENTS_LIST', transform: (a) => ({ time_min: a.time_min, time_max: a.time_max, max_results: a.max_results || 10, single_events: true, order_by: 'startTime' }) },
  composioCreateEvent: { slug: 'GOOGLECALENDAR_CREATE_EVENT', transform: (a) => ({ summary: a.summary, start_datetime: a.start_time, end_datetime: a.end_time, description: a.description || '' }) },
  composioAddTask: { slug: 'GOOGLETASKS_INSERT_TASK', transform: (a) => ({ title: a.title, notes: a.notes || '', due: a.due || null }) },
  composioWebSearch: { slug: 'COMPOSIO_SEARCH_WEB', transform: (a) => ({ query: a.query, limit: a.num_results || 5 }) },
  composioMapsSearch: { slug: 'GOOGLE_MAPS_SEARCH', transform: (a) => ({ query: a.query, location: a.location || '' }) },
  // Sent messaging
  bentleySendMessage: { slug: '__SENT__', transform: null },
};

function extractResponse(inner) {
  if (!inner || inner === 'null') return '';
  try {
    const o = JSON.parse(inner);
    // Walk: data → results[N] → response
    const results = o?.data?.results || o?.results;
    if (!results || !Array.isArray(results)) return '';

    for (const r of results) {
      const resp = r.response || {};
      const payload = resp.data_preview || resp.data || {};

      // Errors
      if (r.error || resp.error) {
        const err = r.error || resp.error;
        return `Not available: ${typeof err === 'string' ? err.substring(0,200) : (err?.message || 'error')}.`;
      }

      // Email messages
      if (payload.messages) {
        return payload.messages.slice(0, 5).map(m =>
          `From: ${m.sender || m.from || '?'} — Subject: ${m.subject || 'no subject'}`
        ).join('. ');
      }
      // Calendar items
      if (payload.items) {
        return payload.items.slice(0, 8).map(e =>
          `${e.summary || 'Event'}: ${e.start?.dateTime || e.start?.date || '?'}`
        ).join('. ');
      }
      // Web search answer
      if (payload.answer) {
        return payload.answer.substring(0, 500);
      }
      // Task result
      if (payload.id) return 'Task created.';
      // Success
      if (resp.successful) return payload.display_url || 'Done!';
    }

    if (o.successful || o.success_count > 0) return 'Done!';
    if (o.error) return `Error: ${o.error}`;
    return '';
  } catch { return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'bentley-voice-tools', tools: Object.keys(TOOL_MAP) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { name, arguments: args = {}, toolCallId } = req.body;
    const toolDef = TOOL_MAP[name];
    if (!toolDef) return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: `Unknown tool.` }] } });

    // Sent messaging — direct REST call
    if (toolDef.slug === '__SENT__') {
      if (!SENT_API_KEY) {
        return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: 'Sent API key not configured. Ask Mikey to add SENT_API_KEY to .env.' }] } });
      }
      const sentResp = await fetch(`${SENT_API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': SENT_API_KEY },
        body: JSON.stringify({
          recipients: [{
            to: args.to,
            channel: args.channel || 'sms',
            body: args.body
          }]
        })
      });
      const sentData = await sentResp.json();
      const status = sentData?.data?.status || 'sent';
      const msgId = sentData?.data?.recipients?.[0]?.message_id || '';
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: `Message ${status}.${msgId ? ' ID: ' + msgId : ''}` }] } });
    }

    const resp = await fetch(COMPOSIO_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-api-key': COMPOSIO_API_KEY },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: toolDef.slug, arguments: toolDef.transform(args) }] } } })
    });

    const raw = await resp.text();
    let resultText = '';

    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const sse = JSON.parse(line.slice(6));
          const inner = sse?.result?.content?.[0]?.text;
          if (inner) { resultText = extractResponse(inner); if (resultText) break; }
          if (sse?.error) { resultText = `Error: ${sse.error.message || ''}`; break; }
        } catch {}
      }
    }

    if (!resultText) resultText = 'Done.';
    return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: resultText }] } });
  } catch (error) {
    return res.status(200).json({ toolCallId: req.body?.toolCallId, result: { content: [{ type: 'text', text: `Error: ${error.message}` }] } });
  }
}
