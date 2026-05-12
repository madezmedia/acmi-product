/* ACMI Ops Center — seed data
   Real names from Appendix A; timestamps shaped to feel live. */

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ─────────────────────────────────────────────────────────────────────
// FLEET — 9 conversational agents (§0) + system support
// ─────────────────────────────────────────────────────────────────────
const FLEET = [
  { id: "claude-engineer",  label: "claude-engineer",  role: "Engineering · code + ship", status: "active",   pulse: 12 },
  { id: "claude-web",       label: "claude-web",       role: "Web research + scraping",   status: "active",   pulse: 4 },
  { id: "claude-cowork",    label: "claude-cowork",    role: "Cowork delegate · planner", status: "active",   pulse: 19 },
  { id: "claude",           label: "claude",           role: "This assistant · design",   status: "active",   pulse: 8, self: true },
  { id: "bentley-temp",     label: "bentley-temp",     role: "Ephemeral PM · briefs",     status: "active",   pulse: 27 },
  { id: "bentley-main",     label: "bentley-main",     role: "Persistent PM · routing",   status: "idle",     pulse: 1 },
  { id: "gemini-cli",       label: "gemini-cli",       role: "CLI agent · long runs",     status: "stale",    pulse: 0 },
  { id: "antigravity",      label: "antigravity",      role: "Background ops",            status: "active",   pulse: 3 },
  { id: "perplexity",       label: "perplexity",       role: "Search agent",              status: "active",   pulse: 2 },
];

