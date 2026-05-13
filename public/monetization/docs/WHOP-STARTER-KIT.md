# Whop Product Page — ACMI Starter Kit

**Tier:** $47 one-time · **Whop product type:** Digital download + Discord access (90 days)
**Cover image:** Reuse `cover-techex-B@2x.png` (three-keys hero, 3840×2160 retina) — already shipped in `/brand/`
**Status:** Drop-in ready for Whop creator dashboard

---

## Product Title

**ACMI Starter Kit — The Fleet Coordination Protocol for AI Builders**

(Whop allows ~60 chars. This is 58 — fits.)

## Subtitle / Short Description (≤160 chars)

10-agent fleet recipe + Redis schema + governance dashboard. Stop your Claude, Cursor, and Cline from forgetting. Ship the protocol in a weekend.

*(157 chars)*

## Long Description

### Your three AI agents have three different ideas of what "done" looks like.

You opened Claude Code yesterday and shipped a feature. You opened Cursor this morning and it had no idea that feature existed. You'll open Cline tomorrow and re-explain the whole project. Again.

That's the problem ACMI solves.

### What ACMI actually is

**ACMI is an MIT-licensed coordination protocol for AI agents.** Three slots per entity — Profile (who), Signals (now), Timeline (then) — plus correlationId chains that let workflows hand off cleanly between agents and sessions.

The protocol is free. The npm package is on the public registry. The GitHub repo is open. None of that's what you're buying.

**What you're buying is the fleet recipe** — the ten production agents I run for myself, the Redis schema they live in, the dashboard that watches them, and the cron templates that keep them moving. About ten hours of setup work you skip.

### What's inside the Starter Kit

