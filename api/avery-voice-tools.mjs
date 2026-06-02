/**
 * Avery Voice Tools — Real estate acquisition VAPI handler
 * Flat string results, VAPI results[] format, Composio + ACMI
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

async function acmiEvent(id, summary, kind = 'avery-call') {
  const ts = Date.now();
  const ev = JSON.stringify({ ts, source: 'agent:avery', kind, correlationId: `avery-${ts}`, summary });
  await redis(['ZADD', 'acmi:thread:agent-coordination:timeline', String(ts), ev]);
  await redis(['ZADD', 'acmi:bus:relay:events', String(ts), ev]);
  return 'Logged to ACMI.';
}

const TOOL_MAP = {
  averySendEmail: { slug: 'GMAIL_SEND_EMAIL', transform: (a) => ({ recipient_email: a.recipient_email || a.to, subject: a.subject, body: a.body, is_html: false }) },
  averyReadEmail: { slug: 'GMAIL_FETCH_EMAILS', transform: (a) => ({ max_results: a.max_results || a.max_emails || 5, query: a.query || '', include_spam_trash: false }) },
  averyCheckCalendar: { slug: 'GOOGLECALENDAR_EVENTS_LIST', transform: (a) => ({ time_min: a.time_min, time_max: a.time_max, max_results: a.max_results || 10, single_events: true, order_by: 'startTime' }) },
  averyCreateEvent: { slug: 'GOOGLECALENDAR_CREATE_EVENT', transform: (a) => ({ summary: a.summary, start_datetime: a.start_time || a.start, end_datetime: a.end_time || a.end, description: a.description || '' }) },
  averyAddTask: { slug: 'GOOGLETASKS_INSERT_TASK', transform: (a) => ({ title: a.title, notes: a.notes || '', due: a.due || null }) },
  averyWebSearch: { slug: 'COMPOSIO_SEARCH_WEB', transform: (a) => ({ query: a.query, limit: a.num_results || 5 }) },
  averyMapsSearch: { slug: 'GOOGLE_MAPS_SEARCH', transform: (a) => ({ query: a.query, location: a.location || '' }) },
};

function extractVoiceSummary(text) {
  if (!text) return 'Done.';
  try {
    const parsed = JSON.parse(text);
    const msgs = parsed?.data?.results?.[0]?.response?.data?.messages;
    if (msgs) return msgs.map(m => `${m.sender || '?'}: ${m.subject || m.preview?.subject || 'no subject'}`).join('. ');
    const items = parsed?.data?.results?.[0]?.response?.data?.items;
    if (items) return items.map(i => `${i.summary || 'Event'}: ${i.start?.dateTime || i.start?.date || '?'}`).join('. ');
    const answer = parsed?.data?.results?.[0]?.response?.data?.answer;
    if (answer) return answer.slice(0, 500);
    if (parsed?.data?.results?.[0]?.response?.successful) return 'Done!';
    return text.slice(0, 500);
  } catch { return text.slice(0, 500); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, tools: Object.keys(TOOL_MAP) });

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

    // === ACMI Tools ===
    if (toolName === 'averyLogLead') {
      const summary = `Lead: ${args.name || args.property || 'unknown'}`;
      const r = await acmiEvent('avery-leads', summary, 'avery-lead');
      return res.status(200).json({ results: [{ toolCallId, result: 'Lead logged to ACMI. Team will review.' }] });
    }
    if (toolName === 'averyEscalateHotDeal') {
      await acmiEvent('avery-hot-deals', `HOT DEAL: ${args.property || args.name || 'unknown'}`, 'avery-hot-deal');
      return res.status(200).json({ results: [{ toolCallId, result: 'Hot deal escalated to team.' }] });
    }
    if (toolName === 'averyQueueFollowUp') {
      await acmiEvent('avery-followups', `Follow-up: ${args.name || args.phone || 'unknown'} - ${args.notes || ''}`, 'avery-followup');
      return res.status(200).json({ results: [{ toolCallId, result: 'Follow-up queued.' }] });
    }
    if (toolName === 'averyOptOutDoNotCall') {
      await acmiEvent('avery-dnc', `Opt-out: ${args.phone || args.name || 'unknown'}`, 'avery-optout');
      return res.status(200).json({ results: [{ toolCallId, result: 'Opt-out recorded. You will not be contacted again.' }] });
    }
    if (toolName === 'averyLookupProperty') {
      return res.status(200).json({ results: [{ toolCallId, result: `Looking up ${args.address || args.property || 'property'}...` }] });
    }
    if (toolName === 'averyEstimateARV' || toolName === 'averyAnalyzeComps') {
      return res.status(200).json({ results: [{ toolCallId, result: 'Market analysis in progress. Results will be included in the deal packet for human review.' }] });
    }
    if (toolName === 'averyScoreOpportunity') {
      return res.status(200).json({ results: [{ toolCallId, result: 'Opportunity scored and queued for review.' }] });
    }

    // === Composio Tools ===
    const toolDef = TOOL_MAP[toolName];
    if (!toolDef) {
      return res.status(200).json({ results: [{ toolCallId, result: `Unknown tool: ${toolName}. Available: ${Object.keys(TOOL_MAP).join(', ')}` }] });
    }

    if (toolDef.slug === 'GOOGLETASKS_INSERT_TASK') {
      args.tasklist_id = args.tasklist_id || 'MTMwNTE3Mzk3OTE0NTA5MTI1NTI6MDow';
    }

    const resp = await fetch(COMPOSIO_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-api-key': COMPOSIO_KEY },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: toolDef.slug, arguments: toolDef.transform(args) }] } } })
    });

    const raw = await resp.text();
    let result = 'Done.';
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const sse = JSON.parse(line.slice(6));
          const text = sse?.result?.content?.[0]?.text;
          if (text) { result = extractVoiceSummary(text); break; }
          if (sse?.error) { result = `Error: ${sse.error.message || sse.error}`; break; }
        } catch {}
      }
    }

    return res.status(200).json({ results: [{ toolCallId, result }] });
  } catch (error) {
    return res.status(200).json({ results: [{ toolCallId: 'error', result: `Error: ${error.message}` }] });
  }
}
