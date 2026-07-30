// POST /api/vapi-webhook — VAPI ↔ ACMI bridge.
//
// VAPI dashboard server URL for the Bentley CPS Conference assistant
// (baaecd88-dc2a-420d-b6d5-d8982f03f1af) should point here. VAPI POSTs
// the wrapped event payload as { message: { type, call, assistant, ... } }
// (or sometimes the legacy flat shape { type, call, ... } — we accept
// both for resilience).
//
// Every event lands as an ACMI Comms v1.1 entry on:
//   acmi:madez:vapi:cps-conference:timeline  (per-call activity stream)
//   acmi:madez:agent:bentley:timeline        (so the agent's primary timeline
//                                             surfaces voice activity alongside
//                                             its other work)
//
// Optional verification: if VAPI_WEBHOOK_SECRET is set, the handler
// requires `x-vapi-signature` to match. Unset → permissive (matches the
// legacy skill folder behavior). Recommend setting in production.
//
// Ported from ~/clawd/skills/vapi-conference-agent/webhook/route.ts on
// 2026-05-11 per Mikey directive "c and update team thank you" after the
// audit-finding cid vapi-acmi-postcall-logging-broken-investigation-1778507939057
// surfaced 8-day silence on acmi:vapi:cps-conference:timeline.

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const REDIS_URL = process.env.ACMI_BRIDGE_URL || "http://152.53.201.27:8081/";
const REDIS_TOKEN = process.env.ACMI_BRIDGE_TOKEN || "vm-local-bridge";

const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || null;

const TIMELINE_VAPI = "acmi:madez:vapi:cps-conference:timeline";
const TIMELINE_BENTLEY = "acmi:madez:agent:bentley:timeline";
const TIMELINE_COORD = "acmi:madez:thread:agent-coordination:timeline";
const ACMI_BUS = "acmi:madez:bus:events";
const BENTLEY_SIGNALS = "acmi:madez:agent:bentley:signals";
const BENTLEY_ROLLUP_LATEST = "acmi:madez:agent:bentley:rollup:latest";
const STAMP = {
  acmi_version: "1.5",
  comms_protocol: "v1.5",
  comms_alignment: "active",
  actor_type: "agent",
  tenant_id: "madez",
};

async function redisCmd(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("ACMI bridge creds missing from deploy env");
  }
  const res = await fetch(REDIS_URL.replace(/\/$/, "") + "/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  const body = await res.json();
  if (body.error) throw new Error(`ACMI bridge: ${body.error}`);
  return body.result;
}

// Comms v1.1 envelope — every emit lands as a real ACMI event so the
// drift-remediator + ops-center don't flag it as malformed.
function envelope({ ts, source, kind, correlationId, summary, payload, parentCorrelationId }) {
  return {
    ts,
    source,
    kind,
    correlationId,
    ...(parentCorrelationId ? { parentCorrelationId } : {}),
    summary,
    ...(payload ? { payload } : {}),
    ...STAMP,
    surface: "vapi",
    tags: ["vapi-bridge", "bentley-cps-conference", "post-call"],
  };
}

async function postEvent(ev, targets) {
  const j = JSON.stringify(ev);
  const out = [];
  for (const t of targets) {
    const r = await redisCmd("ZADD", t, String(ev.ts), j);
    out.push({ key: t, zadd: r });
  }
  return out;
}