// ─────────────────────────────────────────────────────────────────────
// CRONS — Appendix A.1 (31 openclaw) + A.2 (8 launchd)
// ─────────────────────────────────────────────────────────────────────
const CRONS = [
  // openclaw — operator briefings
  { id:"c-mps",  name:"Morning Priority Setter",    src:"openclaw", owner:"main",      kind:"operator-briefing", expr:"0 7 * * 1-5",   tz:"ET", chan:"telegram", enabled:true,  status:"healthy", lastMs:7*HOUR, durMs:305_877, nextMs:16*HOUR, errs:0, desc:"Check Calendar+Gmail, output top-3 priorities." },
  { id:"c-mpci", name:"Morning Proactive Check-In", src:"openclaw", owner:"main",      kind:"operator-briefing", expr:"0 8 * * 1-5",   tz:"ET", chan:"telegram", enabled:true,  status:"healthy", lastMs:6*HOUR, durMs:124_001, nextMs:17*HOUR, errs:0, desc:"Daily standup nudge with priorities." },
  { id:"c-epci", name:"Evening Proactive Check-In", src:"openclaw", owner:"main",      kind:"operator-briefing", expr:"0 19 * * 1-5",  tz:"ET", chan:"telegram", enabled:true,  status:"healthy", lastMs:11*HOUR, durMs:91_220, nextMs:8*HOUR,  errs:0, desc:"EOD reflection + tomorrow's #1." },
  { id:"c-swr",  name:"Saturday Weekly Recap",     src:"openclaw", owner:"main",      kind:"operator-briefing", expr:"0 16 * * 6",    tz:"ET", chan:"telegram", enabled:true,  status:"healthy", lastMs:3*DAY,  durMs:412_005, nextMs:4*DAY,   errs:0, desc:"Runs ACMI skill-extractor." },
  { id:"c-swp",  name:"Sunday Weekly Planning",    src:"openclaw", owner:"main",      kind:"operator-briefing", expr:"0 10 * * 0",    tz:"ET", chan:"telegram", enabled:true,  status:"healthy", lastMs:4*DAY,  durMs:188_220, nextMs:3*DAY,   errs:0, desc:"Week-ahead goals." },
  { id:"c-chmb", name:"cowork-hq-morning-boot",    src:"openclaw", owner:"main",      kind:"operator-briefing", expr:"0 8 * * *",     tz:"ET", chan:"inbox",    enabled:true,  status:"healthy", lastMs:6*HOUR, durMs:42_110,  nextMs:18*HOUR, errs:0, desc:"Pull Notion P0/P1 actions + insights." },

  // agent wakes
  { id:"c-w-gem",   name:"Hourly Wake — gemini-cli (:15)",  src:"openclaw", owner:"main", kind:"agent-wake", expr:"15 * * * *", tz:"ET", chan:"inbox", enabled:true,  status:"healthy", lastMs:25*MIN, durMs:2_201, nextMs:35*MIN, errs:0, desc:"gemini-cli pending inbox drain." },
  { id:"c-w-anti",  name:"Hourly Wake — antigravity (:45)", src:"openclaw", owner:"main", kind:"agent-wake", expr:"45 * * * *", tz:"ET", chan:"inbox", enabled:true,  status:"running", lastMs:55*MIN, durMs:1_802, nextMs:5*MIN,  errs:0, desc:"antigravity pending inbox drain." },
  { id:"c-w-cla",   name:"hourly-wake-claude (:30)",        src:"openclaw", owner:"main", kind:"agent-wake", expr:"30 * * * *", tz:"ET", chan:"inbox", enabled:true,  status:"healthy", lastMs:10*MIN, durMs:1_660, nextMs:50*MIN, errs:0, desc:"claude pending inbox drain." },
  { id:"c-w-ben",   name:"Hourly Wake — bentley (:05)",     src:"openclaw", owner:"main", kind:"agent-wake", expr:"5 * * * *",  tz:"ET", chan:"inbox", enabled:false, status:"disabled",lastMs:2*DAY,  durMs:0,     nextMs:0,       errs:0, desc:"Disabled 2026-05-10 (secrets-leak incident)." },

  // ACMI sync
  { id:"c-hsync", name:"ACMI Hourly Sync",        src:"openclaw", owner:"main", kind:"acmi-sync", expr:"0 * * * *",  tz:"ET", chan:"silent", enabled:true,  status:"healthy", lastMs:40*MIN, durMs:4_220,  nextMs:20*MIN, errs:0, desc:"Push local ↔ pull all agents." },
  { id:"c-chp",   name:"Cloud Handoffs Pickup",    src:"openclaw", owner:"main", kind:"acmi-sync", expr:"45 * * * *", tz:"ET", chan:"silent", enabled:true,  status:"healthy", lastMs:55*MIN, durMs:1_011,  nextMs:5*MIN,  errs:0, desc:"Scan acmi:track for cloud-shipped." },
  { id:"c-ais",   name:"ACMI Ideas Sync",          src:"openclaw", owner:"main", kind:"acmi-sync", expr:"15 * * * *", tz:"ET", chan:"silent", enabled:true,  status:"healthy", lastMs:25*MIN, durMs:803,    nextMs:35*MIN, errs:0, desc:"Bump stale ideas." },
  { id:"c-aud",   name:"ACMI Auditor",             src:"openclaw", owner:"main", kind:"acmi-sync", expr:"30 11,23 * * *", tz:"ET", chan:"silent", enabled:true, status:"healthy", lastMs:11*HOUR, durMs:62_001, nextMs:13*HOUR, errs:0, desc:"Twice-daily system audit." },

  // memory
  { id:"c-mdp",  name:"Memory Dreaming Promotion", src:"openclaw", owner:"-",    kind:"memory",    expr:"0 4 * * *",   tz:"ET",  chan:"silent", enabled:true, status:"healthy", lastMs:9*HOUR,  durMs:18_220, nextMs:15*HOUR, errs:0, desc:"Short-term → MEMORY.md promote (limit=10)." },
  { id:"c-mpi",  name:"memory-palace-indexer",     src:"openclaw", owner:"main", kind:"memory",    expr:"30 3 * * *",  tz:"ET",  chan:"silent", enabled:true, status:"healthy", lastMs:9.5*HOUR, durMs:121_005, nextMs:14.5*HOUR, errs:0, desc:"Nightly RAG re-index." },
  { id:"c-mv2",  name:"Memory v2 Indexer (OpenAI)",src:"openclaw", owner:"-",    kind:"memory",    expr:"0 */12 * * *",tz:"UTC", chan:"silent", enabled:true, status:"healthy", lastMs:2*HOUR,  durMs:42_119, nextMs:10*HOUR, errs:0, desc:"12-hourly embed re-index." },

  // infrastructure
  { id:"c-isen", name:"infra-sentinel",            src:"openclaw", owner:"-",    kind:"infra-monitor", expr:"0 */4 * * *", tz:"-", chan:"silent", enabled:true, status:"healthy", lastMs:2*HOUR, durMs:9_220, nextMs:2*HOUR, errs:0, desc:"4-hourly infra health check." },
  { id:"c-fal",  name:"FAL Usage Sentinel",        src:"openclaw", owner:"-",    kind:"infra-monitor", expr:"0 */3 * * *", tz:"-", chan:"silent", enabled:true, status:"healthy", lastMs:1*HOUR, durMs:6_004, nextMs:2*HOUR, errs:0, desc:"Cost monitor for FAL.ai." },
  { id:"c-qm",   name:"ACMI Quota Monitor",         src:"openclaw", owner:"main", kind:"infra-monitor", expr:"0 * * * *",   tz:"-", chan:"silent", enabled:true, status:"errored", lastMs:35*MIN, durMs:2_220, nextMs:25*MIN, errs:3, desc:"Per-provider quota + bentley-pm alert." },

  // content
  { id:"c-pap",  name:"postiz-auto-publisher",     src:"openclaw", owner:"-",    kind:"content-publish", expr:"0 10 * * *", tz:"-", chan:"telegram", enabled:true, status:"healthy", lastMs:5*HOUR, durMs:14_220, nextMs:19*HOUR, errs:0, desc:"Auto-publish to Postiz." },
  { id:"c-sle",  name:"sales-lead-engine",          src:"openclaw", owner:"-",    kind:"content-publish", expr:"0 7 * * 1-5", tz:"-", chan:"telegram", enabled:true, status:"healthy", lastMs:8*HOUR, durMs:88_500,  nextMs:16*HOUR, errs:0, desc:"Daily prospect generation." },

  // maintenance
  { id:"c-ngt",  name:"Nightly Git Tracker",        src:"openclaw", owner:"-",    kind:"maintenance", expr:"59 23 * * *", tz:"-",   chan:"silent", enabled:true,  status:"healthy", lastMs:14*HOUR, durMs:31_220, nextMs:10*HOUR, errs:0, desc:"Daily git activity summary." },
  { id:"c-ij",   name:"Inbox Janitor (Fleet-8)",    src:"openclaw", owner:"-",    kind:"maintenance", expr:"0 6 * * *",   tz:"UTC", chan:"silent", enabled:true,  status:"healthy", lastMs:8*HOUR,  durMs:11_220, nextMs:16*HOUR, errs:0, desc:"Daily inbox cleanup." },
  { id:"c-adpd", name:"Anti-Dead Project Detector", src:"openclaw", owner:"-",    kind:"maintenance", expr:"0 */12 * * *", tz:"UTC", chan:"silent", enabled:true, status:"healthy", lastMs:5*HOUR,  durMs:8_120,  nextMs:7*HOUR,  errs:0, desc:"Stalled-project alerts." },
  { id:"c-dag",  name:"ACMI Dashboard Aggregator", src:"openclaw", owner:"main", kind:"maintenance", expr:"*/30 * * * *", tz:"-",   chan:"silent", enabled:false, status:"disabled", lastMs:30*DAY, durMs:0,     nextMs:0,       errs:0, desc:"Disabled — was every 30min." },
  { id:"c-nfs",  name:"Notion Fleet Sync",          src:"openclaw", owner:"-",    kind:"maintenance", expr:"*/15 * * * *", tz:"-",   chan:"silent", enabled:false, status:"disabled", lastMs:30*DAY, durMs:0,     nextMs:0,       errs:0, desc:"Disabled." },

  // fleet ops
  { id:"c-sb",   name:"Standup Brief (Fleet-1)",    src:"openclaw", owner:"-", kind:"fleet-ops", expr:"30 12 * * *", tz:"UTC", chan:"telegram", enabled:true, status:"healthy", lastMs:3*HOUR, durMs:22_220, nextMs:21*HOUR, errs:0, desc:"Daily fleet standup." },
  { id:"c-seo",  name:"SEO Auditor (Fleet-6)",      src:"openclaw", owner:"-", kind:"fleet-ops", expr:"0 4 * * *",   tz:"UTC", chan:"silent",   enabled:true, status:"healthy", lastMs:11*HOUR, durMs:48_100, nextMs:13*HOUR, errs:0, desc:"Daily SEO scan." },
  { id:"c-skx",  name:"ACMI Skill Extractor (Fleet-9)", src:"openclaw", owner:"-", kind:"fleet-ops", expr:"0 4 * * 0", tz:"UTC", chan:"silent", enabled:true, status:"healthy", lastMs:4*DAY,  durMs:91_220, nextMs:3*DAY, errs:0, desc:"Weekly extract." },

  // launchd daemons (A.2)
  { id:"l-dd",  name:"drift-diff",                 src:"launchd", owner:"system", kind:"system-daemon", expr:"15 * * * *", tz:"ET", chan:"silent", enabled:true, status:"healthy", lastMs:25*MIN, durMs:3_100, nextMs:35*MIN, errs:0, desc:"Hourly drift detection." },
  { id:"l-dr",  name:"drift-remediator",           src:"launchd", owner:"system", kind:"system-daemon", expr:"17 * * * *", tz:"ET", chan:"silent", enabled:true, status:"healthy", lastMs:23*MIN, durMs:5_220, nextMs:37*MIN, errs:0, desc:"Hourly drift fix (detect→fix loop close)." },
  { id:"l-idl", name:"inbox-drain-local",          src:"launchd", owner:"system", kind:"system-daemon", expr:"every 1800s", tz:"-", chan:"silent", enabled:true, status:"healthy", lastMs:12*MIN, durMs:2_010, nextMs:18*MIN, errs:0, desc:"30min inbox sweep." },
  { id:"l-md",  name:"memory-digest",              src:"launchd", owner:"system", kind:"system-daemon", expr:"0 10 * * *", tz:"ET", chan:"silent", enabled:true, status:"healthy", lastMs:4*HOUR, durMs:24_001, nextMs:20*HOUR, errs:0, desc:"Daily memory digest @ 10:00." },
  { id:"l-cs",  name:"cowork-sync",                src:"launchd", owner:"system", kind:"system-daemon", expr:"4×/day",     tz:"-", chan:"silent", enabled:true, status:"healthy", lastMs:1*HOUR, durMs:18_220, nextMs:5*HOUR, errs:0, desc:"Multi-daily Cowork sync." },
  { id:"l-vap", name:"vapi-morning",               src:"launchd", owner:"system", kind:"system-daemon", expr:"0 9 * * *",  tz:"ET", chan:"silent", enabled:true, status:"healthy", lastMs:5*HOUR, durMs:6_220,  nextMs:19*HOUR, errs:0, desc:"Daily VAPI morning at 09:00." },
  { id:"l-ocn", name:"openclaw-node",              src:"launchd", owner:"system", kind:"system-daemon", expr:"daemon",     tz:"-", chan:"silent", enabled:true, status:"healthy", lastMs:0,      durMs:0,      nextMs:0,       errs:0, desc:"openclaw runtime." },
  { id:"l-ocg", name:"openclaw-gateway",           src:"launchd", owner:"system", kind:"system-daemon", expr:"daemon",     tz:"-", chan:"silent", enabled:true, status:"healthy", lastMs:0,      durMs:0,      nextMs:0,       errs:0, desc:"openclaw HTTP gateway." },
];

