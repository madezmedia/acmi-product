/**
 * POST /api/bentley-voice-tools
 * VAPI → Composio MCP proxy for Bentley voice agent
 *
 * VAPI sends: { name, arguments, toolCallId }
 * Proxies to Composio MCP (322 tools: Gmail, Calendar, Tasks, Search, etc.)
 * Returns VAPI-compatible response: { toolCallId, result: { content: [...] } }
 */

export const config = { runtime: "nodejs", maxDuration: 30 };

const COMPOSIO_BASE = 'https://backend.composio.dev/v3/mcp/3de5213e-760c-401b-9821-cc8e64a99559/mcp?user_id=madezmediapartners%40gmail.com';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'ak_elk9P6oo1zQJ27848GK7';

// Map VAPI tool names → Composio tool names
const TOOL_MAP = {
  composioSendEmail: 'GMAIL_SEND_EMAIL',
  composioReadEmail: 'GMAIL_FETCH_EMAILS',
  composioListEmail: 'GMAIL_LIST_THREADS',
  composioCheckCalendar: 'GOOGLECALENDAR_EVENTS_LIST',
  composioCreateEvent: 'GOOGLECALENDAR_CREATE_EVENT',
  composioQuickAddEvent: 'GOOGLECALENDAR_QUICK_ADD',
  composioAddTask: 'NOTION_APPEND_TASK_BLOCKS',
  composioWebSearch: 'NOTION_SEARCH_NOTION_PAGE', // fallback
  composioMapsSearch: 'NOTION_SEARCH_NOTION_PAGE', // fallback
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, accept');
  res.setHeader('Accept', 'application/json, text/event-stream');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { name, arguments: args = {}, toolCallId } = req.body;

    console.log(`[bentley-voice-tools] ${name} call with args:`, JSON.stringify(args).substring(0, 200));

    const composioToolName = TOOL_MAP[name];
    if (!composioToolName) {
      res.status(200).json({
        toolCallId,
        result: {
          content: [{ type: 'text', text: `Unknown tool: ${name}. Available: ${Object.keys(TOOL_MAP).join(', ')}` }]
        }
      });
      return;
    }

    // Call Composio MCP
    const response = await fetch(COMPOSIO_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'x-api-key': COMPOSIO_API_KEY
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: composioToolName, arguments: args },
        id: 1
      })
    });

    const raw = await response.text();
    let resultText = '';

    // Parse SSE response from Composio
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.result?.content) {
            const inner = JSON.parse(data.result.content[0].text);
            resultText = formatResult(inner);
          } else if (data.result) {
            resultText = formatResult(data.result);
          }
        } catch {
          resultText = raw.substring(0, 500);
        }
      }
    }

    if (!resultText) {
      resultText = 'OK';
    }

    console.log(`[bentley-voice-tools] ${name} → ${resultText.substring(0, 100)}`);

    res.status(200).json({
      toolCallId,
      result: {
        content: [{ type: 'text', text: resultText }]
      }
    });
  } catch (error) {
    console.error('[bentley-voice-tools] Error:', error.message);
    res.status(200).json({
      toolCallId: req.body?.toolCallId,
      result: {
        content: [{ type: 'text', text: `Error: ${error.message}` }]
      }
    });
  }
}

function formatResult(data) {
  if (!data) return 'OK';
  if (typeof data === 'string') return data;

  // Email messages
  if (data.messages) {
    return data.messages.map(m =>
      `From: ${m.sender}\nSubject: ${m.subject}\nDate: ${m.messageTimestamp}\nPreview: ${m.snippet || m.preview?.body}`
    ).join('\n---\n');
  }

  // Thread list
  if (data.threads) {
    return data.threads.map(t =>
      `[${t.id}] ${t.snippet || ''}`
    ).join('\n');
  }

  // Success flag
  if (data.successful === true || data.successfull === true) {
    return data.display_url || data.message || 'Success!';
  }

  // Error
  if (data.error) {
    return `Error: ${data.error}${data.message ? ' - ' + data.message : ''}`;
  }

  return JSON.stringify(data).substring(0, 1000);
}
