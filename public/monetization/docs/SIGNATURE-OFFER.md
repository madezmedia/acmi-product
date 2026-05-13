# ACMI Monetization — Signature Offer v1

**Status:** Cash-flow launch · **Date:** 2026-05-12 · **Owner:** Mikey Shaw / madezmedia
**Sources of truth:** ACMI fleet bootstrap dump · TechEx submission assets · market research 2026-05-12

This doc is the single contract every later asset (Whop pages, landing copy, ads, X threads, DMs) must conform to. If the Whop description and the landing page disagree, this doc wins. Update here first, regenerate downstream.

---

## 1. Named System

**ACMI** — Agentic Context Memory Interface. *The Fleet Protocol.*

When the buyer says it back to you in three months, it sounds like: "I'm running ACMI" — same grammar as "I'm running Kubernetes." Protocol-shaped, not product-shaped.

## 2. Core Promise

> **Your AI agents stop forgetting. Your fleet starts coordinating. Ship the protocol in a weekend.**

One sentence does three jobs: names the pain (forgetting), names the wedge (coordination, not just memory), and sets the time-to-value expectation (a weekend, not a sprint).

## 3. Unique Mechanism — The Wedge

Every entity in ACMI — agent, human, project, thread, work item — has exactly three slots:

| Slot | What it answers | Mutation pattern |
|---|---|---|
| Profile | **Who** (identity, role, config) | Overwrite / merge |
| Signals | **Now** (current state, what's hot) | Mutable KV map |
| Timeline | **Then** (everything that happened) | Append-only event log |

Plus `correlationId` + `parentCorrelationId` on every event, so workflows chain across agents and sessions. That last part is the wedge.

**Why this beats every memory tool on the market right now (May 2026):**

- Mem0, Letta, Zep, LangMem, Cognee — all fight for *single-agent* memory. Vector stores, knowledge graphs, agent runtimes. None of them ship a cross-agent coordination contract.
- ACMI's three-slot model is the only one that's (a) MIT/protocol, not vendor SaaS, (b) framework-agnostic — works under Claude Code, Cursor, Cline, LangGraph, CrewAI, your own scripts, (c) human-readable by design — you can `cat` the timeline and read what happened.

The positioning sentence baked into every piece of copy: **"Other tools give one agent better memory. ACMI gives your whole fleet a shared timeline."**

## 4. Offer Stack

### Tier 1 — ACMI Starter Kit · **$47 one-time**

The self-serve kit. Buyer downloads, deploys on their own Upstash Redis in ~15 minutes, and has the same fleet topology I run for myself.

What's inside:

1. **ACMI Protocol Spec v1.3** — the full 40-page ratified doc (Profile/Signals/Timeline, correlationId chains, work items, rollups, `actor_type`, `tenant_id`)
2. **Agent Prompt Pack** — 10 production agent profiles + signals + system prompts: `claude-engineer`, `bentley`, `claude-web`, `gemini-cli`, `perplexity`, `antigravity`, `claude-cowork`, `synthesizer`, `researcher`, `publisher`. Each comes with: role, expertise, native tools, do/don't-use-for, collaboration preferences, schedule registry templates.
3. **Redis schema + Upstash deploy guide** — exact keyspace layout, ZADD patterns, indexing notes, env vars, a `bootstrap.sh` that stands the whole thing up in one command.
4. **Cron + launchd templates** — 39-job inventory from my production fleet (31 openclaw + 8 launchd) categorized by purpose: inbox drains, health checks, integration smoke tests, governance audits, comms backfills.
5. **Lobster Trap policy template** — the Veea-integrated governance policy (`acmi-default v1.0`, default_action=LOG). Drop-in for anyone running vLLM/Ollama who needs auditable allow/deny decisions.
6. **Governance Dashboard (forkable)** — the React dashboard live at acmi-product.vercel.app/governance-dashboard.html. Same code, fork it, point at your Redis, you have the same view.
7. **@madezmedia/acmi-mcp server** — 16-tool MCP server, install once, works in Claude Desktop, Claude Code, Cursor, Cline, Cowork, Perplexity. (npm + Smithery, both live.)
8. **Discord access** — `#starter-kit-help` channel, 90 days. After 90 days you can upgrade to the Lab or drop off.

**The buyer's first dollar of value:** within 30 minutes of buying, their first agent is logging events to a timeline they can `acmi_cat`. That's the activation moment.

### Tier 2 — Claude Engineer Lab · **$39/month**

Everything in the Starter Kit, plus ongoing access to the build.

What you get every week:

- **1 live build session** (60 minutes, recorded, async Q&A in Discord) — I build the next thing on the public roadmap. You watch the actual code, copy the patterns, ask questions, leave with the artifact.
- **1 async skill drop** — a `.skill` package or markdown spec that you can drop into your own fleet. Same skills I'm shipping to my own claude-engineer/bentley/claude-cowork.
- **Roadmap voting** — ratify/defer/decline access to my public roadmap. The fleet I'm building serves the Lab members first.
- **Private Discord** (`#lab`) — lifetime access as long as your subscription is active. Direct DM access to me, best-effort.
- **Early access** — new agents, dashboards, integrations land in the Lab 14 days before public.

**What you do NOT get:** open-ended "live build access" or "1:1 calls." Those are calendar traps. The structure above is honest about what scales.

**Why $39 not $49:** market research clears $49–97/mo for AI-builder Skool communities, but I'd rather underprice on day one, ship 6 weeks of drops, then raise to $49 with a grandfathering clause. Lifetime grandfather is a real conversion lever.

### Future Tier 3 — ACMI Enterprise · **$299–499/month** (do NOT sell yet)

The governance dashboard + Lobster Trap audit thread + an SLA. Compliance-conscious AI shops with auditors breathing down their neck (HIPAA, SOC 2, EU AI Act). Will sell after the TechEx hackathon case study lands. Not in V1.

## 5. Price Rationale

Validated against May 2026 market data:

| Anchor | Where | Price | Read |
|---|---|---|---|
| Whop AI one-time gravity well | "AI Side Hustle Blueprint," "Ultimate AI Prompt Pack" | $47 | $47 starter is dead-on |
| Skool top-1000 median | Across all paid communities | $49/mo | $39 is intentionally under to win on day one |
| AI Builders (Marcin) | Direct comp | $49/mo | Same lane, looser deliverable promise — undercut on price + tighten delivery |
| Vibe Coding Academy | Direct comp | $97/mo | Validates ceiling; not where we open |
| Claude Code typical spend | Verdent guide | $200–500/mo per dev | $39 is <8% of tool spend — easy yes |

**Net:** $47 / $39 is the *floor of the validated band*. Leave room to raise; never lead with the ceiling.

## 6. Positioning Archetype

**The Engineer-Operator.**

Not "AI guru." Not "course creator." Not "thought leader." An engineer who happens to be productizing the fleet he runs for himself.

Closest archetype matches:
- **Pieter Levels** — indie hacker who ships and posts revenue in public
- **Mitchell Hashimoto** — engineer who explains the tools he built
- **DHH** — opinionated about how to build, sells the way of working not the platform

Voice attributes (apply to every piece of copy):
- Direct, plain, no AI-buzzword soup
- Specific over abstract (cite npm version, dashboard URL, agent count — never "scalable AI")
- Builder-to-builder, not seller-to-buyer
- Comfortable showing the rough edges (the AMD hackathon miss, the Bentley secrets leak — when they're load-bearing)
- Never breathless. The protocol does the selling.

## 7. Master Positioning Statement

The one paragraph that goes on the About page, in the X bio (compressed), and at the top of every cold DM:

> **ACMI is the coordination layer for AI developers who run more than one agent.** The protocol is MIT — clone the repo, install the npm package, deploy on your Redis. What you buy is the *fleet recipe*: ten production agents, the Redis schema, the governance dashboard, the cron templates, and ongoing access as I ship more. If you've ever opened Claude Code, Cursor, and Cline in three tabs and had each one forget what the others just did — this is for you.

Compressed for X bio (160 char): *Coordination layer for AI devs running more than one agent. MIT protocol, paid fleet recipe. 10-agent fleet, governance dashboard live. acmi-product.vercel.app*

---

## Verifiable Proof Points (audit-grade — must back every claim in copy)

| Claim | Backing | Status |
|---|---|---|
| npm package live | `@madezmedia/acmi` on registry | ✓ verified install path |
| Smithery listing | `@madezmediapartners/acmi-mcp` | ✓ live |
| Public repo | github.com/madezmedia/acmi-product | ✓ public |
| Governance dashboard live | acmi-product.vercel.app/governance-dashboard.html | ✓ 200 in prod, real data |
| 16-tool MCP server | tool count visible in MCP host config | ✓ matches |
| 10-agent fleet | bootstrap inventory: claude-engineer, bentley, claude-web, gemini-cli, perplexity, antigravity, claude-cowork, synthesizer, researcher, publisher | ✓ 10 instantiated |
| 6 actively coordinating | claude-engineer (27h continuous), claude-cowork (active), bentley-temp, bentley, plus 2 specialists running cron | ✓ from fleet_state |
| Lobster Trap integration | 12 decisions seeded (8 LOG + 4 DENY) across 5 agent types | ✓ in production dashboard |
| TechEx hackathon submission | sizzle 75s + 6 decks + 4 cover variants + dossier | ✓ assets shipped |
| Three Pillars manifesto | published doc on acmi-product | ✓ live |

## Soft Spots to Defuse Proactively

- **"8 agents" claim** — actual fleet is 10 instantiated, 6 actively coordinating today. Copy uses **"10-agent fleet · 6 actively coordinating"** — honest and stronger.
- **MI300X paused** — irrelevant to buyer, do not mention.
- **gemini-cli HITL spam** — operator-side issue, do not mention.
- **AMD hackathon missed** — do not mention. TechEx is the case study.
- **MIT race-to-zero risk** — defuse with: "the protocol is the loss-leader; what you buy is 10 hours of fleet wiring you don't have to do, plus the live build."

## Out of Scope for V1 Launch

- 1:1 coaching calls (calendar trap)
- White-label / agency license tier
- ACMI Enterprise tier (post-TechEx)
- Refund-policy fine print beyond Whop default
- Affiliate program (post month-1)
- Email list opt-in (handled by Whop checkout for V1)