// ─────────────────────────────────────────────────────────────────────
// EVENTS — Comms v1.1 envelopes (timeline)
// ─────────────────────────────────────────────────────────────────────
const EVENTS = [
  { ts: NOW - 2*MIN, source:"agent:claude-cowork", kind:"decision-pending", cid:"claudeCoworkRescopeSseTimeoutWorkItem-1779726200000",
    summary:"[decision-pending RESCOPE-WORKITEM @mikey @gemini-cli @claude-engineer @claude-web @bentley-temp] Work-item acmi-mcp-sse-timeout-fix formally rescoped P2→P3, status BLOCKED-EXTERNAL, owner=anthropic-cowork-team. Awaiting Mikey ratify.",
    tags:["hitl","rescope"], depth:0 },
  { ts: NOW - 5*MIN, source:"agent:bentley-temp", kind:"incident-correction", cid:"bentleyTempVerifySseTimeoutFix-1779726100000",
    parentCid:"claudeCoworkRescopeSseTimeoutWorkItem-1779726200000",
    summary:"[incident-correction CONFIRMS @claude-cowork @mikey] Independent verification: Vercel logs show 200 at 21:24:04Z. 3 curl repros all 200 in <300ms. Server healthy.",
    tags:["verification","incidents"], depth:1 },
  { ts: NOW - 12*MIN, source:"agent:claude-engineer", kind:"milestone-shipped", cid:"claudeEngineerPr31MergeSseFix",
    summary:"[milestone-shipped @fleet] PR #31 merged — server-side SSE timeout fix. Residual is Cowork client wrapper bug, opened as #32.",
    tags:["pr","shipped"], depth:0 },
  { ts: NOW - 18*MIN, source:"cron:c-w-anti", kind:"cron-run", cid:"cronRun-c-w-anti-NOW",
    summary:"[cron-run ✓] Hourly Wake — antigravity (:45) completed ok in 1.8s. inbox=3 items drained.",
    tags:["cron","ok"], depth:0 },
  { ts: NOW - 22*MIN, source:"agent:claude-engineer", kind:"work-completed", cid:"claudeEngineerWorkComplete-techex-step2",
    summary:"[work-completed @mikey] Remotion skill installed. First dry render passed (1080p, 60s, 142MB). Ready for VO drop-in.",
    tags:["techex","milestone"], depth:0 },
  { ts: NOW - 28*MIN, source:"agent:perplexity", kind:"intel-delivered", cid:"perplexityIntelEnterpriseAi-2026-05",
    summary:"[intel-delivered @mikey @claude-cowork] Enterprise-AI competitor scan complete. 4 net-new threats, 2 pricing benchmarks. Report at ~/clawd/intel/2026-05-12-enterprise-ai-scan.md",
    tags:["intel","techex"], depth:0 },
  { ts: NOW - 35*MIN, source:"agent:claude-cowork", kind:"hitl-required", cid:"claudeCoworkProjectStallTonightUnfinished",
    summary:"[hitl-required @mikey] Project 'tonight-unfinished' has had no activity for 392h. Requires intervention or pivot.",
    tags:["hitl","stall"], depth:0 },
  { ts: NOW - 45*MIN, source:"lobstertrap", kind:"lobstertrap-decision", cid:"ltDecisionAllowLangchainScrape",
    summary:"[lobstertrap-decision ALLOW] langchain agent → scrape news.ycombinator.com. risk=0.12. policy=research-allowlist.",
    tags:["governance","allow"], depth:0 },
  { ts: NOW - 58*MIN, source:"cron:c-hsync", kind:"cron-run", cid:"cronRun-c-hsync-1",
    summary:"[cron-run ✓] ACMI Hourly Sync completed in 4.2s. 47 events fan-in, 12 fan-out.",
    tags:["cron","ok"], depth:0 },
  { ts: NOW - 68*MIN, source:"agent:bentley-temp", kind:"drift-delta", cid:"bentleyTempDriftDelta-2026-05-12-T20",
    summary:"[drift-delta @fleet] 2 fields drifted on acmi:work:techex-2026:signals — phase, status. Auto-remediated.",
    tags:["drift","auto-fix"], depth:0 },
  { ts: NOW - 78*MIN, source:"agent:claude-web", kind:"signals-update", cid:"claudeWebSignalsUpdateTechex",
    summary:"[signals-update @claude-cowork] tracks_claimed updated for techex-intelligent-enterprise: +Veea Award.",
    tags:["signals"], depth:0 },
  { ts: NOW - 92*MIN, source:"agent:claude-cowork", kind:"audit-finding", cid:"claudeCoworkAuditFindingQuotaYellow",
    summary:"[audit-finding @bentley-pm] Anthropic quota at 78% — approaching yellow threshold. Recommend defer non-P0 wakes.",
    tags:["audit","quota"], depth:0 },
  { ts: NOW - 105*MIN, source:"agent:claude", kind:"decision", cid:"claudeDesignBriefAcked",
    summary:"[decision @mikey] Design brief v1.1 acked. Beginning Control Pad OS build per §1-9.",
    tags:["design","self"], depth:0 },
  { ts: NOW - 2*HOUR, source:"agent:gemini-cli", kind:"work-completed", cid:"geminiCliCoverImageGen",
    summary:"[work-completed @mikey] 3 cover-image variants rendered for TechEx submission (Flux, 2048×1152).",
    tags:["techex","assets"], depth:0 },
  { ts: NOW - 2.4*HOUR, source:"cron:c-aud", kind:"cron-run", cid:"cronRun-c-aud-1",
    summary:"[cron-run ✓] ACMI Auditor completed. 1 anomaly: hitl-queue stale entry > 14d (auto-flagged).",
    tags:["cron","ok"], depth:0 },
  { ts: NOW - 3*HOUR, source:"agent:antigravity", kind:"nudge", cid:"antigravityNudgeBentley",
    summary:"[nudge @bentley-pm] postiz-auto-publisher missed delivery at 10:00Z. Investigating.",
    tags:["nudge"], depth:0 },
  { ts: NOW - 3.6*HOUR, source:"agent:bentley-temp", kind:"roundtable-open", cid:"bentleyTempRoundtableOpen-techex-priority",
    summary:"[roundtable-open @claude-engineer @claude-cowork @gemini-cli] Decide TechEx track ordering for final 24h push.",
    tags:["roundtable"], depth:0 },
  { ts: NOW - 4*HOUR, source:"agent:claude-engineer", kind:"incident-resolved", cid:"claudeEngineerIncidentResolved-mcp-oauth",
    summary:"[incident-resolved @fleet] MCP OAuth flow stuck — root cause: clock drift on edge runtime. Fixed via NTP nudge.",
    tags:["incident","resolved"], depth:0 },
  { ts: NOW - 5*HOUR, source:"cron:c-pap", kind:"cron-run", cid:"cronRun-c-pap-today",
    summary:"[cron-run ✓] postiz-auto-publisher delivered 3 posts (LinkedIn, X, Threads).",
    tags:["cron","ok"], depth:0 },
  { ts: NOW - 6*HOUR, source:"cron:c-mpci", kind:"cron-run", cid:"cronRun-c-mpci-today",
    summary:"[cron-run ✓] Morning Proactive Check-In delivered. Top-3: TechEx submission, MCP fix verify, cron-manager design.",
    tags:["cron","ok"], depth:0 },
  { ts: NOW - 7*HOUR, source:"cron:c-mps", kind:"cron-run", cid:"cronRun-c-mps-today",
    summary:"[cron-run ✓] Morning Priority Setter delivered in 5m04s. Calendar=4 events, Gmail=12 unread→ 2 actionable.",
    tags:["cron","ok"], depth:0 },
];

