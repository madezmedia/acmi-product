/**
 * POST /api/avery-voice-tools
 * VAPI → Composio MCP proxy for Avery real estate voice agent
 *
 * Combines Avery's real estate tools with Bentley's email/calendar tools.
 * VAPI sends: { name, arguments, toolCallId }
 */

export const config = { runtime: "nodejs", maxDuration: 30 };

const COMPOSIO_BASE = 'https://backend.composio.dev/v3/mcp/3de5213e-760c-401b-9821-cc8e64a99559/mcp?user_id=madezmediapartners%40gmail.com';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'ak_elk9P6oo1zQJ27848GK7';

// Map VAPI tool names → Composio tool names
const COMPOSIO_TOOL_MAP = {
  averySendEmail:     'GMAIL_SEND_EMAIL',
  averyReadEmail:     'GMAIL_FETCH_EMAILS',
  averyListEmail:     'GMAIL_LIST_THREADS',
  averyCheckCalendar: 'GOOGLECALENDAR_EVENTS_LIST',
  averyCreateEvent:   'GOOGLECALENDAR_CREATE_EVENT',
  averyQuickAddEvent: 'GOOGLECALENDAR_QUICK_ADD',
};

// ─── Avery Real Estate Handlers ───────────────────────────────────────────────

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve('/tmp', 'avery-data');
const DATA_DIR = path.join(ROOT, 'data');
const LEADS_DIR  = path.join(DATA_DIR, 'leads');
const FOLLOWUPS_DIR = path.join(DATA_DIR, 'followups');
const ESCALATIONS_DIR = path.join(DATA_DIR, 'escalations');
const DNC_DIR = path.join(DATA_DIR, 'dnc');

async function ensureDirs() {
  await Promise.all([LEADS_DIR, FOLLOWUPS_DIR, ESCALATIONS_DIR, DNC_DIR].map(d => mkdir(d, { recursive: true })));
}

function id(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
}

function money(n) { return Math.round(Number(n || 0)); }
function avg(a, b) {
  const nums = [a, b].map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((x, y) => x + y, 0) / nums.length : null;
}
function inferCity(address) {
  const a = String(address).toLowerCase();
  if (a.includes('washington') || a.includes('dc')) return 'Washington';
  return 'Unknown';
}

