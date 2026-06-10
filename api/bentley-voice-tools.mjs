/**
 * Bentley Voice — VAPI Tool Handler (FIXED)
 * Deployed at: https://acmi-product.vercel.app/api/bentley-voice-tools
 *
 * FIXES:
 * 1. Response format: now returns {toolCallId, result: {content: [{type:'text', text:...}]}}
 *    (VAPI requires content array, not flat string)
 * 2. Added argument transforms (maps VAPI arg names → Composio expected fields)
 * 3. Robust SSE/JSON response parsing with formatResult()
 * 4. Better error handling & fallback with raw response preview
 */

const COMPOSIO_KEY = 'ak_xHrrW-9SrFPEC1LPv6eJ';
const COMPOSIO_BASE = 'https://backend.composio.dev/tool_router/trs_LuHTrrdOQdEp/mcp';

// Map VAPI tool names → Composio slugs + argument transforms
const TOOL_MAP = {
  composioSendEmail: {
    slug: 'GMAIL_SEND_EMAIL',
    transform: (a) => ({
      recipient_email: a.recipient_email || a.to || a.email || '',
      subject: a.subject || '',
      body: a.body || '',
      is_html: a.is_html || false,
    }),
  },
  composioReadEmail: {
    slug: 'GMAIL_FETCH_EMAILS',
    transform: (a) => ({
      max_results: a.max_results || a.maxResults || 5,
      query: a.query || '',
      include_spam_trash: false,
    }),
  },
  composioListEmail: {
    slug: 'GMAIL_FETCH_EMAILS',
    transform: (a) => ({
      max_results: a.max_results || a.maxResults || 5,
      query: a.query || '',
      include_spam_trash: false,
    }),
  },
  composioCheckCalendar: {
    slug: 'GOOGLECALENDAR_EVENTS_LIST',
    transform: (a) => ({
      time_min: a.time_min || a.timeMin || '',
      time_max: a.time_max || a.timeMax || '',
      max_results: a.max_results || a.maxResults || 10,
      single_events: true,
      order_by: 'startTime',
    }),
  },
  composioWebSearch: {
    slug: 'COMPOSIO_SEARCH_WEB',
    transform: (a) => ({
      query: a.query || '',
      limit: a.num_results || a.numResults || a.limit || 5,
    }),
  },
  composioAddTask: {
    slug: 'GOOGLETASKS_INSERT_TASK',
    transform: (a) => ({
      tasklist_id: a.tasklist_id || a.tasklistId || 'MTMwNTE3Mzk3OTE0NTA5MTI1NTI6MDow',
      title: a.title || '',
      notes: a.notes || '',
      due: a.due || null,
    }),
  },
  composioMapsSearch: {
    slug: 'GOOGLE_MAPS_SEARCH',
    transform: (a) => ({
      query: a.query || '',
      location: a.location || '',
    }),
  },
};

// Upstash for ACMI ops
const UPSTASH_URL = 'https://loved-platypus-102968.upstash.io';
const UPSTASH_TOKEN = 'gQAAAAAAAZI4AAIgcDJhNDFlNmUwMjQ5ZWI0ZDNmYWUzNDU2NDc4ZWUxMmQwOA';

async function redis(cmd) {
  const r = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
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
  const timeline = (raw || []).map(e => {
    try { const d = JSON.parse(e); return `${d.kind}: ${d.summary?.slice(0, 100)}`; } catch { return e.slice(0, 100); }
  }).join('\n');
  return `Profile: ${(profile || 'none').slice(0, 200)}\nSignals: ${(signals || 'none').slice(0, 200)}\nRecent: ${timeline || 'none'}`;
}

/**
 * Format various Composio response shapes into clean text for VAPI voice
 */
