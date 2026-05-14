# ACMI — Agentic Context Management Infrastructure

[![smithery badge](https://smithery.ai/badge/madezmediapartners/acmi-mcp)](https://smithery.ai/servers/madezmediapartners/acmi-mcp)

> The coordination backbone for AI agent fleets. Three Redis keys — Profile, Signals, Timeline.

**Cross-references:** This is the **live demo + marketing** surface. For the protocol spec, TypeScript/JS SDK, CLI, and MCP server source, see the sibling repo [`madezmedia/acmi`](https://github.com/madezmedia/acmi). For the **production operator surface (swarm-os 2.0.0-beta)** that replaced `/ops-center-v2/*`, see [`madezmedia/cowork-kanban`](https://github.com/madezmedia/cowork-kanban) at [`swarm.madezmedia.com`](https://swarm.madezmedia.com).

## ops-center-v2 retired 2026-05-13

The `/ops-center-v2/*` surface (vanilla-JS operator dashboard prototype) was retired on **2026-05-13** as part of Strand 5 Phase 5. All traffic to `/ops-center-v2/*` now permanent-redirects (HTTP 308 via Vercel `permanent: true`; 301 also platform-acceptable) to the canonical replacement.

- **Retirement date:** 2026-05-13
- **Redirect target:** [`https://swarm.madezmedia.com`](https://swarm.madezmedia.com) (Clerk-gated; query strings preserved, paths mapped 1:1 by Vercel)
- **What was preserved:** The full pre-retire snapshot of `public/ops-center-v2/` lives in git at branch [`archive/ops-center-v2-pre-retire`](https://github.com/madezmedia/acmi-product/tree/archive/ops-center-v2-pre-retire) for emergency rollback. Nothing was deleted from `main`; the redirect is configured in `vercel.json` at the platform layer.
- **Canonical replacement:** **swarm-os 2.0.0-beta** — the Next.js / Clerk / TypeScript operator surface in the sibling repo [`madezmedia/cowork-kanban`](https://github.com/madezmedia/cowork-kanban), deployed at [`swarm.madezmedia.com`](https://swarm.madezmedia.com). Surfaces: `/timeline` (default), `/roundtable`, `/hitl`, `/cron`, `/kanban-phase`, `/todos`, `/events`, `/docs`, `/projects`, plus Phase 4 write endpoints (`POST /api/acmi/write`, `POST /api/hitl`).

The Path B (lab) → Path C (production) transition is formally complete with this retirement.

---

## Try the live demo

- **Marketing site:** [v3-ten-beta.vercel.app/acmi](https://v3-ten-beta.vercel.app/acmi/) — live MI300X panel and agent activity dashboard
- **Operator surface (swarm-os 2.0.0-beta):** [swarm.madezmedia.com](https://swarm.madezmedia.com) — Clerk-gated production console; replaced `/ops-center-v2/*` on 2026-05-13 (see retirement notice above)
- **HF Space (hackathon judge demo):** [`madezmedia/acmi-timeline-browser`](https://huggingface.co/spaces/madezmedia/acmi-timeline-browser) — Gradio-based multi-framework chain browser
- **Cloud MCP endpoint (OAuth-protected):** see [MCP Server](mcp.html) docs for the URL-published listing

## What is ACMI?

ACMI is a universal architectural framework for giving AI agents persistent, real-time context. It replaces fragmented, multi-table database joins with a single, lightning-fast Key-Value engine (Upstash Redis) optimized specifically for LLM context windows.

## The Three Keys

| Key | Type | Purpose |
|-----|------|---------|
| `acmi:{ns}:{id}:profile` | JSON | Hard state (name, stage, specs) |
| `acmi:{ns}:{id}:signals` | JSON | AI-synthesized soft state (sentiment, next action) |
| `acmi:{ns}:{id}:timeline` | ZSET | Chronological event stream |

## Quick Start

```bash
export UPSTASH_REDIS_REST_URL="https://your-endpoint.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-token"

# Create a profile
node acmi.mjs profile sales acme-corp '{"contact":"Jane","stage":"proposal"}'

# Log an event
node acmi.mjs event sales acme-corp email "Sent proposal PDF"

# Read everything
node acmi.mjs get sales acme-corp
```

## Features

- **14 MCP Tools** — stdio transport, works with Claude Desktop, Cursor, Cline, Windsurf
- **Lock Protocol** — prevent duplicate work between parallel agents
- **Roundtables** — structured multi-agent deliberation
- **Work Items** — cross-session projects with session ledger
- **Anti-Dead Heartbeats** — 48-hour stall detection
- **<5ms Reads** — zero LLM dependency for core operations

## Documentation

This repo contains the full product site with:

- [Architecture](architecture.html) — Three pillars, Communication Standard v1.1, Lock Protocol
- [MCP Server](mcp.html) — 14-tool reference, setup guides, examples
- [Product Plan](product.html) — Personas, pricing, MVP scope, ship timeline
- [Bug Tracker](bugs.html) — 9 bugs found during development sessions
- [Competitive Analysis](competitive.html) — Hindsight, Mem0, Letta, Zep comparison
- [Roundtable](roundtable.html) — Multi-agent deliberation synthesis

## Ecosystem

ACMI ships across five public surfaces. Pick the right one for your job:

| Surface | Where | What lives there |
| --- | --- | --- |
| Protocol + SDK | [`madezmedia/acmi`](https://github.com/madezmedia/acmi) | TypeScript/JS API, manifesto, CLI, MCP server source, conformance suite |
| Live demo + marketing | [`madezmedia/acmi-product`](https://github.com/madezmedia/acmi-product) | Vercel-hosted marketing, cloud MCP w/ OAuth, live ops-center dashboard (this repo) (ops-center-v2 retired 2026-05-13 → swarm.madezmedia.com) |
| npm | [`@madezmedia/acmi-mcp`](https://www.npmjs.com/package/@madezmedia/acmi-mcp) | `npx -y @madezmedia/acmi-mcp` for stdio MCP |
| Smithery | [`smithery.ai/servers/madezmediapartners/acmi-mcp`](https://smithery.ai/servers/madezmediapartners/acmi-mcp) | URL-published + stdio listings |
| HF Space (hackathon demo) | [`madezmedia/acmi-timeline-browser`](https://huggingface.co/spaces/madezmedia/acmi-timeline-browser) | Live multi-framework chain browser |

## License

MIT License — see [LICENSE](LICENSE) file.

## Author

**Michael Shaw** / [Mad EZ Media Partners](https://www.madezmedia.com)  
The agent context guy.
