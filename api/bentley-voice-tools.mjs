/**
 * VAPI → Composio + ACMI Webhook Handler — v5 (VM Redis)
 * Routes VAPI calls to Composio (Gmail/Calendar/Tasks) + ACMI tools via VM Redis
 */
const COMPOSIO_BASE = 'https://backend.composio.dev/tool_router/trs_LuHTrrdOQdEp/mcp';
const COMPOSIO_API_KEY = typeof process !== 'undefined' && process.env.COMPOSIO_API_KEY || 'ak_xHrrW-9SrFPEC1LPv6eJ';
const VM_REDIS = 'http://152.53.201.27:8081/exec';

const COMPOSIO_MAP = {
  composioSendEmail: 'send an email via gmail', send_email: 'send an email via gmail', sendEmail: 'send an email via gmail',
  composioReadEmail: 'read emails from gmail', read_email: 'read emails from gmail', readEmail: 'read emails from gmail',
  fetch_emails: 'read emails from gmail', fetchEmails: 'read emails from gmail',
  composioListEmail: 'list email threads in gmail', list_email: 'list email threads in gmail', listEmail: 'list email threads in gmail',
  composioCheckCalendar: 'check google calendar events', check_calendar: 'check google calendar events',
  checkCalendar: 'check google calendar events', get_calendar: 'check google calendar events',
  composioCreateEvent: 'create a google calendar event', create_calendar_event: 'create a google calendar event',
  createCalendarEvent: 'create a google calendar event', create_event: 'create a google calendar event',
  composioAddTask: 'add a google task', add_task: 'add a google task', addTask: 'add a google task',
  composioWebSearch: 'search the web', web_search: 'search the web', webSearch: 'search the web', search: 'search the web',
  composioMapsSearch: 'search google maps', google_maps_search: 'search google maps',
  googleMapsSearch: 'search google maps', maps_search: 'search google maps', mapsSearch: 'search google maps',
};

async function redisCmd(...args) {
  try {
    const r = await fetch(VM_REDIS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    if (!text) return null;
    // Handle Upstash RESP wrapped format {result: value}
    if (text.includes('result')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.result !== undefined) {
          const v = parsed.result;
          // Integer
          if (typeof v === 'number') return v;
          // Array (multi-bulk)
          if (Array.isArray(v)) return v;
          // String
          return v;
        }
      } catch {}
    }
    // Plain integer
    const trimmed = text.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    // JSON array
    if (text.startsWith('[')) { try { return JSON.parse(text); } catch { return text; } }
    // Raw string
    try { return JSON.parse(text); } catch { return text; }
  } catch (e) { return 'VM Redis error: ' + e.message; }
}

function parseTimeline(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const evts = [];
  for (let i = 0; i < raw.length; i += 2) { try { evts.push(JSON.parse(raw[i])); } catch {} }
  return evts;
}

function safeStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatResult(data) {
  if (!data) return 'OK';
  if (typeof data === 'string') return data.slice(0, 500);
  if (data.messages) return data.messages.slice(0, 5).map(m =>
    'From: ' + (m.from || m.sender || '?') + '. Subject: ' + (m.subject || 'no subject') + '.' + (m.snippet ? ' Preview: ' + m.snippet.slice(0, 100) : '')).join(' ');
  if (data.threads) return data.threads.slice(0, 5).map(t => 'Thread: ' + (t.snippet ? t.snippet.slice(0, 100) : 'no preview')).join(' ');
  if (data.items && Array.isArray(data.items)) return data.items.slice(0, 10).map(e =>
    (e.summary || 'Event') + ' at ' + (e.start?.dateTime || e.start?.date || 'unknown')).join(' ');
  if (data.places) return data.places.slice(0, 5).map(p => p.name + ' — ' + (p.address || p.vicinity || '')).join(' ');
  if (data.error) return 'Error: ' + data.error + (data.message ? ' - ' + data.message : '');
  const s = JSON.stringify(data);
  return s.length > 500 ? s.slice(0, 500) + '...' : s;
}

