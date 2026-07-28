/**
 * VAPI → Composio + ACMI Webhook Handler — v7
 * Deploy to: https://acmi-product.vercel.app/api/bentley-voice-tools
 *
 * Accepts BOTH VAPI payload shapes:
 *   1. MESSAGE-WRAPPER (what VAPI live calls actually send):
 *      { message: { type: "tool-calls", toolCallList: [ { id, function: { name, arguments } } ] } }
 *   2. FLAT (legacy / manual test):
 *      { name, arguments, toolCallId }
 *
 * ALWAYS returns the VAPI-required response shape:
 *   { results: [ { toolCallId, result: "<string>" } ] }
 *
 * Routes to:
 *   - ACMI fleet tools (Status, Timeline, Signals, Memory, Rollup) via VM Redis REST bridge
 *   - Composio tools (Gmail, Calendar, Tasks, Web, Maps) via tool_router MCP
 */

// ─── Composio ─────────────────────────────────────────────────────────────────
const COMPOSIO_BASE = 'https://backend.composio.dev/tool_router/trs_LuHTrrdOQdEp/mcp';
const COMPOSIO_API_KEY = (typeof process !== 'undefined' && process.env.COMPOSIO_API_KEY) || 'ak_elk9P6oo1zQJ27848GK7';

// ─── ACMI (Self-hosted VM Redis REST bridge) ────────────────────────────────────
const VM_REDIS = 'http://152.53.201.27:8081/exec';
const VM_AUTH = 'Bearer self-hosted';
const ACMI_BUS = 'acmi:madez:bus:events'; // canonical SoT zset

// ─── Tool Map: VAPI tool name → Composio tool slug ──────────────────────────────
const COMPOSIO_MAP = {
  // Gmail — send
  composioSendEmail: 'GMAIL_SEND_EMAIL',
  send_email: 'GMAIL_SEND_EMAIL',
  sendEmail: 'GMAIL_SEND_EMAIL',
  // Gmail — read
  composioReadEmail: 'GMAIL_FETCH_EMAILS',
  read_email: 'GMAIL_FETCH_EMAILS',
  readEmail: 'GMAIL_FETCH_EMAILS',
  fetch_emails: 'GMAIL_FETCH_EMAILS',
  fetchEmails: 'GMAIL_FETCH_EMAILS',
  // Gmail — list threads
  composioListEmail: 'GMAIL_LIST_THREADS',
  list_email: 'GMAIL_LIST_THREADS',
  listEmail: 'GMAIL_LIST_THREADS',
  // Calendar — list
  composioCheckCalendar: 'GOOGLECALENDAR_EVENTS_LIST',
  check_calendar: 'GOOGLECALENDAR_EVENTS_LIST',
  checkCalendar: 'GOOGLECALENDAR_EVENTS_LIST',
  get_calendar: 'GOOGLECALENDAR_EVENTS_LIST',
  // Calendar — create
  composioCreateEvent: 'GOOGLECALENDAR_CREATE_EVENT',
  create_calendar_event: 'GOOGLECALENDAR_CREATE_EVENT',
  createCalendarEvent: 'GOOGLECALENDAR_CREATE_EVENT',
  create_event: 'GOOGLECALENDAR_CREATE_EVENT',
  // Tasks
  composioAddTask: 'GOOGLETASKS_INSERT_TASK',
  add_task: 'GOOGLETASKS_INSERT_TASK',
  addTask: 'GOOGLETASKS_INSERT_TASK',
  // Web search
  composioWebSearch: 'WEB_SEARCH',
  web_search: 'WEB_SEARCH',
  webSearch: 'WEB_SEARCH',
  search: 'WEB_SEARCH',
  // Maps
  composioMapsSearch: 'GOOGLE_MAPS_SEARCH',
  google_maps_search: 'GOOGLE_MAPS_SEARCH',
  googleMapsSearch: 'GOOGLE_MAPS_SEARCH',
  maps_search: 'GOOGLE_MAPS_SEARCH',
  mapsSearch: 'GOOGLE_MAPS_SEARCH',
};

// ─── Redis via VM REST Bridge ───────────────────────────────────────────────────
async function redisCmd(...args) {
  try {
    const r = await fetch(VM_REDIS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: VM_AUTH },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    if (!text) return null;
    // Upstash-style wrapped format: {"result": value}
    if (text.includes('result')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.result !== undefined) return parsed.result;
      } catch {}
    }
    const trimmed = text.trim();
    // RESP integer (":40649") or plain integer
    if (trimmed.startsWith(':')) return parseInt(trimmed.slice(1), 10);
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    // RESP simple string / error
    if (trimmed.startsWith('+')) return trimmed.slice(1).trim();
    if (trimmed.startsWith('-')) return 'Redis error: ' + trimmed.slice(1).trim();
    // JSON array / object
    if (trimmed.startsWith('[') || trimmed.startsWith('*')) {
      try { return JSON.parse(text); } catch { return text; }
    }
    try { return JSON.parse(text); } catch { return text; }
  } catch (e) {
    return 'VM Redis error: ' + e.message;
  }
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

