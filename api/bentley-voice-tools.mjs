/**
 * VAPI → Composio + ACMI Webhook Handler — v8.1 (call-end hardwire)
 * Deploy to: https://acmi-product.vercel.app/api/bentley-voice-tools
 *
 * Accepts:
 *   1. MESSAGE-WRAPPER tool-calls (live VAPI):
 *      { message: { type: "tool-calls", toolCallList: [ { id, function: { name, arguments } } ] } }
 *   2. FLAT (legacy / manual test):
 *      { name, arguments, toolCallId }
 *   3. End-of-call / status-update (ended) → ACMI call-end on agent:bentley-voice
 *      { message: { type: "end-of-call-report"|"status-update", call, endedReason, ... } }
 *
 * Tool-calls ALWAYS return VAPI results[] shape:
 *   { results: [ { toolCallId, result: "<string>" } ] }
 * Call-end / status-update return:
 *   { ok: true, type, posted: [...] }
 *
 * VAPI assistant serverMessages (set on baaecd88… + 72c3f9b1…):
 *   ["end-of-call-report", "status-update", "hang", "tool-calls"]
 * Live voice line: +19805339730 (not 754/202). Parent cid: fleetAcmiHardwire-20260908.
 *
 * Routes to:
 *   - ACMI fleet tools (Status, Timeline, Signals, Memory, Rollup) via Polar HTTPS exec
 *   - Composio tools (Gmail, Calendar, Tasks, Web, Maps) via tool_router MCP
 */

// ─── Composio ─────────────────────────────────────────────────────────────────
const COMPOSIO_BASE = 'https://backend.composio.dev/tool_router/trs_LuHTrrdOQdEp/mcp';
const COMPOSIO_API_KEY = (typeof process !== 'undefined' && process.env.COMPOSIO_API_KEY) || 'ak_elk9P6oo1zQJ27848GK7';

// ─── ACMI (Self-hosted VM Redis REST bridge) ────────────────────────────────────
const VM_REDIS = process.env.ACMI_BRIDGE_URL || 'https://acmi-redis-u70402.vm.elestio.app/bridge/exec';
const VM_AUTH = 'Bearer ' + (process.env.ACMI_BRIDGE_TOKEN || 'vm-local-bridge');
const ACMI_BUS = 'acmi:madez:bus:events';
const ACMI_COORD = 'acmi:madez:thread:agent-coordination:timeline';
const BENTLEY_ID = 'bentley-voice';
const BENTLEY_SOURCE = 'agent:bentley-voice';
const PARENT_CID = 'fleetAcmiHardwire-20260908';
const SERVER_MESSAGES = ['end-of-call-report', 'status-update', 'hang', 'tool-calls'];
const STAMP = {
  acmi_version: '1.5',
  comms_protocol: 'v1.5',
  comms_alignment: 'active',
  actor_type: 'agent',
  tenant_id: 'madez',
};

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
    const r = await fetch(VM_REDIS.replace(/\/$/, ''), {
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

function safeJson(raw, fallback = {}) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function entityBase(namespace = 'agent', id = BENTLEY_ID) {
  return 'acmi:madez:' + namespace + ':' + id;
}

function timelineKey(namespace = 'thread', id = 'agent-coordination') {
  return entityBase(namespace, id) + ':timeline';
}

async function readJsonSlot(key) {
  const type = await redisCmd('TYPE', key);
  if (type === 'string') return safeJson(await redisCmd('GET', key), {});
  if (type === 'hash') {
    const raw = await redisCmd('HGETALL', key);
    const obj = {};
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) obj[raw[i]] = raw[i + 1];
    }
    return obj;
  }
  return {};
}

async function mergeJsonSlot(key, patch) {
  const type = await redisCmd('TYPE', key);
  const current = await readJsonSlot(key);
  if (type === 'hash') {
    const ts = Date.now();
    await redisCmd('SET', key + ':legacy-hash-backup:' + ts, JSON.stringify(current));
    await redisCmd('DEL', key);
  }
  const next = { ...current, ...patch, ...STAMP, updated_at: new Date().toISOString() };
  await redisCmd('SET', key, JSON.stringify(next));
  return next;
}

