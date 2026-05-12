/* live-bootstrap.jsx — wires the Control Pad OS to real ACMI APIs.

   Adapts live response shapes from /api/fleet, /api/comms, /api/work, /api/hitl
   into the mock shapes the views in data.jsx / app.jsx expect.

   Exposes:
     window.ACMI_LIVE_BOOTSTRAP()         → returns { live, fleet, events, work, hitl }
     window.ACMI_LIVE_POLL_EVENTS(sinceMs)→ returns fresh events since sinceMs

   Fallback: if any fetch fails, returns { live: false, error } and the App
   keeps its mock data (calibrated demo state). Zero visual disruption on
   transient network errors.
*/

(function () {
  const BASE = ""; // same origin

  // Allowlist of primary fleet members shown in the left rail.
  // (The /api/fleet endpoint returns ~38 agents; left rail shows the 10 conversational ones.)
  const PRIMARY_FLEET = new Set([
    "claude-engineer", "claude-web", "claude-cowork",
    "bentley-temp", "bentley-main", "bentley",
    "gemini-cli", "antigravity", "perplexity",
    "claude", "claude-desktop"
  ]);

  // "self" markers (claude this assistant pin)
  const SELF_IDS = new Set(["claude", "claude-desktop"]);

  // ──────────────────────────────────────────────────────────────────
  // Shape adapters — live API response → mock-compatible shape
  // ──────────────────────────────────────────────────────────────────

  function adaptFleet(agents) {
    const filtered = agents.filter(a => PRIMARY_FLEET.has(a.id));
    return filtered.map(a => ({
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
  // Public API
  // ──────────────────────────────────────────────────────────────────

  async function fetchJson(path) {
    const r = await fetch(BASE + path, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    return r.json();
  }

  window.ACMI_LIVE_BOOTSTRAP = async function () {
    try {
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
    } catch (err) {
      console.warn("[ACMI live bootstrap] failed, falling back to mock:", err);
      return { live: false, error: String(err) };
    }
  };

  window.ACMI_LIVE_POLL_EVENTS = async function (sinceMs) {
    try {
      const r = await fetchJson("/api/comms?thread=agent-coordination&limit=50");
      const all = adaptEvents(r.events || []);
      return sinceMs ? all.filter(e => e.ts > sinceMs) : all;
    } catch (err) {
      return [];
    }
  };

  console.log("[ACMI live-bootstrap] loaded · APIs: /api/fleet /api/comms /api/work /api/hitl");
})();