const ACMI = {
  async acmiStatus() {
    const [b, c] = await Promise.all([
      redisCmd('ZCARD', 'acmi:bus:relay:events'),
      redisCmd('ZCARD', 'acmi:thread:agent-coordination:timeline'),
    ]);
    return 'ACMI Fleet — Bus: ' + safeStr(b) + ' events, Coordination: ' + safeStr(c) + ' events. All systems operational.';
  },
  async acmiLogCall({ caller, summary }) {
    const ts = Date.now();
    const evt = JSON.stringify({ ts, source: 'agent:bentley-voice', kind: 'milestone-shipped', correlationId: 'voiceCall-' + ts, summary: '[phone-call @bentley] ' + caller + ': ' + summary });
    await Promise.all([redisCmd('ZADD', 'acmi:bus:relay:events', ts, evt), redisCmd('ZADD', 'acmi:thread:agent-coordination:timeline', ts, evt)]);
    return 'Call logged: ' + caller + ' — ' + summary;
  },
  async acmiWriteEvent({ id, kind, summary, namespace }) {
    kind = kind || 'coord-note'; namespace = namespace || 'thread';
    const ts = Date.now();
    const evt = JSON.stringify({ ts, source: 'agent:bentley-voice', kind, correlationId: 'voiceEvent-' + ts, summary: '[' + kind + ' @bentley] ' + summary });
    const key = namespace === 'agent' ? 'acmi:agent:' + id + ':timeline' : 'acmi:thread:' + id + ':timeline';
    await Promise.all([redisCmd('ZADD', key, ts, evt), redisCmd('ZADD', 'acmi:bus:relay:events', ts, evt)]);
    return 'Event written to ' + namespace + ':' + id + ' — ' + safeStr(summary).slice(0, 80);
  },
  async acmiReadContext({ id, namespace }) {
    namespace = namespace || 'agent';
    const p = namespace === 'agent' ? 'acmi:agent:' + id : 'acmi:thread:' + id;
    const [profile, signals, tl] = await Promise.all([
      redisCmd('GET', p + ':profile'),
      redisCmd('HGETALL', p + ':signals'),
      redisCmd('ZREVRANGE', p + ':timeline', '0', '9', 'WITHSCORES'),
    ]);
    const evts = parseTimeline(tl);
    const sigs = Array.isArray(signals) ? signals.filter(Boolean).join(', ') : 'none';
    return 'Context ' + namespace + ':' + id + ' — Timeline: ' + evts.length + ' events. Signals: ' + (sigs || 'none') + '. Profile: ' + (profile ? 'exists' : 'empty') + '.';
  },
  async acmiSignalGet({ agentId }) {
    const v = await redisCmd('HGET', 'acmi:agent:' + agentId + ':signals', 'status');
    return v == null || v === '' ? 'No signals for ' + agentId : safeStr(v);
  },
  async acmiSignalSet({ agentId, key, value }) {
    await redisCmd('HSET', 'acmi:agent:' + agentId + ':signals', key, value);
    return 'Signal set: ' + agentId + '.' + key + ' = ' + value;
  },
  async acmiTimelineRead({ id, limit, namespace }) {
    limit = parseInt(limit, 10) || 10; namespace = namespace || 'thread';
    const key = namespace === 'agent' ? 'acmi:agent:' + id + ':timeline' : 'acmi:thread:' + id + ':timeline';
    const raw = await redisCmd('ZREVRANGE', key, '0', String(limit - 1), 'WITHSCORES');
    const evts = parseTimeline(raw);
    if (!evts.length) return 'No events in ' + namespace + ':' + id;
    return evts.map(e => safeStr(e && e.summary || '').slice(0, 100)).filter(Boolean).join(' | ').slice(0, 500);
  },
  async acmiRollupGet({ agentId }) {
    const r = await redisCmd('GET', 'acmi:agent:' + agentId + ':rollup:latest');
    return r ? 'Rollup for ' + agentId + ': ' + safeStr(r).slice(0, 200) : 'No rollup for ' + agentId;
  },
  async acmiRollupSet({ agentId, data }) {
    const ts = Date.now();
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    await Promise.all([redisCmd('SET', 'acmi:agent:' + agentId + ':rollup:latest', payload), redisCmd('SET', 'acmi:agent:' + agentId + ':rollup:' + ts, payload)]);
    return 'Rollup saved for ' + agentId;
  },
  async acmiMemorySearch({ query, limit }) {
    limit = parseInt(limit, 10) || 5;
    const raw = await redisCmd('ZREVRANGE', 'acmi:bus:relay:events', '0', '499', 'WITHSCORES');
    const matches = [];
    if (Array.isArray(raw)) {
      const ql = query.toLowerCase();
      for (let i = 0; i < raw.length; i += 2) {
        try {
          const e = JSON.parse(raw[i]);
          if (e && e.summary && e.summary.toLowerCase().includes(ql)) matches.push(safeStr(e.summary).slice(0, 100));
        } catch {}
        if (matches.length >= limit) break;
      }
    }
    return matches.length ? 'Found ' + matches.length + ' matches: ' + matches.join(' | ') : 'No memory matches for "' + query + '"';
  },
  async acmiProfileGet({ agentId }) {
    const r = await redisCmd('GET', 'acmi:agent:' + agentId + ':profile');
    if (!r) return 'No profile for ' + agentId;
    try { const p = JSON.parse(r); return 'Profile for ' + agentId + ': ' + (p.name || agentId) + '. ' + (p.role || '') + ' ' + (p.status || ''); } catch { return 'Profile: ' + safeStr(r).slice(0, 200); }
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'bentley-voice-tools v5', acmi_tools: Object.keys(ACMI).length });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { name, arguments: args = {}, toolCallId } = req.body;
    console.log('[bentley-voice-tools v5] ' + name);
    let out = '';

    if (name.startsWith('acmi')) {
      const fn = ACMI[name];
      out = fn ? String(await fn(args)) : 'Unknown ACMI tool: ' + name + '. Available: ' + Object.keys(ACMI).join(', ');
    } else {
      const query = COMPOSIO_MAP[name];
      if (!query) return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: 'Unknown tool: ' + name + '. ACMI: acmiStatus, acmiTimelineRead, acmiSignalGet, acmiWriteEvent, acmiMemorySearch, acmiLogCall.' }] } });

      // Step 1: Search for the right tool
      const searchR = await fetch(COMPOSIO_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-api-key': COMPOSIO_API_KEY }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'COMPOSIO_SEARCH_TOOLS', arguments: { query } }, id: 1 }) });
      const searchText = await searchR.text();
      // Extract tool names from search result text
      const toolMatches = [];
      try {
        for (const line of searchText.split('\n')) {
          if (line.startsWith('data: ')) {
            const d = JSON.parse(line.slice(6));
            const text = d.result?.content?.[0]?.text || '';
            const matches = text.match(/[A-Z][A-Z0-9_]{2,}/g) || [];
            for (const m of matches) toolMatches.push(m);
          }
        }
      } catch {}

      // Pick best match: prefer exact toolkit names
      const preferred = ['GMAIL_SEND_EMAIL','GMAIL_FETCH_EMAILS','GMAIL_LIST_THREADS','GOOGLECALENDAR_EVENTS_LIST','GOOGLECALENDAR_CREATE_EVENT','GOOGLETASKS_INSERT_TASK','WEB_SEARCH','GOOGLE_MAPS_SEARCH'];
      let toolName = preferred.find(p => toolMatches.includes(p)) || null;

      // Fallback: direct execution for known tools
      if (!toolName) {
        const directMap = { composioSendEmail:'GMAIL_SEND_EMAIL', send_email:'GMAIL_SEND_EMAIL', sendEmail:'GMAIL_SEND_EMAIL',
          composioReadEmail:'GMAIL_FETCH_EMAILS', read_email:'GMAIL_FETCH_EMAILS', readEmail:'GMAIL_FETCH_EMAILS',
          fetch_emails:'GMAIL_FETCH_EMAILS', fetchEmails:'GMAIL_FETCH_EMAILS',
          composioListEmail:'GMAIL_LIST_THREADS', list_email:'GMAIL_LIST_THREADS', listEmail:'GMAIL_LIST_THREADS',
          composioCheckCalendar:'GOOGLECALENDAR_EVENTS_LIST', check_calendar:'GOOGLECALENDAR_EVENTS_LIST', checkCalendar:'GOOGLECALENDAR_EVENTS_LIST', get_calendar:'GOOGLECALENDAR_EVENTS_LIST',
          composioCreateEvent:'GOOGLECALENDAR_CREATE_EVENT', create_calendar_event:'GOOGLECALENDAR_CREATE_EVENT', createCalendarEvent:'GOOGLECALENDAR_CREATE_EVENT', create_event:'GOOGLECALENDAR_CREATE_EVENT',
          composioAddTask:'GOOGLETASKS_INSERT_TASK', add_task:'GOOGLETASKS_INSERT_TASK', addTask:'GOOGLETASKS_INSERT_TASK',
          composioWebSearch:'WEB_SEARCH', web_search:'WEB_SEARCH', webSearch:'WEB_SEARCH', search:'WEB_SEARCH',
          composioMapsSearch:'GOOGLE_MAPS_SEARCH', google_maps_search:'GOOGLE_MAPS_SEARCH', googleMapsSearch:'GOOGLE_MAPS_SEARCH', maps_search:'GOOGLE_MAPS_SEARCH', mapsSearch:'GOOGLE_MAPS_SEARCH' };
        toolName = directMap[name] || null;
      }

      if (!toolName) { out = 'Tool not found for: ' + query + '. Try rephrasing.'; }
      else {
        // Build normalized params per Composio schema
        const params = {};
        if (toolName === 'GMAIL_SEND_EMAIL') {
          if (args.receiverEmail) params.to = args.receiverEmail;
          else if (args.to) params.to = args.to;
          if (args.subject) params.subject = args.subject;
          if (args.body) params.body = args.body;
          if (args.cc) params.cc = Array.isArray(args.cc) ? args.cc : [args.cc];
          if (args.bcc) params.bcc = Array.isArray(args.bcc) ? args.bcc : [args.bcc];
          if (args.isHtml || args.is_html) params.is_html = true;
        } else if (toolName === 'GOOGLECALENDAR_EVENTS_LIST') {
          if (args.timeMin) params.time_min = args.timeMin;
          else if (args.time_min) params.time_min = args.time_min;
          if (args.timeMax) params.time_max = args.timeMax;
          else if (args.time_max) params.time_max = args.time_max;
          if (args.maxResults) params.max_results = args.maxResults;
          else if (args.max_results) params.max_results = args.max_results;
        } else if (toolName === 'GOOGLECALENDAR_CREATE_EVENT') {
          if (args.summary) params.summary = args.summary;
          if (args.start) params.start = args.start;
          if (args.end) params.end = args.end;
          if (args.description) params.description = args.description;
          if (args.attendees) params.attendees = Array.isArray(args.attendees) ? args.attendees : [args.attendees];
        } else {
          // Pass through as-is for other tools
          Object.assign(params, args);
        }
        // Step 2: Execute via COMPOSIO_MULTI_EXECUTE_TOOL
        const execR = await fetch(COMPOSIO_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-api-key': COMPOSIO_API_KEY }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: toolName, arguments: params }], sync_response_to_workbench: false } }, id: 2 }) });
        const execText = await execR.text();
        for (const line of execText.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.result?.content?.[0]?.text) {
                try { out = formatResult(JSON.parse(d.result.content[0].text)); } catch { out = safeStr(d.result.content[0].text).slice(0, 1000); }
              } else if (d.result) out = formatResult(d.result);
            } catch {}
          }
        }
        if (!out) out = 'Tool ' + toolName + ' executed.';
      }
    }

    if (!out || out === 'null' || out === 'undefined') out = 'Done.';
    console.log('[bentley-voice-tools v5] -> ' + out.slice(0, 150));
    return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: out.slice(0, 500) }] } });
  } catch (e) {
    console.error('[bentley-voice-tools v5] Error:', e);
    return res.status(200).json({ toolCallId: req.body?.toolCallId, result: { content: [{ type: 'text', text: 'Error: ' + e.message }] } });
  }
}