function formatResult(data) {
  if (!data) return 'Action completed.';
  if (typeof data === 'string') return data.substring(0, 1000);

  // Email messages (read)
  if (data.messages) {
    return data.messages.slice(0, 5).map(m =>
      `From: ${m.from || m.sender || m.from || '?'}. Subject: ${m.subject || 'no subject'}.`
    ).join('. ');
  }
  // Calendar events
  if (data.items && Array.isArray(data.items)) {
    return data.items.slice(0, 8).map(e =>
      `${e.summary || 'Event'}: ${e.start?.dateTime || e.start?.date || '?'}`
    ).join('. ');
  }
  // Web search answer
  if (data.answer) {
    return data.answer.substring(0, 500);
  }
  // Google Maps places
  if (data.places) {
    return data.places.slice(0, 5).map(p =>
      `${p.name} — ${p.address || p.vicinity || ''}`
    ).join('. ');
  }
  // Task created – has id
  if (data.id) return 'Task created.';
  // Success flags — drill into nested results for display_url
  if (data.successful === true || data.success === true) {
    const nestedUrl = data?.data?.results?.[0]?.response?.data?.display_url;
    if (nestedUrl) return `Email sent. ${nestedUrl}`;
    return data.display_url || 'Email sent successfully.';
  }
  // Error
  if (data.error) return `Error: ${data.error}${data.message ? ' - ' + data.message : ''}`;
  // Fallback to JSON
  const str = JSON.stringify(data);
  return str.length > 500 ? str.substring(0, 500) + '...' : str;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({
    ok: true,
    session: 'trs_LuHTrrdOQdEp',
    service: 'bentley-voice-tools-fixed',
    tools: Object.keys(TOOL_MAP),
  });

  try {
    const body = req.body || {};
    const toolCall = body.message?.toolCalls?.[0] || body.toolCalls?.[0] || body;
    const toolCallId = toolCall.id || toolCall.toolCallId || body.toolCallId || 'unknown';
    const fn = toolCall.function || {};
    const toolName = fn.name || body.name || body.tool || '';
    let args = {};
    try {
      // VAPI sends args in function.arguments (stringified JSON)
      if (fn.arguments) {
        try { args = JSON.parse(fn.arguments); } catch { args = fn.arguments; }
      } else {
        // Direct POST format: body.arguments or body.args
        args = body.arguments || body.args || {};
      }
    } catch { args = body.arguments || body.args || {}; }

    if (!toolName) {
      return res.status(200).json({
        toolCallId,
        result: { content: [{ type: 'text', text: 'No tool specified' }] },
      });
    }

    // === ACMI Tools (direct Upstash, no Composio) ===
    if (toolName === 'acmiWriteEvent') {
      const result = await acmiEvent(
        args.namespace || 'thread', args.id || 'vapi',
        'agent:bentley', args.summary || 'VAPI event', args.kind || 'coord-note'
      );
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: result }] } });
    }
    if (toolName === 'acmiReadContext') {
      const result = await acmiGet(args.namespace || 'agent', args.id || 'bentley');
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: result }] } });
    }
    if (toolName === 'acmiLogCall') {
      const summary = `VAPI call from ${args.caller || 'unknown'}: ${args.summary || 'no summary'}`;
      const result = await acmiEvent('thread', 'vapi-calls', 'agent:bentley', summary, 'vapi-call');
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: result }] } });
    }
    if (toolName === 'acmiStatus') {
      const count = await redis(['ZCARD', 'acmi:thread:agent-coordination:timeline']);
      const bus = await redis(['ZCARD', 'acmi:bus:relay:events']);
      const result = `Fleet: ${count} timeline events, ${bus} bus events. ACMI v1.5 live.`;
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: result }] } });
    }

    // === Composio Tools ===
    const toolDef = TOOL_MAP[toolName];
    if (!toolDef) {
      return res.status(200).json({
        toolCallId,
        result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}. Available: ${Object.keys(TOOL_MAP).join(', ')}` }] },
      });
    }

    // Apply argument transform
    const composioArgs = toolDef.transform(args);

    // Session-based MCP requires COMPOSIO_MULTI_EXECUTE_TOOL wrapper
    const resp = await fetch(COMPOSIO_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'x-api-key': COMPOSIO_KEY,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 1,
        params: {
          name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
          arguments: {
            tools: [{ tool_slug: toolDef.slug, arguments: composioArgs }],
          },
        },
      }),
    });

    const raw = await resp.text();
    let resultText = '';

    // Parse SSE response from Composio tool_router
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const sse = JSON.parse(line.slice(6));
          // Result content (OpenAI-style SSE format)
          const inner = sse?.result?.content?.[0]?.text;
          if (inner) {
            try {
              const parsed = JSON.parse(inner);
              resultText = formatResult(parsed);
            } catch {
              resultText = inner.substring(0, 1000);
            }
            if (resultText) break;
          }
          // Direct result
          if (sse?.result && !resultText) {
            resultText = formatResult(sse.result);
            if (resultText) break;
          }
          // Error
          if (sse?.error) {
            resultText = `Error: ${sse.error.message || JSON.stringify(sse.error)}`;
            break;
          }
        } catch { /* skip unparseable SSE lines */ }
      }
    }

    // Fallback if SSE parsing yielded nothing useful
    if (!resultText || resultText === 'null' || resultText === 'undefined') {
      // Try parsing entire response as JSON
      try {
        const json = JSON.parse(raw);
        if (json.result?.content?.[0]?.text) {
          try {
            const inner = JSON.parse(json.result.content[0].text);
            resultText = formatResult(inner);
          } catch {
            resultText = json.result.content[0].text.substring(0, 1000);
          }
        } else if (json.result) {
          resultText = formatResult(json.result);
        }
      } catch {
        // Raw text fallback
        resultText = raw.substring(0, 500);
      }
    }

    if (!resultText || resultText === 'null' || resultText === 'undefined') {
      resultText = 'Action completed.';
    }

    // VAPI expects: { toolCallId, result: { content: [{ type: 'text', text: ... }] } }
    return res.status(200).json({
      toolCallId,
      result: { content: [{ type: 'text', text: resultText }] },
    });
  } catch (error) {
    return res.status(200).json({
      toolCallId: 'error',
      result: { content: [{ type: 'text', text: `Error: ${error.message}. Please try again.` }] },
    });
  }
}