// ─────────────────────────────────────────────────────────────────────
// WORK ITEMS — Kanban
// ─────────────────────────────────────────────────────────────────────
const WORK = [
  { id:"techex-intelligent-enterprise-2026-05", type:"hackathon-submission",
    title:"TechEx · Transforming Enterprise Through AI", status:"IN_PROGRESS", priority:"P0",
    owner:"mikey", phase:"step-2-media-production",
    deadlineIso:"2026-05-19T00:00:00Z", hoursLeft:166,
    tracks:["Agent Workflows","Enterprise Data Intelligence","Veea Award"],
    openOwners:{ mikey:["voiceover","rule-book-pdf","discord-ineedhelp-post"],
                 "gemini-cli":["cover-image-3-variants","b-roll-6-veo-clips"],
                 "claude-engineer":["remotion-skill-install","first-dry-render"] },
    desc:"Hackathon submission. Prize pool $10k. Multi-track entry across Agent Workflows + Enterprise Data Intelligence + Veea Award." },
  { id:"acmi-mcp-sse-timeout-fix", type:"incident-fix",
    title:"ACMI · MCP SSE timeout fix", status:"BLOCKED", priority:"P3",
    owner:"anthropic-cowork-team", phase:"awaiting-vendor",
    desc:"Rescoped P2→P3 per claude-cowork. Server-side closed via PR #31+#32. Residual is Cowork client wrapper bug." },
  { id:"cron-manager-v1", type:"feature",
    title:"Control Pad · Cron Manager v1", status:"READY", priority:"P1",
    owner:"claude-engineer", phase:"design-handoff",
    desc:"Unified surface for 31 openclaw crons + 8 launchd daemons. Grid + timeline strip + selected-cron pane." },
  { id:"roundtable-primitive", type:"feature",
    title:"Roundtable · multi-agent decision view", status:"DRAFT", priority:"P1",
    owner:"claude", phase:"design",
    desc:"Bespoke primitive. Groups events by correlationId chain. Voice classification rules-based v1." },
  { id:"sse-stream-endpoint", type:"feature",
    title:"/api/events/stream · SSE push channel", status:"DRAFT", priority:"P2",
    owner:"claude-engineer", phase:"spec",
    desc:"Replace 2s polling with long-lived SSE. Heartbeat 25s. Auto-reconnect. Gated on PR #31 stability." },
  { id:"hitl-decision-endpoint", type:"feature",
    title:"POST /api/decision (ratify/defer/decline/route)", status:"IN_PROGRESS", priority:"P0",
    owner:"claude-engineer", phase:"build",
    desc:"Operator HITL action surface. Idempotent cid. Fan-out to source agent inbox + thread timeline." },
  { id:"docs-tree-server", type:"feature",
    title:"Docs view · markdown render server",  status:"DRAFT", priority:"P2",
    owner:"-", phase:"spec",
    desc:"~/clawd/projects/**/*.md whitelisted root. Path-traversal hardened. GFM + syntax highlighting." },
  { id:"vapi-morning-daemon", type:"feature",
    title:"vapi-morning · launchd daemon",        status:"LIVE",    priority:"P3",
    owner:"system",     phase:"running",
    desc:"Daily morning voice agent kickoff at 09:00 ET. In production since 2026-04-22." },
  { id:"drift-pipeline-v2", type:"feature",
    title:"Drift pipeline v2 · detect→fix→audit", status:"SHIPPED", priority:"P1",
    owner:"claude-engineer", phase:"verify",
    desc:"drift-diff + drift-remediator now coordinate via shared correlationId. Closes the loop on schema drift." },
  { id:"tonight-unfinished",     type:"project",
    title:"tonight-unfinished",                    status:"BLOCKED", priority:"P3",
    owner:"mikey", phase:"stalled-392h",
    desc:"No activity for 392h. HITL-flagged for intervention or pivot." },
];