function parseJson(raw, fallback = {}) {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function mergeBentleySignals(patch) {
  const type = await redisCmd("TYPE", BENTLEY_SIGNALS);
  let current = {};
  if (type === "string") current = parseJson(await redisCmd("GET", BENTLEY_SIGNALS), {});
  if (type === "hash") {
    const raw = await redisCmd("HGETALL", BENTLEY_SIGNALS);
    for (let i = 0; i < (raw || []).length; i += 2) current[raw[i]] = raw[i + 1];
    const ts = Date.now();
    await redisCmd("SET", `${BENTLEY_SIGNALS}:legacy-hash-backup:${ts}`, JSON.stringify(current));
    await redisCmd("DEL", BENTLEY_SIGNALS);
  }
  await redisCmd("SET", BENTLEY_SIGNALS, JSON.stringify({
    ...current,
    ...patch,
    ...STAMP,
    updated_at: new Date().toISOString(),
  }));
}

async function writeBentleyRollup(data) {
  const ts = Date.now();
  const payload = JSON.stringify({
    ...data,
    ...STAMP,
    agent_id: "bentley",
    source: "agent:bentley",
    surface: "vapi",
    updated_at: new Date(ts).toISOString(),
  });
  await Promise.all([
    redisCmd("SET", BENTLEY_ROLLUP_LATEST, payload),
    redisCmd("SET", `acmi:madez:agent:bentley:rollup:${ts}`, payload),
  ]);
}

function summarize(s, n = 240) {
  if (typeof s !== "string") return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ───── Handlers ─────

async function handleCallStarted(call, ts) {
  const sessionId = call?.id || call?.sessionId || `unknown-${ts}`;
  const phone = call?.customer?.number || call?.phone || "(unknown)";
  const assistantId = call?.assistantId || null;

  const ev = envelope({
    ts,
    source: "agent:bentley",
    kind: "spawn",
    correlationId: `vapi-call-${sessionId}`,
    summary: `[spawn @fleet] Bentley voice call started. sessionId=${sessionId} phone=${phone}`,
    payload: {
      sessionId,
      phone,
      assistantId,
      startedAt: new Date(ts).toISOString(),
      raw_call_fields: Object.keys(call || {}),
    },
  });

  await mergeBentleySignals({
    status: "on-call",
    current_surface: "vapi",
    current_call_session_id: sessionId,
    current_call_phone: phone,
    last_call_started_at: new Date(ts).toISOString(),
  });

  return postEvent(ev, [TIMELINE_VAPI, TIMELINE_BENTLEY, TIMELINE_COORD, ACMI_BUS]);
}

async function handleCallEnded(call, ts) {
  const sessionId = call?.id || call?.sessionId || `unknown-${ts}`;
  const phone = call?.customer?.number || call?.phone || "(unknown)";
  const duration = call?.duration || call?.durationSeconds || null;
  const endedReason = call?.endedReason || null;
  const summary = call?.analysis?.summary || call?.summary || null;
  const transcript = call?.transcript || null;
  const recordingUrl = call?.recordingUrl || null;
  const cost = call?.cost || null;
  const messages = Array.isArray(call?.messages) ? call.messages.length : null;

  const ev = envelope({
    ts,
    source: "agent:bentley",
    kind: "call-summary",
    correlationId: `vapi-call-${sessionId}`,
    parentCorrelationId: `vapi-call-${sessionId}`,
    summary: summarize(`[call-summary @mikey] Bentley voice call ended. ${duration ?? "?"}s · ${endedReason ?? "ok"} ${summary ? "· " + summary : ""}`, 480),
    payload: {
      sessionId,
      phone,
      duration_seconds: duration,
      ended_reason: endedReason,
      analysis_summary: summary,
      transcript_present: !!transcript,
      transcript_excerpt: typeof transcript === "string" ? transcript.slice(0, 2000) : null,
      recording_url: recordingUrl,
      cost,
      message_count: messages,
      endedAt: new Date(ts).toISOString(),
    },
  });

  await mergeBentleySignals({
    status: "available",
    current_surface: "vapi",
    current_call_session_id: "",
    last_call_session_id: sessionId,
    last_call_phone: phone,
    last_call_ended_at: new Date(ts).toISOString(),
  });
  await writeBentleyRollup({
    session_summary: summary || `Bentley voice call ended. duration=${duration ?? "unknown"}s reason=${endedReason ?? "ok"}`,
    decisions_made: [],
    open_blockers: [],
    next_session_priorities: [],
    key_correlation_ids: [`vapi-call-${sessionId}`],
  });

  return postEvent(ev, [TIMELINE_VAPI, TIMELINE_BENTLEY, TIMELINE_COORD, ACMI_BUS]);
}

async function handleMessage(payload, ts) {
  const call = payload?.call || {};
  const sessionId = call?.id || call?.sessionId || payload?.sessionId || `unknown-${ts}`;
  const msg = payload?.message || payload || {};
  const role = msg.role || msg.from || "?";
  const content = msg.content || msg.text || msg.transcript || "";

  if (!content) return [];

  const ev = envelope({
    ts,
    source: "agent:bentley",
    kind: "vapi-message",
    correlationId: `vapi-msg-${sessionId}-${ts}`,
    parentCorrelationId: `vapi-call-${sessionId}`,
    summary: summarize(`[vapi-message ${role}] ${content}`, 240),
    payload: {
      sessionId,
      role,
      content_excerpt: summarize(content, 1500),
    },
  });

  return postEvent(ev, [TIMELINE_VAPI, ACMI_BUS]); // messages don't broadcast to bentley to avoid noise
}

async function handleStatusUpdate(call, ts) {
  const sessionId = call?.id || call?.sessionId || `unknown-${ts}`;
  const status = call?.status || "?";
  const ev = envelope({
    ts,
    source: "agent:bentley",
    kind: "vapi-status-update",
    correlationId: `vapi-status-${sessionId}-${ts}`,
    parentCorrelationId: `vapi-call-${sessionId}`,
    summary: summarize(`[vapi-status ${sessionId}] ${status}`),
    payload: { sessionId, status, ts_iso: new Date(ts).toISOString() },
  });
  return postEvent(ev, [TIMELINE_VAPI, ACMI_BUS]);
}

// ───── Main ─────

export default async function handler(req, res) {
  // CORS only matters if a browser invokes; VAPI is server-to-server.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Vapi-Signature");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method === "GET") {
    // health probe — returns bridge metadata so VAPI dashboard "test" lights green
    return res.status(200).json({
      ok: true,
      service: "vapi-acmi-bridge",
      target_timelines: [TIMELINE_VAPI, TIMELINE_BENTLEY, TIMELINE_COORD, ACMI_BUS],
      acmi_bridge: REDIS_URL.replace(/\/$/, "") + "/",
      signature_required: !!VAPI_WEBHOOK_SECRET,
      ts: Date.now(),
    });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // Optional signature check
  if (VAPI_WEBHOOK_SECRET) {
    const sig = String(req.headers["x-vapi-signature"] || "");
    if (sig !== VAPI_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "invalid_signature" });
    }
  }

  try {
    const body = req.body || {};
    // VAPI ships events as { message: { type, call, ... } } most of the time;
    // older flows ship the flat shape directly. Accept both.
    const evt = body.message || body;
    const type = evt.type || evt.event || "unknown";
    const call = evt.call || body.call || {};
    const ts = Date.now();

    let result;
    switch (type) {
      case "call.started":
      case "start-of-call":
      case "call-started":
        result = await handleCallStarted(call, ts);
        break;

      case "call.ended":
      case "end-of-call-report":
      case "call-ended":
        result = await handleCallEnded(call, ts);
        break;

      case "transcript":
      case "message":
      case "conversation-update":
        result = await handleMessage(evt, ts);
        break;

      case "status-update":
      case "call.status":
        result = await handleStatusUpdate(call, ts);
        break;

      default:
        // Log unhandled types so we discover surface area in production
        // without dropping events on the floor.
        result = await postEvent(
          envelope({
            ts,
            source: "agent:bentley",
            kind: "vapi-unhandled",
            correlationId: `vapi-unhandled-${ts}`,
            summary: summarize(`[vapi-unhandled] type=${type} keys=${Object.keys(evt).join(",")}`),
            payload: { type, body_keys: Object.keys(body), evt_keys: Object.keys(evt) },
          }),
          [TIMELINE_VAPI, ACMI_BUS]
        );
    }

    return res.status(200).json({ ok: true, type, posted: result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
