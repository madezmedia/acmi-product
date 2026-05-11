# Frameworks Demo — LangChain + CrewAI on ACMI + AMD MI300X

Track 1 (AMD Developer Hackathon) deliverable: prove ACMI works as a memory backbone for the named multi-agent frameworks (LangChain, CrewAI) running against AMD Instinct MI300X.

## What's here

| File | Framework | What it does |
|---|---|---|
| `langchain_demo.py` | LangChain v1.2 | Single agent with `create_agent(...)` + 2 ACMI tools (`acmi_event`, `acmi_signal`). Runs against vLLM Qwen2.5-7B on MI300X. |
| `crewai_demo.py` | CrewAI | 3-agent crew (researcher → synthesizer → publisher) with shared ACMI tool + same vLLM endpoint via `hosted_vllm/` provider. |
| `requirements.txt` | — | Python deps |

Both scripts produce ACMI events with `source: "langchain"` or `source: "crewai"` so framework-tagged activity is visible in the timeline at `acmi:thread:demo-amd-chain:timeline` (and via the live ops-center).

## Smoke-test receipts (2026-05-08T17:11Z)

```
[17:11:31] langchain  framework-task-start
[17:11:34] langchain  step-done × 3
[17:11:34] langchain  research-output
[17:11:34] langchain  framework-task-complete    cid=langchainDemo-1778260291578

[17:12:12] crewai     framework-task-start
[17:12:14] crewai     research-output
[17:12:16] crewai     synthesis-output
[17:12:17] crewai     publish-output
[17:12:18] crewai     framework-task-complete    cid=crewaiDemo-1778260332484
```

Both runs visible on the live ops-center: https://acmi-product.vercel.app/ops-center.html

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  AMD Instinct MI300X · 192 GB HBM3 · ROCm 7.2                        │
│                                                                      │
│  ┌────────────────────┐         ┌─────────────────────────────────┐ │
│  │  vLLM @ :8000      │         │  Ollama @ :11434                │ │
│  │  Qwen2.5-7B        │         │  llama3.3:70b · qwen2.5:32b ·   │ │
│  │  --enable-auto-    │         │  mistral-small:24b · mistral:7b │ │
│  │   tool-choice      │         │                                 │ │
│  │  --tool-call-      │         │                                 │ │
│  │   parser hermes    │         │                                 │ │
│  └─────────┬──────────┘         └────────┬────────────────────────┘ │
└────────────┼───────────────────────────────┼──────────────────────────┘
             │                              │
             │ OpenAI-compatible API        │
             ▼                              ▼
┌────────────────────────┐    ┌─────────────────────────────────┐
│  langchain_demo.py     │    │  crewai_demo.py                 │
│  • create_agent(...)   │    │  • 3 Agent + 3 Task + 1 Crew    │
│  • @tool acmi_event    │    │  • AcmiEventTool(BaseTool)      │
│  • @tool acmi_signal   │    │  • Process.sequential           │
└──────────┬─────────────┘    └──────────┬──────────────────────┘
           │                             │
           ▼                             ▼
        ┌───────────────────────────────────────┐
        │  ACMI · Upstash Redis REST            │
        │  acmi:thread:demo-amd-chain:timeline  │
        │  (events tagged source=langchain      │
        │   or source=crewai for judge proof)   │
        └───────────────────────────────────────┘
```

## Run locally (or on the GPU box)

```bash
# 1. Install deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Set ACMI Upstash creds
export UPSTASH_REDIS_REST_URL="https://<your-instance>.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="<your-token>"

# 3. Run LangChain demo
python langchain_demo.py "Research the three-key ACMI protocol"

# 4. Run CrewAI demo
python crewai_demo.py "Brief on three-key ACMI protocol"
```

By default both scripts call `http://127.0.0.1:8000/v1` (vLLM endpoint on the same box). If running off-box, edit the `base_url` in each demo to point at the public MI300X endpoint.

## Why these two frameworks specifically

The AMD hackathon Track 1 spec names "LangChain, CrewAI, or AutoGen" as the eligible tech stack. ACMI is meant to be **framework-agnostic memory** — a coordination protocol any of them can implement against. These demos prove that claim with working code: same vLLM endpoint, same ACMI memory, two different framework calling conventions, identical event shape on the wire.

## Why ACMI as the memory layer

- **Three keys per entity** (profile / signals / timeline) — small enough to fit in any LLM context window, structured enough to support audit trails
- **Comms v1.1 envelope** (camelCase `correlationId`, ZSET timelines) — chains across framework boundaries naturally
- **No per-framework adapters needed** — both demos use the same REST + JSON pattern, no LangChain-specific or CrewAI-specific glue

## Files extracted from acmi-product

The full ACMI implementation lives in the parent repo (`../api/_lib/`). These demos use the public Upstash REST API directly to keep dependencies minimal — but the same events would land identically through the MCP server at `acmi-product.vercel.app/api/mcp` (with OAuth).

## Veea Lobster Trap Integration (TechEx Track 1)

Both demos now route their LLM traffic through [Veea's Lobster Trap](https://github.com/veeainc/lobstertrap) DPI proxy when `LOBSTERTRAP_URL` is set — and every policy decision (ALLOW / DENY / HUMAN_REVIEW / LOG / RATE_LIMIT) lands as a Comms v1.1 event on `acmi:thread:lobstertrap-decisions:timeline`.

Full integration docs, architecture diagram, policy walkthrough, and 5-case acceptance suite: [`README-lobstertrap.md`](./README-lobstertrap.md).

```bash
# Start LT in front of vLLM
./lobstertrap serve --policy lobstertrap-policy.yaml --listen :7777 --backend http://127.0.0.1:8000

# Point demos at LT (single env var — that's the whole integration)
export LOBSTERTRAP_URL=http://localhost:7777/v1
python langchain_demo.py "Research the three-key ACMI protocol"
python crewai_demo.py "Brief on three-key ACMI protocol"

# Verify policy behavior end-to-end
python lobstertrap_smoke.py
```

## See also

- **Lobster Trap integration spec**: [`README-lobstertrap.md`](./README-lobstertrap.md) — TechEx Track 1 deliverable
- Architecture spec: [`../../agents/folana/MEMORY-ARCHITECTURE.md`](../../agents/folana/MEMORY-ARCHITECTURE.md) — the 5-layer memory model these chains are implementing
- Ops Center (live activity): https://acmi-product.vercel.app/ops-center.html
- Smithery listing: https://smithery.ai/servers/madezmediapartners/acmi-mcp
- npm package: `npx -y @madezmedia/acmi-mcp`