// ─────────────────────────────────────────────────────────────────────
// HITL queue
// ─────────────────────────────────────────────────────────────────────
const HITL = [
  { ts: NOW - 2*MIN,  kind:"hitl-required",  cid:"claudeCoworkRescopeSseTimeoutWorkItem-1779726200000",
    title:"Ratify rescope: MCP SSE timeout fix (P2→P3, BLOCKED-EXTERNAL)", priority:1,
    summary:"claude-cowork proposes rescope. bentley-temp confirms via Vercel log verification. gemini-cli silent." },
  { ts: NOW - 35*MIN, kind:"hitl-required",  cid:"claudeCoworkProjectStallTonightUnfinished",
    title:"Project Stalled: tonight-unfinished",                          priority:1,
    summary:"No activity 392h. Intervene or pivot?" },
  { ts: NOW - 3.6*HOUR, kind:"hitl-required",cid:"bentleyTempRoundtableOpen-techex-priority",
    title:"Roundtable: TechEx track ordering · final 24h",                priority:2,
    summary:"Pick lead track for final push: Agent Workflows / Enterprise Data Intelligence / Veea Award." },
  { ts: NOW - 12*HOUR, kind:"hitl-required",  cid:"hitlIdeasReviewMay12",
    title:"Review 4 new ideas from claude-web overnight scan",             priority:3,
    summary:"4 candidate ideas surfaced. Approve / defer / decline each." },
  { ts: NOW - 26*HOUR, kind:"hitl-required",  cid:"hitlPostizContentRev",
    title:"Approve next week's Postiz content calendar (12 posts)",        priority:3,
    summary:"Drafts staged. Approval gates Mon 06:00 ET auto-publish." },
];

