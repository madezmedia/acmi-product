# ACMI — Agentic Context Management Infrastructure

[![smithery badge](https://smithery.ai/badge/madezmediapartners/acmi-mcp)](https://smithery.ai/servers/madezmediapartners/acmi-mcp)

> The coordination backbone for AI agent fleets. Three Redis keys — Profile, Signals, Timeline.

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

## License

MIT License — see [LICENSE](LICENSE) file.

## Author

**Michael Shaw** / [Mad EZ Media Partners](https://www.madezmedia.com)  
The agent context guy.