const AVERY_HANDLERS = {
  lookupProperty: async (args) => {
    const address = args.address || 'unknown address';
    const city = args.city || inferCity(address);
    const state = args.state || 'DC';
    return {
      success: true,
      normalizedAddress: `${address}${city !== 'Unknown' ? `, ${city}` : ''}, ${state}`,
      propertyFacts: {
        propertyType: 'unknown', parcelFound: false,
        ownerOccupied: null, assessedValue: null, lastSaleDate: null,
        dataSource: 'mvp-placeholder'
      },
      confidence: 0.35,
      note: 'MVP placeholder — connect county/ATTOM/PropStream/Zillow data in Phase 3.'
    };
  },

  estimateARV: async (args) => {
    const sqft = Number(args.sqft || 1600);
    const market = (args.market || args.address || '').toLowerCase();
    const basePpsf = market.includes('dc') || market.includes('washington') ? 385 : 240;
    const conditionFactor = {
      'turnkey': 1.05, 'light-repairs': 0.95, 'heavy-rehab': 0.78,
      'fire-water-damage': 0.62, 'teardown': 0.45, 'unknown': 0.85
    }[args.condition || 'unknown'] ?? 0.85;
    const midpoint = sqft * basePpsf * conditionFactor;
    return {
      success: true, address: args.address,
      estimatedARVLow: money(midpoint * 0.9), estimatedARVHigh: money(midpoint * 1.1),
      confidence: 0.42,
      assumptions: { sqft, basePpsf, condition: args.condition || 'unknown', conditionFactor },
      disclaimer: 'Preliminary non-appraisal estimate for triage only; human review required.'
    };
  },

  analyzeComps: async (args) => {
    const sqft = Number(args.sqft || 1600);
    return {
      success: true, address: args.address,
      radiusMiles: args.radiusMiles || 0.5,
      compSummary: {
        count: 0, status: 'placeholder',
        estimatedPpsfRange: [220, 420],
        estimatedValueRange: [money(sqft * 220), money(sqft * 420)]
      },
      nextDataSources: ['county records', 'MLS/exported comps', 'ATTOM/PropStream', 'Zillow/Realtor']
    };
  },

  scoreOpportunity: async (args) => {
    let score = 35;
    const arvMid = avg(args.estimatedARVLow, args.estimatedARVHigh);
    if (args.askingPrice && arvMid) {
      const discount = 1 - Number(args.askingPrice) / arvMid;
      if (discount >= 0.35) score += 30;
      else if (discount >= 0.2) score += 20;
      else if (discount >= 0.1) score += 10;
      else if (discount < 0) score -= 15;
    }
    if (['heavy-rehab', 'fire-water-damage', 'teardown'].includes(args.condition)) score += 10;
    if (args.condition === 'turnkey') score -= 5;
    if (args.occupancy === 'vacant') score += 10;
    if (args.timeline === 'asap') score += 15;
    if (args.timeline === '30-days') score += 10;
    if ((args.callerRole || '').toLowerCase().includes('owner')) score += 8;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const strategy = score >= 80 ? 'hot-review' : score >= 65 ? 'wholesale-or-flip' : score >= 50 ? 'creative-finance-or-follow-up' : 'nurture-or-pass';
    return { success: true, score, strategy, priority: score >= 80 ? 'urgent' : score >= 65 ? 'high' : score >= 50 ? 'normal' : 'low', reasoning: 'MVP scoring based on discount-to-ARV, condition, vacancy, seller timeline, and caller authority.', humanReviewRequired: true };
  },

  logAcquisitionLead: async (args) => {
    await ensureDirs();
    const record = { id: id('lead'), createdAt: new Date().toISOString(), ...args };
    const file = path.join(LEADS_DIR, `${record.id}.json`);
    await writeFile(file, JSON.stringify(record, null, 2));
    return { success: true, leadId: record.id, file, note: 'Lead logged to /tmp/avery-data/data/leads/' };
  },

  queueFollowUp: async (args) => {
    await ensureDirs();
    const record = { id: id('followup'), createdAt: new Date().toISOString(), status: 'pending-human-review', ...args };
    const file = path.join(FOLLOWUPS_DIR, `${record.id}.json`);
    await writeFile(file, JSON.stringify(record, null, 2));
    return { success: true, followUpId: record.id, status: 'pending-human-review', file };
  },

  escalateHotDeal: async (args) => {
    await ensureDirs();
    const record = { id: id('hotdeal'), createdAt: new Date().toISOString(), status: 'urgent-human-review', ...args };
    const file = path.join(ESCALATIONS_DIR, `${record.id}.json`);
    await writeFile(file, JSON.stringify(record, null, 2));
    return { success: true, escalationId: record.id, status: 'urgent-human-review', file };
  },

  optOutDoNotCall: async (args) => {
    await ensureDirs();
    const record = { id: id('dnc'), createdAt: new Date().toISOString(), status: 'suppressed', ...args };
    const file = path.join(DNC_DIR, `${record.id}.json`);
    await writeFile(file, JSON.stringify(record, null, 2));
    return { success: true, dncId: record.id, status: 'suppressed', file };
  },
};

// ─── Main Handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, accept');
  res.setHeader('Accept', 'application/json, text/event-stream');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { name, arguments: args = {}, toolCallId } = req.body;

    console.log(`[avery-voice-tools] ${name} call with args:`, JSON.stringify(args).substring(0, 200));

    // Check if this is an Avery real estate tool (local)
    if (AVERY_HANDLERS[name]) {
      const result = await AVERY_HANDLERS[name](args);
      return res.status(200).json({ toolCallId, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
    }

    // Check if this is a Composio-backed tool
    const composioToolName = COMPOSIO_TOOL_MAP[name];
    if (!composioToolName) {
      return res.status(200).json({
        toolCallId,
        result: {
          content: [{ type: 'text', text: `Unknown tool: ${name}. Avery tools: ${Object.keys(AVERY_HANDLERS).join(', ')} | Composio tools: ${Object.keys(COMPOSIO_TOOL_MAP).join(', ')}` }]
        }
      });
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

    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.result?.content) {
            const inner = JSON.parse(data.result.content[0].text);
            resultText = JSON.stringify(inner);
            break;
          }
          if (data.error) {
            resultText = JSON.stringify({ error: data.error.message || data.error });
          }
        } catch { /* skip unparseable */ }
      }
    }

    if (!resultText) resultText = JSON.stringify({ error: 'No response from Composio' });

    return res.status(200).json({
      toolCallId,
      result: { content: [{ type: 'text', text: resultText }] }
    });

  } catch (e) {
    console.error('[avery-voice-tools] Error:', e);
    return res.status(200).json({
      toolCallId: req.body?.toolCallId,
      result: { content: [{ type: 'text', text: JSON.stringify({ error: e.message || String(e) }) }] }
    });
  }
}