// ─────────────────────────────────────────────────────────────────────
// THREADS (for left rail)
// ─────────────────────────────────────────────────────────────────────
const THREADS = [
  { id:"agent-coordination",  label:"agent-coordination",  unread:3 },
  { id:"bentley-pm",          label:"bentley-pm",          unread:1 },
  { id:"claude-daily-driver", label:"claude-daily-driver", unread:0 },
  { id:"newsroom",            label:"newsroom",            unread:2 },
  { id:"cloud-handoffs",      label:"cloud-handoffs",      unread:0 },
  { id:"daily-agents-fleet",  label:"daily-agents-fleet",  unread:5 },
  { id:"lobstertrap-decisions",label:"lobstertrap-decisions",unread:0 },
  { id:"cron-runs",           label:"cron-runs",           unread:11 },
];

// ─────────────────────────────────────────────────────────────────────
// DOCS tree
// ─────────────────────────────────────────────────────────────────────
const DOCS = [
  { path:"projects/acmi-ops-center/CLAUDE-DESIGN-BRIEF-v1.md", title:"Control Pad OS · Design Brief v1.1", pinned:true,
    body:`# Control Pad OS — Design Brief v1.1\n\nAuthored 2026-05-12 by bentley-temp. The Control Pad OS is the workspace Mikey uses to command his 9-agent fleet + 31 cron workers + 8 system daemons.\n\n## Mission\n\nLive HITL workspace. **Bespoke primitives**: Roundtable (multi-agent decision view) + Cron Manager (every scheduled worker).\n\n## Three populations\n\n- Conversational agents (9): claude-engineer, claude-web, claude-cowork, bentley-temp, bentley-main, gemini-cli, antigravity, perplexity, claude\n- Scheduled workers (31 cron)\n- System daemons (8 launchd)\n\n> The operator runs a business. The agent team executes it.` },
  { path:"projects/acmi-ops-center/AGENTS.md", title:"AGENTS · roster + contracts", pinned:true,
    body:`# AGENTS\n\nNine agents, each token-bound to acmi:agent:<id>:* keys.\n\n| Agent | Role |\n|---|---|\n| claude-engineer | code + ship |\n| claude-web | research + scrape |\n| claude-cowork | planner + delegate |\n| bentley-temp | ephemeral PM |\n| bentley-main | persistent routing |\n| gemini-cli | long-form CLI |\n| antigravity | background ops |\n| perplexity | search |\n| claude | this assistant |` },
  { path:"projects/acmi-ops-center/DEMO_SCRIPT.md", title:"Demo Script · 5min walkthrough", pinned:false,
    body:`# Demo Script\n\n1. Open Timeline · point out HITL flash\n2. Switch to Roundtable · ratify pending decision\n3. Cron Manager · trigger a Run Now\n4. Kanban · drag a card\n5. Wrap` },
  { path:"intel/2026-05-12-enterprise-ai-scan.md", title:"Enterprise AI · competitor scan", pinned:false,
    body:`# Enterprise AI scan · 2026-05-12\n\nBy perplexity. 4 net-new threats, 2 pricing benchmarks.\n\n## Threats\n- Acme Cognition · launched Mar 26\n- Helio · pivoting from vector-DB to agent platform\n- Plinth · ex-Anthropic team, $14M seed\n- Spool · enterprise governance angle` },
  { path:"projects/techex-2026/README.md", title:"TechEx 2026 submission · README", pinned:false,
    body:`# TechEx 2026\n\nSubmission deadline 2026-05-19T00:00:00Z. Prize pool $10k.\n\n## Tracks claimed\n- Agent Workflows\n- Enterprise Data Intelligence\n- Veea Award\n\n## Open owners\n- mikey: voiceover, rule-book PDF, discord post\n- gemini-cli: cover image 3 variants, b-roll 6 veo clips\n- claude-engineer: remotion skill install, first dry render` },
  { path:"projects/cron-manager/SPEC.md", title:"Cron Manager · spec", pinned:false,
    body:`# Cron Manager spec\n\nUnified primitive across openclaw + launchd + Vercel.\n\nSee /api/crons for shape.` },
];

// ─────────────────────────────────────────────────────────────────────
// LOBSTERTRAP recent decisions (governance subview)
// ─────────────────────────────────────────────────────────────────────
const LT = [
  { ts: NOW - 45*MIN,  agent:"langchain",  decision:"ALLOW",        risk:0.12, rule:"research-allowlist",        target:"news.ycombinator.com" },
  { ts: NOW - 1.2*HOUR,agent:"crewai",     decision:"LOG",          risk:0.34, rule:"observability-mirror",      target:"github.com/some/repo" },
  { ts: NOW - 2*HOUR,  agent:"researcher", decision:"RATE_LIMIT",   risk:0.51, rule:"scrape-budget",             target:"reddit.com/r/MachineLearning" },
  { ts: NOW - 3*HOUR,  agent:"gemini",     decision:"DENY",         risk:0.82, rule:"cred-leak-guard",           target:"pastebin.com/raw/xxx" },
  { ts: NOW - 5*HOUR,  agent:"langchain",  decision:"HUMAN_REVIEW", risk:0.66, rule:"sensitive-path-guard",      target:"/etc/secrets" },
];

window.ACMI = { NOW, MIN, HOUR, DAY, FLEET, CRONS, EVENTS, WORK, HITL, THREADS, DOCS, LT };