// ─── Composio result formatter ──────────────────────────────────────────────────
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

// ─── ACMI Tool Handlers ─────────────────────────────────────────────────────────
const ACMI = {
  async acmiStatus() {
    const [b, c] = await Promise.all([
      redisCmd('ZCARD', ACMI_BUS),
      redisCmd('ZCARD', 'acmi:thread:agent-coordination:timeline'),
    ]);
    return 'ACMI Fleet — Bus: ' + safeStr(b) + ' events, Coordination: ' + safeStr(c) + ' events. All systems operational.';
  },
  async acmiLogCall({ caller, summary }) {
    const ts = Date.now();
    const evt = JSON.stringify({ ts, source: 'agent:bentley-voice', kind: 'milestone-shipped', correlationId: 'voiceCall-' + ts, summary: '[phone-call @bentley] ' + caller + ': ' + summary });
    await Promise.all([redisCmd('ZADD', ACMI_BUS, ts, evt), redisCmd('ZADD', 'acmi:thread:agent-coordination:timeline', ts, evt)]);
    return 'Call logged: ' + caller + ' — ' + summary;
  },
  async acmiWriteEvent({ id, kind, summary, namespace }) {
    kind = kind || 'coord-note'; namespace = namespace || 'thread';
    const ts = Date.now();
    const evt = JSON.stringify({ ts, source: 'agent:bentley-voice', kind, correlationId: 'voiceEvent-' + ts, summary: '[' + kind + ' @bentley] ' + summary });
    const key = namespace === 'agent' ? 'acmi:agent:' + id + ':timeline' : 'acmi:thread:' + id + ':timeline';
    await Promise.all([redisCmd('ZADD', key, ts, evt), redisCmd('ZADD', ACMI_BUS, ts, evt)]);
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
    const raw = await redisCmd('ZREVRANGE', ACMI_BUS, '0', '499', 'WITHSCORES');
    const matches = [];
    if (Array.isArray(raw)) {
      const ql = (query || '').toLowerCase();
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

// ─── Composio tool executor ─────────────────────────────────────────────────────
async function runComposio(name, args) {
  const toolSlug = COMPOSIO_MAP[name];
  if (!toolSlug) {
    return 'Unknown tool: ' + name + '. ACMI: ' + Object.keys(ACMI).join(', ') + '. Composio: ' + Object.keys(COMPOSIO_MAP).join(', ') + '.';
  }

  // Normalize arguments to each Composio tool's schema
  const params = {};
  if (toolSlug === 'GMAIL_SEND_EMAIL') {
    params.to = args.receiverEmail || args.to;
    if (args.subject) params.subject = args.subject;
    if (args.body) params.body = args.body;
    if (args.cc) params.cc = Array.isArray(args.cc) ? args.cc : [args.cc];
    if (args.bcc) params.bcc = Array.isArray(args.bcc) ? args.bcc : [args.bcc];
    if (args.isHtml || args.is_html) params.is_html = true;
  } else if (toolSlug === 'GOOGLECALENDAR_EVENTS_LIST') {
    if (args.timeMin || args.time_min) params.time_min = args.timeMin || args.time_min;
    if (args.timeMax || args.time_max) params.time_max = args.timeMax || args.time_max;
    if (args.maxResults || args.max_results) params.max_results = args.maxResults || args.max_results;
  } else if (toolSlug === 'GOOGLECALENDAR_CREATE_EVENT') {
    if (args.summary) params.summary = args.summary;
    if (args.start) params.start = args.start;
    if (args.end) params.end = args.end;
    if (args.description) params.description = args.description;
    if (args.attendees) params.attendees = Array.isArray(args.attendees) ? args.attendees : [args.attendees];
  } else {
    Object.assign(params, args);
  }

  // Execute via COMPOSIO_MULTI_EXECUTE_TOOL (tool_router accepts a known slug directly)
  const execR = await fetch(COMPOSIO_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-api-key': COMPOSIO_API_KEY },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', arguments: { tools: [{ tool_slug: toolSlug, arguments: params }], sync_response_to_workbench: false } },
      id: 2,
    }),
  });
  const execText = await execR.text();

  let out = '';
  // SSE (text/event-stream) response
  if (execText.includes('data: ')) {
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
  } else {
    // Plain JSON response
    try {
      const d = JSON.parse(execText);
      if (d.result?.content?.[0]?.text) {
        try { out = formatResult(JSON.parse(d.result.content[0].text)); } catch { out = safeStr(d.result.content[0].text).slice(0, 1000); }
      } else if (d.result) out = formatResult(d.result);
    } catch { out = safeStr(execText).slice(0, 500); }
  }
  return out || ('Tool ' + toolSlug + ' executed.');
}

