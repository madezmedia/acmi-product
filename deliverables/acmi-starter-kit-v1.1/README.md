# ACMI Starter Kit v1.1

**Agentic Context Management Infrastructure** — A three-pillar key-value substrate for AI agent context and cross-agent coordination.

---

## What's Included

This starter kit contains everything you need to get started with ACMI:

### Documentation
- **`specs/acmi-v1.1-spec.md`** — Full v1.1 specification with bi-temporal events, profile history, and timeline archival
- **`specs/acmi-handoffs-v1.md`** — Cloud ⇄ Local handoff protocol for distributed agent workflows
- **`specs/acmi-preprint-v0.md`** — Academic preprint (draft) with theoretical foundations and related work
- **`specs/acmi-manifesto-v0.md`** — The Three-Pillar Protocol — Why ACMI matters

### Configuration Templates
- **`.env.example`** — Environment configuration template with all required and optional settings

### Templates Directory
- **`templates/`** — Fleet coordination and workflow templates (expand as needed)

---

## Quick Start (5 Minutes)

### Prerequisites

1. **Upstash Redis** — Free tier is sufficient for getting started
   - Create an account at [upstash.com](https://upstash.com)
   - Create a new Redis database
   - Copy the REST URL and token

2. **Node.js 18+** — For the reference CLI
   ```bash
   node --version  # Should be 18.0.0 or higher
   ```

### Setup Steps

#### 1. Configure Environment

```bash
# Copy the example .env file
cp .env.example .env

# Edit .env with your Upstash credentials
# Required fields:
# - UPSTASH_REDIS_REST_URL
# - UPSTASH_REDIS_REST_TOKEN
```

Example `.env` entry:
```env
UPSTASH_REDIS_REST_URL=https://loved-platypus-102968.upstash.io
UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAZI4AAIgcDJhNDFlNmUwMjQ5ZWI0ZDNmYWUzNDU2NDc4ZWUxMmQwOA
```

#### 2. Create Your First ACMI Entity

Using the reference CLI (install from [github.com/madezmedia/acmi](https://github.com/madezmedia/acmi)):

```bash
# Create a profile
acmi profile sales gardine-wilson '{
  "name": "Gardine Wilson",
  "company": "ClientCo",
  "stage": "Proposal Sent",
  "budget_usd": 48000,
  "primary_contact": "gardine@clientco.com",
  "last_updated_ms": 1745280000000
}'

# Add an event
acmi event sales gardine-wilson gmail "Sent revised proposal PDF. Awaiting response."

# Add synthesized signals
acmi signal sales gardine-wilson '{
  "churn_risk": "low",
  "sentiment": "warming",
  "next_best_action": "Follow up Friday with revised proposal.",
  "last_synthesized_ms": 1745280300000,
  "synthesizer_agent": "claude-engineer"
}'

# Read everything back
acmi get sales gardine-wilson
```

#### 3. Use the Shared Timeline for Coordination

```bash
# Start a coordination thread
acmi event thread claude-daily-driver agent-a "Starting research task on quota monitoring."

# Another agent can pick it up
acmi event thread claude-daily-driver agent-b "Handoff acknowledged. Beginning work."

# Claim a lease to prevent duplicate work
acmi lease sales gardine-wilson quota-monitor-task
```

---

## Core Concepts

### The Three Pillars

Every entity in ACMI has three Redis keys:

```
acmi:{namespace}:{id}:profile    # Hard state (facts)
acmi:{namespace}:{id}:signals    # Soft state (AI synthesis)
acmi:{namespace}:{id}:timeline   # Event stream (chronological)
```

**Example:**
```
acmi:sales:gardine-wilson:profile   ← JSON: company, stage, budget
acmi:sales:gardine-wilson:signals   ← JSON: churn_risk, next_action
acmi:sales:gardine-wilson:timeline  ← ZSET: all events, scored by unix_ms
```

### Unified Read

The canonical read for an agent:

```bash
GET profile + GET signals + ZRANGE timeline -50 -1
```

This returns a single JSON payload with:
- Current profile (facts)
- Current signals (AI synthesis)
- Last 50 timeline events (history)

Fits cleanly into a modern LLM context window.

### Shared Timeline Coordination

Beyond per-entity keys, ACMI has shared threads:

```
acmi:thread:{topic}:timeline
```

These enable coordination across **heterogeneous agents**:
- Different models (Claude, Gemini, GPT-4)
- Different execution substrates (local CLI, cloud trigger, cron)
- Different schedules

No orchestrator. No message queue. Just a sorted set that everyone reads from.

---

## v1.1 Features

### 1. Bi-Temporal Events (imp-1)

Events can track both **when they were ingested** (`ts`) and **when they became true** (`valid_from`/`valid_to`):

```json
{
  "ts": 1745280000000,
  "tx_time": 1745280000000,
  "valid_from": 1745280000000,
  "valid_to": null,
  "source": "crm",
  "kind": "stage-change",
  "summary": "Moved to Negotiation",
  "payload": {...}
}
```

Query: "What was true on April 1st?" → `as_of(key, "2026-04-01")`

### 2. Agent Profile History (imp-7)

Track how an agent's configuration evolves over time:

```
acmi:agent:bentley:profile           ← Current (overwrite in place)
acmi:agent:bentley:profile_history   ← ZSET of historical snapshots
acmi:agent:bentley:signals.active_profile_version ← Tracks current version
```

Query: "What was Bentley like on March 15th?" → `profile_at("bentley", "2026-03-15")`

### 3. Timeline Archival + Summaries (imp-2)

For long-lived entities with thousands of events:

```
acmi:sales:gardine-wilson:timeline           ← Recent events only (sliding window)
acmi:sales:gardine-wilson:timeline:archive   ← Older events
acmi:sales:gardine-wilson:summary            ← LLM-synthesized rollups
```

When `timeline` exceeds 1000 events, automatically archive the bottom 500.

---

## Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint | `https://loved-platypus-102968.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token | `gQAAAAAAAZI4AAIgcDJhNDFlNmUw...` |

### Optional Environment Variables

#### Model APIs (for summarization)
- `ANTHROPIC_API_KEY` — Anthropic Claude
- `OPENAI_API_KEY` — OpenAI GPT models
- `GEMINI_API_KEY` — Google Gemini
- `GLM_API_KEY` — Zhipu GLM

#### Integrations
- `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` — Slack notifications
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALLOWED_USERS` — Telegram integration
- `EMAIL_ADDRESS` / `EMAIL_PASSWORD` / `EMAIL_IMAP_HOST` — Email integration

#### Filesystem
- `MESSAGING_CWD` — Working directory for file operations
- `TERMINAL_ENV` — Environment identifier (`local`, `staging`, `production`)

#### Browser
- `AGENT_BROWSER_EXECUTABLE_PATH` — Path to browser binary
- `BROWSER_SESSION_TIMEOUT` — Browser session timeout in seconds

---

## Common Patterns

### Handoff Between Agents

```json
// Agent A hands off to Agent B
{
  "ts": 1745280000000,
  "source": "agent-a",
  "kind": "handoff-request",
  "correlation_id": "task-abc123",
  "summary": "Research task ready for handoff",
  "payload": {
    "from": "agent-a",
    "to": "agent-b",
    "task_id": "task-abc123",
    "brief": "Complete quota monitoring analysis for Q2"
  }
}

// Agent B acknowledges
{
  "ts": 1745280300000,
  "source": "agent-b",
  "kind": "handoff-ack",
  "correlation_id": "task-abc123",
  "summary": "Handoff acknowledged. Beginning work.",
  "payload": {...}
}
```

### Lease-Based Concurrency

```bash
# Attempt to claim a task for 10 minutes
SET acmi:sales:gardine-wilson:lease:quota-monitor agent-a NX EX 600

# If successful, proceed with work. Otherwise, pick a different task.
```

### Cost Tracking in Signals

```json
{
  "churn_risk": "low",
  "last_synthesized_ms": 1745280300000,
  "cost_ledger": [
    {"ts": 1745280300000, "model": "claude-sonnet-4", "tokens": 2450, "cost_usd": 0.0735},
    {"ts": 1745280310000, "model": "claude-sonnet-4", "tokens": 1800, "cost_usd": 0.0540}
  ],
  "total_cost_usd": 0.1275
}
```

---

## Operational Experience

**What we've learned running ACMI in production since February 2026:**

- **Scale:** 8 agents, 5 namespaces, 14 event sources
- **Latency:** P50 44ms, P99 180ms (profile + signals + timeline[50])
- **Uptime:** One 12-minute outage (Redis network egress); recovered cleanly
- **Storage:** Free-tier Upstash Redis sufficient for moderate workloads

**ACMI is never the bottleneck.** Substrate latency is dominated by model latency, not Redis.

---

## ACMI vs. Other Systems

| System | Storage Model | Coordination | Framework Coupling | Multi-Domain |
|--------|---------------|--------------|-------------------|--------------|
| Mem0 | Vector + Graph + KV | External (app-level) | Framework-agnostic | Per-domain tuning |
| Zep/Graphiti | Temporal knowledge graph | External | Framework-agnostic | Session isolation |
| LangGraph | Namespace KV + checkpointer | Internal (graph edges) | Tight LangGraph coupling | Per-graph namespace |
| **ACMI** | **Profile + Signals + Timeline** | **Shared timeline + leases** | **Framework-agnostic** | **Namespace-per-domain** |

ACMI differentiates on **coordination ergonomics** across heterogeneous agents and **zero-migration multi-domain reuse**.

---

## Next Steps

1. **Read the full spec:** `specs/acmi-v1.1-spec.md`
2. **Set up Upstash Redis:** Free tier at [upstash.com](https://upstash.com)
3. **Install the CLI:** `npm install -g @madezmedia/acmi-cli` (when published)
4. **Create your first namespace:** Start with `sales`, `support`, or `projects`
5. **Deploy an agent:** Try integrating with your existing agent stack

---

## Architecture Review

**Need help mapping ACMI to your specific domain?**

I offer a 90-minute architecture review where we:
- Whiteboard the ACMI keyspace for your entities
- Define the three-key schema for your business objects
- Design handoff/lease patterns for cross-agent coordination
- Write a 1-page implementation plan

**$297 — Book at [square.link/u/9Js5ZSDT](https://square.link/u/9Js5ZSDT)**

---

## Resources

- **GitHub:** [github.com/madezmedia/acmi](https://github.com/madezmedia/acmi)
- **Contact:** madezmediapartners@gmail.com
- **Author:** Michael "Mikey" Shaw, Madez Media LLC

---

## License

- Documentation: CC BY 4.0
- Reference implementation: MIT / Apache-2.0

---

## Version

**ACMI Starter Kit v1.1** — 2026-05-22

Compatible with ACMI v1.1 specification (bi-temporal, history, rollup).

---

*Part of the ACMI project by Madez Media LLC. If you build something on ACMI, I'd love to hear about it — drop me an event on `acmi:thread:public:timeline`.*