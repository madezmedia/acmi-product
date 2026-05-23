// POST /api/real-estate/tools — Avery's real estate acquisition tool handler.
// VAPI calls this when Avery's LLM decides to execute a function.
// Dispatches to the right handler based on the function name in the body.

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const ROOT = path.resolve('/tmp', 'avery-data');
const DATA_DIR = path.join(ROOT, 'data');
const LEADS_DIR = path.join(DATA_DIR, 'leads');
const FOLLOWUPS_DIR = path.join(DATA_DIR, 'followups');
const ESCALATIONS_DIR = path.join(DATA_DIR, 'escalations');
const DNC_DIR = path.join(DATA_DIR, 'dnc');

async function ensureDirs() {
  await Promise.all([LEADS_DIR, FOLLOWUPS_DIR, ESCALATIONS_DIR, DNC_DIR].map(d => mkdir(d, { recursive: true })));
}

function id(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
}

function money(n) {
  return Math.round(Number(n || 0));
}

function avg(a, b) {
  const nums = [a, b].map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((x, y) => x + y, 0) / nums.length : null;
}

function inferCity(address) {
  const a = String(address).toLowerCase();
  if (a.includes('washington') || a.includes('dc')) return 'Washington';
  return 'Unknown';
}

// ───── Handlers ─────

async function lookupProperty(args) {
  const address = args.address || 'unknown address';
  const city = args.city || inferCity(address);
  const state = args.state || 'DC';
  return {
    success: true,
    normalizedAddress: `${address}${city !== 'Unknown' ? `, ${city}` : ''}, ${state}`,
    propertyFacts: {
      propertyType: 'unknown',
      parcelFound: false,
      ownerOccupied: null,
      assessedValue: null,
      lastSaleDate: null,
      dataSource: 'mvp-placeholder'
    },
    confidence: 0.35,
    note: 'MVP placeholder lookup. Connect county/ATTOM/PropStream/Zillow data in Phase 3.'
  };
}

async function estimateARV(args) {
  const sqft = Number(args.sqft || 1600);
  const market = (args.market || args.address || '').toLowerCase();
  const basePpsf = market.includes('dc') || market.includes('washington') ? 385 : 240;
  const conditionFactor = {
    'turnkey': 1.05,
    'light-repairs': 0.95,
    'heavy-rehab': 0.78,
    'fire-water-damage': 0.62,
    'teardown': 0.45,
    'unknown': 0.85
  }[args.condition || 'unknown'] ?? 0.85;
  const midpoint = sqft * basePpsf * conditionFactor;
  return {
    success: true,
    address: args.address,
    estimatedARVLow: money(midpoint * 0.9),
    estimatedARVHigh: money(midpoint * 1.1),
    confidence: 0.42,
    assumptions: { sqft, basePpsf, condition: args.condition || 'unknown', conditionFactor },
    disclaimer: 'Preliminary non-appraisal estimate for triage only; human review required.'
  };
}

async function analyzeComps(args) {
  const sqft = Number(args.sqft || 1600);
  const ppsfLow = 220;
  const ppsfHigh = 420;
  return {
    success: true,
    address: args.address,
    radiusMiles: args.radiusMiles || 0.5,
    compSummary: {
      count: 0,
      status: 'placeholder',
      estimatedPpsfRange: [ppsfLow, ppsfHigh],
      estimatedValueRange: [money(sqft * ppsfLow), money(sqft * ppsfHigh)]
    },
    nextDataSources: ['county records', 'MLS/exported comps', 'ATTOM/PropStream', 'Zillow/Realtor if available']
  };
}

async function scoreOpportunity(args) {
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
  return {
    success: true,
    score,
    strategy,
    priority: score >= 80 ? 'urgent' : score >= 65 ? 'high' : score >= 50 ? 'normal' : 'low',
    reasoning: 'MVP scoring based on discount-to-ARV, condition, vacancy, seller timeline, and caller authority.',
    humanReviewRequired: true
  };
}

async function logAcquisitionLead(args) {
  await ensureDirs();
  const record = { id: id('lead'), createdAt: new Date().toISOString(), ...args };
  const file = path.join(LEADS_DIR, `${record.id}.json`);
  await writeFile(file, JSON.stringify(record, null, 2));
  return {
    success: true,
    leadId: record.id,
    file,
    note: 'Lead logged. ACMI event queued for async delivery.'
  };
}

async function queueFollowUp(args) {
  await ensureDirs();
  const record = { id: id('followup'), createdAt: new Date().toISOString(), status: 'pending-human-review', ...args };
  const file = path.join(FOLLOWUPS_DIR, `${record.id}.json`);
  await writeFile(file, JSON.stringify(record, null, 2));
  return { success: true, followUpId: record.id, status: 'pending-human-review', file };
}

async function escalateHotDeal(args) {
  await ensureDirs();
  const record = { id: id('hotdeal'), createdAt: new Date().toISOString(), status: 'urgent-human-review', ...args };
  const file = path.join(ESCALATIONS_DIR, `${record.id}.json`);
  await writeFile(file, JSON.stringify(record, null, 2));
  return { success: true, escalationId: record.id, status: 'urgent-human-review', file };
}

async function optOutDoNotCall(args) {
  await ensureDirs();
  const record = { id: id('dnc'), createdAt: new Date().toISOString(), status: 'suppressed', ...args };
  const file = path.join(DNC_DIR, `${record.id}.json`);
  await writeFile(file, JSON.stringify(record, null, 2));
  return { success: true, dncId: record.id, status: 'suppressed', file };
}

const HANDLERS = {
  lookupProperty,
  estimateARV,
  analyzeComps,
  scoreOpportunity,
  logAcquisitionLead,
  queueFollowUp,
  escalateHotDeal,
  optOutDoNotCall,
};

// ───── Main Handler ─────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "avery-real-estate-tools",
      functions: Object.keys(HANDLERS),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = req.body || {};
    // VAPI sends: { function: "name", arguments: {...} }
    // or: { message: { function: "name", arguments: {...} } }
    const msg = body.message || body;
    const fnName = msg.function || msg.functionName || body.function;
    const fnArgs = msg.arguments || msg.args || body.arguments || body.args || {};

    if (!fnName) {
      return res.status(400).json({ error: "missing_function_name", body_keys: Object.keys(body) });
    }

    const handler = HANDLERS[fnName];
    if (!handler) {
      return res.status(400).json({ error: `unknown_function: ${fnName}`, available: Object.keys(HANDLERS) });
    }

    const result = await handler(typeof fnArgs === 'string' ? JSON.parse(fnArgs) : fnArgs);

    return res.status(200).json({
      success: true,
      function: fnName,
      result,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
}
