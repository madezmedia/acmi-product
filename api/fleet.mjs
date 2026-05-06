// GET /api/fleet — agent tree from acmi:agent:*:profile + signals.
// Returns nodes shaped to match window.ACMI.FLEET in data.jsx.
import { resolveInstance, redis, tryParse, json, err } from "./_lib/redis.mjs";

export const config = { runtime: "edge" };

// Map a profile.role string to a known framework label, or fall through.
function inferFramework(profile, signals) {
  const f = (profile?.framework || signals?.framework || "").toLowerCase();
  if (["langgraph", "crewai", "agno", "autogen"].includes(f)) return f;
  // Heuristic: classify by team/role keywords
  const r = (profile?.role || "").toLowerCase();
  if (/(write|report|column|news|investigat)/.test(r)) return "langgraph";
  if (/(edit|fact|copy|style)/.test(r)) return "crewai";
  if (/(art|design|illust)/.test(r)) return "agno";
  if (/(distrib|social|news.?letter|syndic)/.test(r)) return "autogen";
  return "agno"; // default
}

function deriveStatus(signals) {
  const status = (signals?.status || "").toLowerCase();
  if (status.includes("offline") || status === "err") return "err";
  if (status.includes("degraded") || status.includes("idle")) return status.includes("idle") ? "idle" : "warn";
  if (signals?.last_heartbeat) {
    const age = Date.now() - signals.last_heartbeat;
    if (age > 60 * 60 * 1000) return "warn";  // > 1h
    if (age > 24 * 60 * 60 * 1000) return "err"; // > 24h
  }
  return "ok";
}

function deriveLast(signals) {
  if (!signals?.last_heartbeat) return "—";
  const age = Math.round((Date.now() - signals.last_heartbeat) / 1000);
  if (age < 60) return `${age}s`;
  if (age < 3600) return `${Math.round(age / 60)}m`;
  if (age < 86400) return `${Math.round(age / 3600)}h`;
  return `${Math.round(age / 86400)}d`;
}

export default async function handler(req) {
  try {
    const instance = resolveInstance(req);
    const profileKeys = (await redis(instance, "KEYS", "acmi:agent:*:profile")) || [];
    if (profileKeys.length === 0) {
      return json({ ok: true, instance: instance.id, fleet: null, agents: [], note: "no agents found" });
    }

    const agents = [];
    for (const pkey of profileKeys) {
      const id = pkey.split(":")[2];
      if (!id) continue;
      const [profileRaw, signalsRaw] = await Promise.all([
        redis(instance, "GET", pkey),
        redis(instance, "GET", `acmi:agent:${id}:signals`),
      ]);
      const profile = tryParse(profileRaw) || {};
      const signals = tryParse(signalsRaw) || {};
      const framework = inferFramework(profile, signals);
      agents.push({
        id,
        label: profile.label || profile.name || id,
        role: profile.role || profile.title || "agent",
        framework,
        status: deriveStatus(signals),
        model: signals.model_id || profile.model || "—",
        last: deriveLast(signals),
        signals: typeof signals.signals_count === "number" ? signals.signals_count : 0,
        hitl: !!(signals.hitl_pending || profile.hitl_pending),
        busy: !!signals.busy,
      });
    }

    // Bucket by framework into team children — matches data.jsx FLEET shape.
    const teams = {
      langgraph: { id: "newsroom",     label: "newsroom",     role: "team", framework: "langgraph", expanded: true,  children: [] },
      crewai:    { id: "desk",         label: "copy-desk",    role: "team", framework: "crewai",    expanded: true,  children: [] },
      agno:      { id: "art",          label: "art-dept",     role: "team", framework: "agno",      expanded: false, children: [] },
      autogen:   { id: "ops",          label: "distribution", role: "team", framework: "autogen",   expanded: true,  children: [] },
    };
    for (const a of agents) {
      const team = teams[a.framework] || teams.agno;
      team.children.push(a);
    }
    const fleet = {
      id: "bentley",
      label: "bentley",
      role: "editor-in-chief",
      status: "ok",
      framework: "orchestrator",
      expanded: true,
      children: Object.values(teams).filter(t => t.children.length > 0),
    };

    return json({ ok: true, instance: instance.id, fleet, agents, ts: Date.now() }, { sMaxage: 10 });
  } catch (e) {
    return err(e.message);
  }
}
