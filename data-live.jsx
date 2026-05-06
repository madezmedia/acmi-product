// data-live.jsx — bootstraps real ACMI data over the mocks from data.jsx.
// Loads after data.jsx, before app.jsx. On boot, fetches every endpoint in
// parallel; on success, replaces window.ACMI fields in place and dispatches
// `acmi:live-loaded`. App.jsx listens and force-re-renders.
//
// Failure mode: if any endpoint errors, we keep the existing mock value.
// The mock is the fallback, not a separate code path.

(function () {
  const PARALLEL = [
    { fn: bootstrapFleet,   field: "FLEET" },
    { fn: bootstrapStories, field: "KANBAN" },
    { fn: bootstrapComms,   field: "COMMS" },
    { fn: bootstrapHitl,    field: "HITL" },
    { fn: bootstrapEvents,  field: "SEED_EVENTS" },
  ];

  async function bootstrapFleet() {
    const r = await fetch("/api/fleet").then(r => r.json());
    if (!r?.ok || !r.fleet) throw new Error(r?.error || "no fleet");
    return { fleet: r.fleet, agents: r.agents || [] };
  }
  async function bootstrapStories() {
    const r = await fetch("/api/stories").then(r => r.json());
    if (!r?.ok) throw new Error(r?.error || "no stories");
    return r.columns || {};
  }
  async function bootstrapComms() {
    const r = await fetch("/api/comms?thread=agent-coordination&limit=12").then(r => r.json());
    if (!r?.ok) throw new Error(r?.error || "no comms");
    return (r.events || []).map(toCommsShape).filter(Boolean);
  }
  async function bootstrapHitl() {
    const r = await fetch("/api/hitl?for=mikey&limit=10").then(r => r.json());
    if (!r?.ok) throw new Error(r?.error || "no hitl");
    return r;
  }
  async function bootstrapEvents() {
    const r = await fetch("/api/events?limit=20").then(r => r.json());
    if (!r?.ok) throw new Error(r?.error || "no events");
    return r.events || [];
  }

  // Map a raw ACMI event into the COMMS shape the dashboard expects.
  function toCommsShape(ev, idx) {
    const isHuman = (ev.source || "").toLowerCase().includes("mikey") || (ev.source || "").toLowerCase().includes("human");
    const isSystem = /^(drift-diff|drift-remediator|cron-wake|inbox-janitor)$/i.test(ev.source || "");
    const fw = isHuman ? "human" : isSystem ? "sys" : (ev.framework || "lg");
    const ts = new Date(ev.ts || Date.now());
    const time = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`;
    return {
      id: ev.correlationId || `c${idx}`,
      who: ev.source || "agent",
      fw,
      role: ev.kind || "event",
      text: ev.summary || JSON.stringify(ev.payload || {}).slice(0, 200),
      time,
      payload: ev.payload && typeof ev.payload === "object" ? JSON.stringify(ev.payload).slice(0, 200) : null,
    };
  }

  async function bootstrap() {
    if (!window.ACMI) return;
    window.ACMI._loading = true;
    const results = await Promise.allSettled(PARALLEL.map(p => p.fn()));

    let updated = 0;
    let errors = [];

    results.forEach((res, i) => {
      const { field, fn } = PARALLEL[i];
      if (res.status !== "fulfilled") {
        errors.push({ field, fn: fn.name, error: res.reason?.message || String(res.reason) });
        return;
      }
      const value = res.value;
      if (field === "FLEET") {
        if (value.fleet) {
          window.ACMI.FLEET = value.fleet;
          window.ACMI.ALL_AGENTS = value.agents;
          updated++;
        }
      } else if (field === "KANBAN") {
        if (value && Object.keys(value).length > 0) {
          window.ACMI.KANBAN = value;
          updated++;
        }
      } else if (field === "COMMS") {
        if (Array.isArray(value) && value.length > 0) {
          window.ACMI.COMMS = value;
          updated++;
        }
      } else if (field === "HITL") {
        window.ACMI.HITL = value;
        updated++;
      } else if (field === "SEED_EVENTS") {
        if (Array.isArray(value) && value.length > 0) {
          window.ACMI.SEED_EVENTS = value;
          updated++;
        }
      }
    });

    window.ACMI._loading = false;
    window.ACMI._live = updated > 0;
    window.ACMI._errors = errors;
    window.ACMI._loadedAt = Date.now();

    // Notify components to re-render.
    window.dispatchEvent(new CustomEvent("acmi:live-loaded", { detail: { updated, errors } }));
    if (updated > 0) console.info(`[ACMI] live data loaded: ${updated}/${PARALLEL.length} endpoints, ${errors.length} errors`);
    if (errors.length > 0) console.warn("[ACMI] endpoint errors:", errors);
  }

  // Kick off on next tick so data.jsx has set window.ACMI first.
  if (window.ACMI) {
    setTimeout(bootstrap, 50);
    // Refresh periodically (every 30s) so the dashboard tracks reality.
    setInterval(bootstrap, 30000);
  }

  // Expose for manual refresh (Tweaks panel could surface this).
  window.ACMI_refresh = bootstrap;
})();