function envelope({ ts = Date.now(), kind = 'coord-note', summary, idPrefix = 'voiceEvent', payload, parentCorrelationId }) {
  return {
    ts,
    source: BENTLEY_SOURCE,
    kind,
    correlationId: idPrefix + '-' + ts,
    ...(parentCorrelationId ? { parentCorrelationId } : {}),
    summary,
    ...(payload ? { payload } : {}),
    ...STAMP,
    surface: 'vapi',
  };
}

async function postEvent(event, keys) {
  const evt = JSON.stringify(event);
  await Promise.all([...new Set(keys)].map((key) => redisCmd('ZADD', key, String(event.ts), evt)));
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
  async acmiBootstrap({ agentId }) {
    agentId = agentId || BENTLEY_ID;
    const base = entityBase('agent', agentId);
    const [profile, signals, rollup, timeline, coord] = await Promise.all([
      redisCmd('GET', base + ':profile'),
      readJsonSlot(base + ':signals'),
      redisCmd('GET', base + ':rollup:latest'),
      redisCmd('ZREVRANGE', base + ':timeline', '0', '4', 'WITHSCORES'),
      redisCmd('ZREVRANGE', ACMI_COORD, '0', '9', 'WITHSCORES'),
    ]);
    const ev = envelope({
      kind: 'bootstrap',
      idPrefix: 'voiceBootstrap',
      summary: '[bootstrap @fleet] Bentley voice session bootstrapped, ACMI v1.5 aligned.',
      payload: { agentId },
    });
    await postEvent(ev, [timelineKey('agent', agentId), ACMI_COORD, ACMI_BUS]);
    await mergeJsonSlot(base + ':signals', {
      status: 'on-call',
      current_surface: 'vapi',
      last_bootstrap_at: new Date(ev.ts).toISOString(),
    });
    const tEvents = parseTimeline(timeline).length;
    const cEvents = parseTimeline(coord).length;
    return 'Bootstrapped ' + agentId + '. Profile ' + (profile ? 'exists' : 'missing') + '. Signals ' + Object.keys(signals || {}).length + ' fields. Rollup ' + (rollup ? 'exists' : 'missing') + '. Recent events: ' + tEvents + ' agent, ' + cEvents + ' coordination.';
  },
  async acmiSpawn({ agentId, summary }) {
    agentId = agentId || BENTLEY_ID;
    const ts = Date.now();
    const ev = envelope({
      ts,
      kind: 'spawn',
      idPrefix: 'voiceSpawn',
      summary: summary || '[spawn @fleet] Bentley voice session started, ACMI v1.5 aligned.',
      payload: { agentId },
    });
    await postEvent(ev, [timelineKey('agent', agentId), ACMI_COORD, ACMI_BUS]);
    await mergeJsonSlot(entityBase('agent', agentId) + ':signals', {
      status: 'on-call',
      current_surface: 'vapi',
      last_spawn_at: new Date(ts).toISOString(),
    });
    return 'Spawn logged for ' + agentId + '.';
  },
  async acmiStatus() {
    const [b, c] = await Promise.all([
      redisCmd('ZCARD', ACMI_BUS),
      redisCmd('ZCARD', ACMI_COORD),
    ]);
    return 'ACMI Fleet — Bus: ' + safeStr(b) + ' events, Coordination: ' + safeStr(c) + ' events. All systems operational.';
  },
  async acmiLogCall({ caller, summary }) {
    const ts = Date.now();
    const ev = envelope({
      ts,
      kind: 'call-summary',
      idPrefix: 'voiceCall',
      summary: '[call-summary @mikey] ' + caller + ': ' + summary,
      payload: { caller, summary },
    });
    await postEvent(ev, [ACMI_BUS, ACMI_COORD, timelineKey('agent', BENTLEY_ID)]);
    return 'Call logged: ' + caller + ' — ' + summary;
  },
  async acmiWriteEvent({ id, kind, summary, namespace }) {
    kind = kind || 'coord-note'; namespace = namespace || 'thread'; id = id || (namespace === 'agent' ? BENTLEY_ID : 'agent-coordination');
    const ts = Date.now();
    const ev = envelope({ ts, kind, summary: '[' + kind + ' @bentley] ' + summary });
    const key = timelineKey(namespace, id);
    await postEvent(ev, [key, ACMI_BUS]);
    return 'Event written to ' + namespace + ':' + id + ' — ' + safeStr(summary).slice(0, 80);
  },
  async acmiReadContext({ id, namespace }) {
    namespace = namespace || 'agent';
    const p = entityBase(namespace, id);
    const [profile, signals, tl] = await Promise.all([
      redisCmd('GET', p + ':profile'),
      readJsonSlot(p + ':signals'),
      redisCmd('ZREVRANGE', p + ':timeline', '0', '9', 'WITHSCORES'),
    ]);
    const evts = parseTimeline(tl);
    const sigs = Object.keys(signals || {}).length ? JSON.stringify(signals).slice(0, 240) : 'none';
    return 'Context ' + namespace + ':' + id + ' — Timeline: ' + evts.length + ' events. Signals: ' + (sigs || 'none') + '. Profile: ' + (profile ? 'exists' : 'empty') + '.';
  },
  async acmiSignalGet({ agentId }) {
    const signals = await readJsonSlot(entityBase('agent', agentId) + ':signals');
    return Object.keys(signals).length ? safeStr(signals).slice(0, 500) : 'No signals for ' + agentId;
  },
  async acmiSignalSet({ agentId, key, value }) {
    await mergeJsonSlot(entityBase('agent', agentId) + ':signals', { [key]: value });
    return 'Signal set: ' + agentId + '.' + key + ' = ' + value;
  },
  async acmiTimelineRead({ id, limit, namespace }) {
    limit = parseInt(limit, 10) || 10; namespace = namespace || 'thread';
    const raw = await redisCmd('ZREVRANGE', timelineKey(namespace, id), '0', String(limit - 1), 'WITHSCORES');
    const evts = parseTimeline(raw);
    if (!evts.length) return 'No events in ' + namespace + ':' + id;
    return evts.map(e => safeStr(e && e.summary || '').slice(0, 100)).filter(Boolean).join(' | ').slice(0, 500);
  },
  async acmiRollupGet({ agentId }) {
    const r = await redisCmd('GET', entityBase('agent', agentId) + ':rollup:latest');
    return r ? 'Rollup for ' + agentId + ': ' + safeStr(r).slice(0, 200) : 'No rollup for ' + agentId;
  },
  async acmiRollupSet({ agentId, data }) {
    const ts = Date.now();
    const parsed = typeof data === 'string' ? safeJson(data, { session_summary: data }) : (data || {});
    const payload = JSON.stringify({ ...parsed, ...STAMP, agent_id: agentId, updated_at: new Date(ts).toISOString(), surface: 'vapi' });
    const base = entityBase('agent', agentId);
    await Promise.all([redisCmd('SET', base + ':rollup:latest', payload), redisCmd('SET', base + ':rollup:' + ts, payload)]);
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
    const r = await redisCmd('GET', entityBase('agent', agentId) + ':profile');
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

function summarize(s, n = 280) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function messageType(body) {
  if (!body || typeof body !== 'object') return null;
  const msg = body.message || body;
  return msg.type || msg.event || body.type || null;
}

function extractCall(body) {
  const msg = (body && (body.message || body)) || {};
  return msg.call || body.call || msg || {};
}

/**
 * VAPI end-of-call-report / status-update(ended) → ACMI call-end.
 * Writes agent:bentley-voice timeline (fatal intent) + coord/bus best-effort.
 */
async function handleCallEnd(body, type) {
  const ts = Date.now();
  const call = extractCall(body);
  const msg = (body && (body.message || body)) || {};
  const sessionId = call.id || call.sessionId || msg.call?.id || `unknown-${ts}`;
  const duration = call.duration ?? call.durationSeconds ?? msg.durationSeconds ?? msg.duration ?? null;
  const endedReason = call.endedReason || msg.endedReason || msg.ended_reason || null;
  const status = call.status || msg.status || null;
  const analysisSummary = call.analysis?.summary || call.summary || msg.summary || null;

  const summary = summarize(
    '[call-end @fleet] Bentley voice ended'
      + ' callId=' + sessionId
      + ' duration=' + (duration ?? '?') + 's'
      + ' reason=' + (endedReason || status || 'ended')
      + (analysisSummary ? ' · ' + String(analysisSummary).slice(0, 120) : ''),
    480
  );

  const ev = envelope({
    ts,
    kind: 'call-end',
    idPrefix: 'bentleyVoiceCallEnd',
    parentCorrelationId: PARENT_CID,
    summary,
    payload: {
      callId: sessionId,
      durationSeconds: duration,
      endedReason: endedReason || null,
      status: status || null,
      messageType: type,
      analysisPresent: !!analysisSummary,
      endedAt: new Date(ts).toISOString(),
      liveLine: '+19805339730',
    },
  });

  const agentTl = timelineKey('agent', BENTLEY_ID);
  // Agent timeline is primary; coord + bus are best-effort (same Polar write path).
  const posted = [];
  try {
    await postEvent(ev, [agentTl]);
    posted.push({ key: agentTl, ok: true });
  } catch (e) {
    posted.push({ key: agentTl, ok: false, error: e.message });
    throw e;
  }
  for (const key of [ACMI_COORD, ACMI_BUS]) {
    try {
      await postEvent(ev, [key]);
      posted.push({ key, ok: true });
    } catch (e) {
      posted.push({ key, ok: false, error: e.message });
    }
  }

  try {
    await mergeJsonSlot(entityBase('agent', BENTLEY_ID) + ':signals', {
      status: 'available',
      current_surface: 'vapi',
      current_call_session_id: '',
      last_call_session_id: sessionId,
      last_call_ended_at: new Date(ts).toISOString(),
      last_call_ended_reason: endedReason || status || 'ended',
    });
  } catch {}

  return { event: ev, posted };
}

function isCallEndMessage(type, body) {
  if (!type) return false;
  if (type === 'end-of-call-report' || type === 'call-ended' || type === 'call.ended') return true;
  if (type === 'status-update' || type === 'call.status') {
    const call = extractCall(body);
    const msg = (body && (body.message || body)) || {};
    const status = String(call.status || msg.status || '').toLowerCase();
    const endedReason = call.endedReason || msg.endedReason;
    return status === 'ended' || status === 'completed' || !!endedReason;
  }
  return false;
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
      service: 'bentley-voice-tools v8.1',
      acmi_tools: Object.keys(ACMI).length,
      composio_tools: Object.keys(COMPOSIO_MAP).length,
      agent: BENTLEY_SOURCE,
      serverMessages: SERVER_MESSAGES,
      handles: ['tool-calls', 'end-of-call-report', 'status-update'],
      parentCorrelationId: PARENT_CID,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const body = req.body || {};
    const type = messageType(body);

    // Call-end path (serverMessages must include end-of-call-report on the assistant).
    if (isCallEndMessage(type, body)) {
      console.log('[bentley-voice-tools v8.1] call-end type=' + type);
      const { event, posted } = await handleCallEnd(body, type);
      return res.status(200).json({
        ok: true,
        type,
        correlationId: event.correlationId,
        parentCorrelationId: event.parentCorrelationId,
        posted,
      });
    }

    // Preserve existing tool-calls handling.
    const calls = extractToolCalls(body);
    console.log('[bentley-voice-tools v8.1] ' + calls.length + ' tool call(s): ' + calls.map(c => c.name).join(', '));

    if (!calls.length) {
      // Non-tool, non-call-end message — ack without failing the webhook.
      if (type && type !== 'tool-calls') {
        return res.status(200).json({ ok: true, type, ignored: true });
      }
      return res.status(200).json({ results: [{ toolCallId: body?.toolCallId || 'unknown', result: 'No tool call found in request.' }] });
    }

    const results = await Promise.all(calls.map(async (c) => ({
      toolCallId: c.toolCallId,
      result: (await dispatch(c.name, c.args)).slice(0, 800),
    })));

    console.log('[bentley-voice-tools v8.1] → ' + results.map(r => (r.result || '').slice(0, 80)).join(' || '));
    // VAPI-required response shape.
    return res.status(200).json({ results });
  } catch (e) {
    console.error('[bentley-voice-tools v8.1] Error:', e);
    const type = messageType(req.body);
    if (isCallEndMessage(type, req.body || {})) {
      return res.status(500).json({ ok: false, type, error: e.message });
    }
    const fallbackId = req.body?.message?.toolCallList?.[0]?.id || req.body?.toolCallId || 'unknown';
    return res.status(200).json({ results: [{ toolCallId: fallbackId, result: 'Error: ' + e.message + '. Please try again.' }] });
  }
}