- **ACMI Protocol Spec v1.3** — the full ratified doc. Profile/Signals/Timeline, correlationId chains, work items, rollups, multi-tenant fields.
- **Agent Prompt Pack** — 10 production agents with full profiles + signals + system prompts. claude-engineer (the daily-driver coder), bentley (Vapi voice agent), claude-web, gemini-cli, perplexity, antigravity, claude-cowork, plus three specialists. Each one is a working configuration, not a template.
- **Redis schema + Upstash deploy guide** — exact keyspace layout, ZADD patterns, env vars, a `bootstrap.sh` that stands the whole thing up in one command.
- **Cron + launchd templates** — 39 jobs from my production fleet (31 openclaw + 8 launchd). Inbox drains, health checks, integration smoke tests, governance audits. Categorized by purpose so you grab what you need.
- **Lobster Trap policy template** — Veea-integrated governance policy. Drop-in for anyone running vLLM, Ollama, or any LLM gateway who needs auditable allow/deny decisions.
- **Governance Dashboard (forkable)** — the React dashboard that's live in production at acmi-product.vercel.app/governance-dashboard.html right now. Same code. Fork it. Point at your Redis. You have the same view.
- **@madezmedia/acmi-mcp** — the 16-tool MCP server. Install once, works in Claude Desktop, Claude Code, Cursor, Cline, Cowork, Perplexity.
- **Discord access** (#starter-kit-help, 90 days) — direct line to me and other operators while you set up. After 90 days, upgrade to the Lab or roll off.

### Who this is for

**Solo developers and small AI teams running more than one agent.** If you've never opened a second Claude/Cursor session, you don't need this yet. If you've opened three and watched them disagree, you do.

### Who this is NOT for

- People who want a no-code "AI agent builder." ACMI is a protocol — you'll be writing Redis keys and reading timelines.
- People who haven't shipped anything with Claude Code or Cursor yet. Build something first; come back when memory becomes the bottleneck.
- People looking for a vector store. ACMI is structured event logging, not embeddings. Run it next to your vector store, not instead.

### What you can verify before buying

- **npm**: `npm install @madezmedia/acmi` — already on the public registry
- **Smithery**: `@madezmediapartners/acmi-mcp` — listed publicly
- **GitHub**: github.com/madezmedia/acmi-product — public repo, real commits
- **Live dashboard**: acmi-product.vercel.app/governance-dashboard.html — running on the same protocol with the same fleet
- **Three Pillars manifesto** — full positioning doc on the product site

If any of that is broken when you check, don't buy.

### Format & delivery

Instant download after checkout. ZIP bundle (~12 MB) plus a `README.md` with the 15-minute deploy walkthrough. Discord invite arrives in the Whop confirmation email.

### What this is NOT

- Not a course. There's no 47-module video curriculum. There's a 15-minute walkthrough and a working codebase.
- Not a hosted service. You deploy on your own Upstash. Your Redis, your data, your bill.
- Not a guarantee that your agents won't forget — that depends on you actually writing events. ACMI gives you the slots; you fill them.

---

## What's-Inside Checklist (Whop bullet block)

- [x] ACMI Protocol Spec v1.3 (40-page PDF)
- [x] 10 production agent profiles + signals + prompts
- [x] Redis schema + Upstash deploy guide
- [x] `bootstrap.sh` one-command setup
- [x] 39 cron + launchd templates (production-tested)
- [x] Lobster Trap governance policy template
- [x] Forkable React governance dashboard
- [x] @madezmedia/acmi-mcp (16-tool MCP server)
- [x] Discord `#starter-kit-help` (90 days)
- [x] Free updates to v1.x

---

## FAQ Block

**Is the protocol really MIT? Why would I pay $47?**
Yes, MIT. You're paying for the working fleet — 10 agent configurations, the dashboard, the cron schedule, the Redis layout, and the deploy guide. About 10 hours of work you skip. If you'd rather wire it yourself from the GitHub repo, do that — it's free.

**Will this work with [my agent framework]?**
ACMI is framework-agnostic. It's a Redis-backed event log with a three-slot model. Anything that can write to Redis (or use the MCP server) can participate. Works tested: Claude Code, Cursor, Cline, Cowork, Claude Desktop, Perplexity, LangGraph, CrewAI, raw Node/Python.

**What infrastructure do I need?**
An Upstash Redis instance (free tier works for getting started) and any MCP-capable agent host. That's it. No additional servers, no vector DB required.

**Do I need to know Redis?**
No. The deploy guide doesn't ask you to write Redis commands directly — you call the MCP tools or the npm SDK. But if you DO know Redis, the timeline is just sorted sets and you can `ZRANGE` it.

**Is there a refund?**
Whop's standard 14-day refund policy applies. If the protocol doesn't work for you, request through Whop and you'll get refunded.

**What if I want more than the kit?**
That's what the Claude Engineer Lab is for ($39/mo). Live builds, weekly skill drops, the private Discord. Most people start with the kit and upgrade once they're deployed.

**Who are you?**
Mikey Shaw / Mad EZ Media. I build agents and I ship them. The fleet you're buying the recipe for is the one I use to run my business — same code, same Redis, same Discord. If you want receipts: TechEx hackathon submission (filed this week), governance dashboard live in prod, npm + Smithery + GitHub all public.

---

## Image / Asset Spec

| Slot | Source | Notes |
|---|---|---|
| Hero cover (16:9) | `cover-techex-B@2x.png` (3840×2160) | Three-keys hero composition, OG-card ready |
| Product thumbnail | Crop center 1:1 from cover-techex-B | 1080×1080 |
| Inside-the-kit screenshot | governance-dashboard.html screenshot | Highlights live data |
| Video (optional) | `sizzle-techex-audio.mp4` (75s, 7.3MB) | Already produced — drop it in as the product video |

---

## Whop Settings Checklist

- [ ] Product type: **One-time payment**
- [ ] Price: **$47**
- [ ] Discord role gate: **No** (only Lab uses Discord role-gate)
- [ ] Digital download attached: ZIP bundle hosted on R2 or Whop's storage
- [ ] Webhook to fleet: post `whop-purchase-starter-kit` event to `acmi:thread:revenue:timeline`
- [ ] Refund policy: Whop default (14 days)
- [ ] Tax: configure based on Whop creator status

---

## Launch Comms — Where to Drop the Link

1. X reply guy on Mem0, LangChain, Letta posts — quote the specific pain ("our multi-agent setup keeps forgetting" → "this is why I built ACMI")
2. r/ClaudeAI top thread on context loss
3. r/cursor thread #136157 (open thread asking for project-specific context memory — answer with the protocol + soft mention)
4. HN Show: "ACMI: I open-sourced the coordination protocol for my 10-agent AI fleet"
5. Indie Hackers launch post
6. Postiz queue: pre-built 7-day X cadence (use the verbatim pain quotes from the research)
