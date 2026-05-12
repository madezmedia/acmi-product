/* live-bootstrap.js — wires the Control Pad OS to real ACMI APIs.

   Adapts live response shapes from /api/fleet, /api/comms, /api/work, /api/hitl
   into the mock shapes the views in data.jsx / app.jsx expect.

   Exposes:
     window.ACMI_LIVE_BOOTSTRAP()           → { live, fleet, events, work, hitl, attempts? }
                                              · retries up to 3 times with backoff before mock-fallback
     window.ACMI_LIVE_POLL_EVENTS(sinceMs)  → fresh events since sinceMs (silent fail)
     window.ACMI_LIVE_PROBE()               → quick health probe (uses /api/fleet HEAD-ish)

   Fallback: if bootstrap exhausts retries, returns { live: false, error, attempts }
   and the App keeps its mock data (calibrated demo state).
*/

(function () {
  const BASE = ""; // same origin

  // "self" markers (claude this assistant pin)
  const SELF_IDS = new Set(["claude", "claude-desktop"]);

  // Conversational-agent role pattern — used to filter the ~38-agent /api/fleet
  // response down to ~10-12 fleet members worth showing in the left rail.
  // Replaces the previous hardcoded PRIMARY_FLEET allowlist.
  const CONVERSATIONAL_ROLE_PATTERN = /(engineer|web|cowork|orchestrator|planner|delegate|cli|assistant|search|background|pm|chat|desktop|agent$)/i;

  // Identity-tier ids that should always appear regardless of role pattern
  const ALWAYS_SHOW = new Set([
    "claude", "claude-desktop", "claude-engineer", "claude-web", "claude-cowork",
    "bentley", "bentley-main", "bentley-temp",
    "gemini-cli", "antigravity", "perplexity"
  ]);

  // Cache last-successful bootstrap result for staleness display
  let _lastSuccess = { ts: 0 };

  // ──────────────────────────────────────────────────────────────────
  // Shape adapters
  // ──────────────────────────────────────────────────────────────────

  function isConversational(a) {
    if (!a || !a.id) return false;
    if (ALWAYS_SHOW.has(a.id)) return true;
    if (a.id.startsWith("gpu-")) return false;
    if (a.id.startsWith("test-")) return false;
    const haystack = `${a.role || ""} ${a.framework || ""} ${a.label || ""}`;
    return CONVERSATIONAL_ROLE_PATTERN.test(haystack);
  }

  function adaptFleet(agents) {
    // Activity-based sort: status=ok first, then warn, then stale.
    // Within each tier, ALWAYS_SHOW pinned first, then by id alpha.
    const filtered = agents.filter(isConversational);
    const order = { ok: 0, warn: 1, off: 2 };
    filtered.sort((a, b) => {
      const ao = order[a.status] ?? 9;
      const bo = order[b.status] ?? 9;
      if (ao !== bo) return ao - bo;
      const ap = ALWAYS_SHOW.has(a.id) ? 0 : 1;
      const bp = ALWAYS_SHOW.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.id.localeCompare(b.id);
    });
    // Cap at 12 — beyond that, left rail gets too crowded
    return filtered.slice(0, 12).map(a => ({
      id: a.id,
      label: a.label || a.id,
      role: a.role || "agent",
      status: a.status === "ok" ? "active" : a.status === "warn" ? "stale" : "idle",
      pulse: typeof a.signals === "number" ? a.signals : 0,
      self: SELF_IDS.has(a.id),
    }));
  }

  function adaptEvents(envelopes) {
    return envelopes.map(e => ({
      ts: e.ts,
      source: e.source,
      kind: e.kind,
      cid: e.correlationId,
      parentCid: e.parentCorrelationId,
      summary: e.summary || "",
      tags: Array.isArray(e.tags) ? e.tags : [],
      depth: e.parentCorrelationId ? 1 : 0,
      payload: e.payload,
    })).filter(e => e.ts && e.cid);
  }

  function adaptWork(items) {
    return items.map(w => ({
      id: w.id,
      title: w.title || w.id,
      status: (w.status || "DRAFT").toUpperCase(),
      priority: (w.priority || "P3").toUpperCase(),
      owner: w.owner && w.owner !== "—" ? w.owner : "-",
      phase: (w.signals && w.signals.phase) || "",
      desc: w.description || "",
      deadlineIso: (w.signals && w.signals.deadline_iso) || null,
      hoursLeft: (w.signals && w.signals.hours_remaining) || null,
      openOwners: (w.signals && w.signals.open_owners) || {},
      tracks: (w.signals && w.signals.tracks_claimed) || [],
      type: w.parent_id || "work",
    }));
  }

  function adaptHitl(pending) {
    return pending.map((h, i) => ({
      ts: h.ts || Date.now() - i * 60_000,
      kind: h.kind || "hitl-required",
      title: h.title || (h.summary ? h.summary.split(/[.\n]/)[0].slice(0, 80) : "HITL pending"),
      summary: h.summary || "",
      priority: h.priority || 2,
      cid: h.correlationId || `hitl-${h.ts || i}`,
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // HTTP helpers
  // ──────────────────────────────────────────────────────────────────

  async function fetchJson(path, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
    try {
      const r = await fetch(BASE + path, {
        headers: { "Accept": "application/json" },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function bootstrapOnce() {
    const [fleetR, commsR, workR, hitlR] = await Promise.all([
      fetchJson("/api/fleet"),
      fetchJson("/api/comms?thread=agent-coordination&limit=200"),
      fetchJson("/api/work"),
      fetchJson("/api/hitl?for=mikey&limit=50"),
    ]);
    return {
      live: true,
      fetched_ts: Date.now(),
      fleet: adaptFleet(fleetR.agents || []),
      events: adaptEvents(commsR.events || []),
      work: adaptWork(workR.items || []),
      hitl: adaptHitl(hitlR.pending || []),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────

  // Bootstrap with exponential backoff (3 attempts: 0ms / 250ms / 750ms / 2000ms)
  window.ACMI_LIVE_BOOTSTRAP = async function () {
    const delays = [0, 250, 750, 2000];
    let lastErr = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) {
        console.log(`[ACMI live-bootstrap] retry ${attempt}/${delays.length - 1} after ${delays[attempt]}ms`);
        await sleep(delays[attempt]);
      }
      try {
        const result = await bootstrapOnce();
        result.attempts = attempt + 1;
        _lastSuccess.ts = result.fetched_ts;
        if (attempt > 0) console.log(`[ACMI live-bootstrap] succeeded after ${attempt + 1} attempts`);
        return result;
      } catch (err) {
        lastErr = err;
        console.warn(`[ACMI live-bootstrap] attempt ${attempt + 1} failed:`, err.message);
      }
    }
    console.warn("[ACMI live-bootstrap] exhausted retries, falling back to mock:", lastErr);
    return { live: false, error: String(lastErr), attempts: delays.length };
  };

  window.ACMI_LIVE_POLL_EVENTS = async function (sinceMs) {
    try {
      const r = await fetchJson("/api/comms?thread=agent-coordination&limit=50", 5000);
      const all = adaptEvents(r.events || []);
      _lastSuccess.ts = Date.now();
      return sinceMs ? all.filter(e => e.ts > sinceMs) : all;
    } catch (err) {
      // Silent fail — caller treats empty array as no-new-events
      return [];
    }
  };

  // Staleness check — used by TopBar / error banner to detect silent poll failures
  window.ACMI_LIVE_LAST_SUCCESS_TS = function () {
    return _lastSuccess.ts;
  };

  console.log("[ACMI live-bootstrap] loaded · APIs: /api/fleet /api/comms /api/work /api/hitl · retry 3x · top-12 fleet by activity");
})();