// ─── Dispatch a single tool call → result string ────────────────────────────────
async function dispatch(name, args) {
  if (!name) return 'Missing tool name in request.';
  args = args || {};
  try {
    if (name.startsWith('acmi')) {
      const fn = ACMI[name];
      if (!fn) return 'Unknown ACMI tool: ' + name + '. Available: ' + Object.keys(ACMI).join(', ');
      const out = String(await fn(args));
      return out && out !== 'null' && out !== 'undefined' ? out : 'Done.';
    }
    const out = await runComposio(name, args);
    return out && out !== 'null' && out !== 'undefined' ? out : 'Done.';
  } catch (e) {
    return 'Error executing ' + name + ': ' + e.message;
  }
}

function coerceArgs(a) {
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return {}; } }
  return a || {};
}

/**
 * Extract a normalized list of tool calls from ANY VAPI payload shape.
 * Returns [{ name, args, toolCallId }]
 */
function extractToolCalls(body) {
  if (!body || typeof body !== 'object') return [];
  const msg = body.message;

  // 1. MESSAGE-WRAPPER with toolCallList (VAPI live "tool-calls" event)
  if (msg && Array.isArray(msg.toolCallList) && msg.toolCallList.length) {
    return msg.toolCallList.map(tc => ({
      name: tc.function?.name || tc.name,
      args: coerceArgs(tc.function?.arguments ?? tc.arguments),
      toolCallId: tc.id || tc.toolCallId,
    }));
  }
  // 1b. OpenAI-style toolCalls array
  if (msg && Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
    return msg.toolCalls.map(tc => ({
      name: tc.function?.name || tc.name,
      args: coerceArgs(tc.function?.arguments ?? tc.arguments),
      toolCallId: tc.id || tc.toolCallId,
    }));
  }
  // 1c. Single tool_call inside message
  if (msg && (msg.tool_call || msg.functionCall)) {
    const tc = msg.tool_call || msg.functionCall;
    return [{
      name: tc.function?.name || tc.name,
      args: coerceArgs(tc.function?.arguments ?? tc.arguments ?? tc.parameters),
      toolCallId: body.toolCallId || tc.id || msg.id,
    }];
  }
  // 1d. Message present but name lives directly on it
  if (msg && (msg.name || msg.functionName)) {
    return [{
      name: msg.name || msg.functionName,
      args: coerceArgs(msg.arguments ?? msg.parameters),
      toolCallId: body.toolCallId || msg.id,
    }];
  }

  // 2. FLAT format: { name, arguments, toolCallId }
  if (body.name) {
    return [{
      name: body.name,
      args: coerceArgs(body.arguments),
      toolCallId: body.toolCallId,
    }];
  }
  return [];
}

// ─── Main Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'bentley-voice-tools v7',
      acmi_tools: Object.keys(ACMI).length,
      composio_tools: Object.keys(COMPOSIO_MAP).length,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const calls = extractToolCalls(req.body);
    console.log('[bentley-voice-tools v7] ' + calls.length + ' tool call(s): ' + calls.map(c => c.name).join(', '));

    if (!calls.length) {
      return res.status(200).json({ results: [{ toolCallId: req.body?.toolCallId || 'unknown', result: 'No tool call found in request.' }] });
    }

    const results = await Promise.all(calls.map(async (c) => ({
      toolCallId: c.toolCallId,
      result: (await dispatch(c.name, c.args)).slice(0, 800),
    })));

    console.log('[bentley-voice-tools v7] → ' + results.map(r => (r.result || '').slice(0, 80)).join(' || '));
    // VAPI-required response shape.
    return res.status(200).json({ results });
  } catch (e) {
    console.error('[bentley-voice-tools v7] Error:', e);
    const fallbackId = req.body?.message?.toolCallList?.[0]?.id || req.body?.toolCallId || 'unknown';
    return res.status(200).json({ results: [{ toolCallId: fallbackId, result: 'Error: ' + e.message + '. Please try again.' }] });
  }
}
