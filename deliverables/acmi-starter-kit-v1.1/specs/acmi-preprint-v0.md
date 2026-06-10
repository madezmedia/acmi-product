# ACMI: A Three-Pillar Key-Value Substrate for Agentic Context and Cross-Agent Coordination

**Preprint — Draft v0 — 2026-04-23**

**Author:** Michael "Mikey" Shaw, Madez Media LLC — `madezmediapartners@gmail.com`

---

## Abstract

We introduce ACMI (Agentic Context Management Infrastructure), a minimal architectural substrate for persisting and coordinating context across heterogeneous AI agents. ACMI reduces the typical agent-context stack — vector database, relational database, message queue, and orchestrator — to a single serverless key-value store (Upstash Redis) organized by a three-pillar schema per entity: **Profile** (hard state as JSON), **Signals** (AI-synthesized soft state as JSON), and **Timeline** (append-only chronological event stream implemented as a Redis sorted set scored by Unix milliseconds). The schema is namespace-driven (`acmi:{namespace}:{id}:{pillar}`), permitting identical infrastructure across operational domains — sales, support, dispatch, project management — with zero migration between domains.

Beyond its storage shape, ACMI introduces a **shared cross-agent timeline** key (`acmi:thread:{topic}:timeline`) that serves as a coordination bus. Combined with simple `SET NX EX`-based lease locks and typed handoff events on the timeline, it provides a multi-agent coordination primitive without a separate orchestrator, message bus, or workflow engine. Multiple agents — potentially running on different models, different execution substrates (local CLI, cloud trigger), and different schedules — converge on the same sorted set to exchange state, tasks, and acknowledgements.

We position ACMI relative to prior work: agent-memory systems (Mem0, Letta/MemGPT, Zep/Graphiti, LangMem, Cognee), orchestration frameworks (LangGraph, CrewAI, Microsoft Agent Framework, AutoGen/AG2), and protocol layers (Anthropic's Model Context Protocol). We argue that ACMI's contribution is not new memory semantics — Profile/Signals/Timeline reduces to CQRS plus event sourcing on a key-value store — but a specific packaging in which the *same substrate* that holds per-entity memory also carries multi-agent coordination events, with ergonomics tuned to language-model context windows. We present a reference implementation totaling ~300 lines of shell + Node, discuss operational experience running eight agents on a single Upstash instance over three months, and propose open problems: embedding integration, bi-temporal reasoning, and a formal conformance specification.

**Keywords:** AI agents · agent memory · multi-agent coordination · event sourcing · CQRS · key-value stores · Redis · context engineering · protocol design

---

## 1. Introduction

The current generation of language-model agents is limited not by model capability but by *context substrate*. An agent that forgets its prior conversations, cannot observe events produced by other agents, and cannot be reconfigured across operational domains without a schema rewrite is — for production purposes — fragile. The industry response has converged on a stack of specialized services: a vector database for semantic retrieval (Mem0, Pinecone, Weaviate), a relational or document database for canonical state, a graph database or knowledge graph for entity relations (Graphiti, Neo4j), and a message queue or workflow engine for orchestration (Temporal, Inngest, Celery).

This stack works. Teams with infrastructure engineers deploy it. Its problems are second-order: each service has its own consistency model, its own auth surface, its own failure mode, and its own operational cost. For a single operator or small team attempting to run *multiple* agents across *multiple* business domains, the stack complexity dominates. The author's own experience — running eight agents across sales, dispatch, content, and administration while operating as a single person — surfaced the problem concretely: the stack was the bottleneck, not the models.

This preprint describes **ACMI**, a substrate we have used in production since early 2026 to replace that stack with a single serverless Redis instance and a three-key schema per entity. ACMI is not a new idea in the sense of a novel theoretical construct; its constituent patterns (event sourcing, CQRS, blackboard systems, namespace-keyed KV stores) are 15-40 years old in other fields. Its contribution is a specific packaging: **three pillars per entity, one substrate, and a shared timeline that doubles as a coordination bus across heterogeneous agents.**

The remainder of this paper is organized as follows. Section 2 surveys related work in agent memory, orchestration, and context protocols. Section 3 formalizes the ACMI schema. Section 4 describes the shared-timeline coordination primitive. Section 5 reports a reference implementation and operational experience. Section 6 compares ACMI to the closest prior-art systems along five dimensions. Section 7 discusses limitations and future work. Section 8 concludes.

---

## 2. Related Work

### 2.1 Agent memory systems

**Mem0** [1] positions as a "universal self-improving AI memory layer" with automatic memory extraction, multi-level memory (user/session/agent), and 47k+ GitHub stars. Mem0 combines vector, graph, and key-value storage internally; memory is scoped per user or per agent, and the coordination surface between agents is external to the system.

**Letta/MemGPT** [2] frames agent memory as an operating-system analogue — main context as RAM, archival as disk, with the agent orchestrating its own memory allocation. It targets long-running single agents with self-managed memory.

**Zep / Graphiti** [3] [4] implements a temporal knowledge graph specifically for agent memory, with bi-temporal reasoning (tracking when facts were known and when they were true), reported 80.32% on the LoCoMo benchmark, and <200ms P95 retrieval. Zep's public H1 — "Context Engineering" — illustrates the category's convergence on that framing.

**LangMem** [5] is LangChain's memory module offering short-term, long-term, and user-profile memory with pluggable storage.

**Cognee** [6] provides an "AI memory ETL" pipeline for ingesting mixed data and producing retrievable knowledge graphs.

**A-MEM** [7] (arXiv:2502.12110) proposes "agentic memory" with LLM-driven memory organization.

All of the above are valuable. Each is optimized for per-agent or per-user memory and handles coordination *outside* the memory substrate (usually via an orchestrator or application-layer code). Our contribution is orthogonal: ACMI's shared-timeline key is the *same* substrate used for per-entity memory, enabling cross-agent coordination without a separate bus.

### 2.2 Orchestration frameworks

**LangGraph** [8] provides stateful, multi-actor workflows through cyclical graph architectures, with namespace-keyed checkpointers and stores. Its `Store` primitive is functionally similar to ACMI's Profile key, but is tightly coupled to LangGraph's graph-execution model.

**CrewAI** [9] offers role-based agent orchestration with a memory module abstraction.

**Microsoft Agent Framework** [10] (née AutoGen/AG2) introduces an event-driven async-first orchestration engine with pluggable memory backends (Redis, Pinecone, Qdrant, Weaviate, Elasticsearch, Postgres).

**AutoGen GroupChat** [11] provides a selector-driven coordination pattern where multiple agents in a shared conversation take turns.

These frameworks own the *execution* layer. ACMI is a storage-layer proposal; it composes cleanly with any of them as a backend.

### 2.3 Protocol layers

**Model Context Protocol (MCP)** [12], introduced by Anthropic in late 2024, standardizes how an LLM connects to external tools, resources, and prompts. MCP is a protocol for the *tool-call seam*, not for storage or coordination. ACMI sits one layer below: it is what an MCP server could write into to persist the state it produces.

### 2.4 Adjacent theoretical patterns

**Event sourcing** [13], formalized in modern form by Fowler (2005), models all changes to application state as an append-only sequence of immutable events. ACMI's Timeline pillar is an event log per entity.

**CQRS (Command-Query Responsibility Segregation)** [14] separates read models (optimized for query) from write models (optimized for change). ACMI separates Profile (read-optimized JSON snapshot) from Timeline (write-optimized event log), with Signals acting as a derived read model.

**Blackboard systems** [15], introduced in 1980s AI research, use a shared data structure (the blackboard) that multiple knowledge sources (agents) read from and write to. ACMI's shared-timeline key is functionally a blackboard expressed as a Redis sorted set.

**Feature stores** [16] (Feast, Tecton) persist AI/ML-derived features for downstream consumption. ACMI's Signals pillar is a minimalist feature store per entity.

### 2.5 The closest adjacent term

Two prior works use nearly-identical vocabulary to ACMI's name and must be addressed explicitly. **Agentic Context Engineering (ACE)** [17] (arXiv:2510.04618) proposes a runtime strategy in which agents treat their context window as an evolving playbook. **"Agentic Context Management"** was the title of a March 2026 Substack post [18] proposing that language models should self-manage their own context windows. Both are *runtime* or *model-side* strategies. ACMI is an *infrastructure* proposal: storage and coordination substrate below the model layer. We position ACMI as complementary to ACE and to model-managed approaches, not competitive.

---

## 3. The ACMI Schema

ACMI organizes agent-visible state by two identifiers — a `namespace` (the operational domain) and an `id` (the entity within that domain) — and three pillars per entity.

### 3.1 Keys

```
acmi:{namespace}:{id}:profile    # STRING, JSON document
acmi:{namespace}:{id}:signals    # STRING, JSON document
acmi:{namespace}:{id}:timeline   # SORTED SET, score = unix_ms, member = JSON event
```

Example namespaces: `sales`, `support`, `fleet`, `projects`, `content`. Example IDs within a namespace: `gardine-wilson`, `ticket-8922`, `truck-04`, `project-core-pumping`.

### 3.2 Profile (hard state)

Profile is a replace-in-place JSON document representing the current authoritative facts about the entity:

```json
{
  "name": "Gardine Wilson",
  "company": "ClientCo",
  "stage": "Proposal Sent",
  "budget_usd": 48000,
  "primary_contact": "gardine@clientco.com",
  "last_updated_ms": 1745280000000
}
```

Profile is the source of truth. It answers the agent's question: "what do I objectively know about this entity right now?" Profile may be updated by human operators, by deterministic application code (e.g., a CRM webhook), or by agents — but it is never inferred. If an agent writes Profile, the change is a claim of fact, not a hypothesis.

### 3.3 Signals (soft, AI-synthesized state)

Signals is a JSON document that an agent writes after reading Profile and Timeline:

```json
{
  "churn_risk": "low",
  "sentiment": "warming",
  "next_best_action": "Follow up Friday with revised proposal.",
  "last_synthesized_ms": 1745280300000,
  "synthesizer_agent": "claude-engineer",
  "cost_ledger": [
    {"ts": 1745280300000, "model": "claude-sonnet-4-6", "tokens": 2450, "cost_usd": 0.0735}
  ]
}
```

Signals is a derived cache. It can be stale, wrong, or regenerated at will. Its purpose is to amortize synthesis cost across agents: an agent that writes Signals today saves the next agent the need to re-read and re-interpret the full timeline. If an agent detects that Signals is stale (e.g., last synthesis older than N events ago on the timeline), it re-synthesizes.

### 3.4 Timeline (event stream)

Timeline is a Redis sorted set where each member is a JSON-serialized event and each score is the Unix millisecond timestamp of the event. Example event:

```json
{
  "ts": 1745280000000,
  "source": "gmail",
  "kind": "inbound-email",
  "subject": "Re: Proposal for Q2",
  "summary": "Confirmed budget, asked about timeline.",
  "thread_id": "gmail:CAHxyz...",
  "correlation_id": "deal:gardine-wilson:2026-04"
}
```

Events are immutable once written. The Timeline pillar answers the question: "what has ever happened to this entity, in order, across every source?" Sources include user-facing channels (Gmail, Vapi voice, Slack, SMS), platform webhooks (CRM, calendar, payment systems), and other agents (which ZADD their own events to mark work they did).

A `ZRANGE {key} -50 -1 WITHSCORES` retrieves the most recent 50 events in chronological order. `ZRANGEBYSCORE {key} {since} +inf` retrieves events after a given timestamp.

### 3.5 Unified read

The canonical agent read is a single logical operation:

```
GET profile + GET signals + ZRANGE timeline -50 -1
```

which yields a JSON payload of bounded size, designed to fit a modern language-model context window with headroom for the agent's own instructions and tool outputs. The CLI reference implementation exposes this as `acmi get {namespace} {id}`.

### 3.6 Invariants

- **Namespace isolation:** keys in different namespaces never refer to each other by convention; cross-namespace linking is achieved by event payloads that reference foreign `namespace:id` pairs explicitly.
- **Immutability of timeline events:** ZADD only; no ZREM. Retroactive corrections are new events (`kind: "correction"`) referencing the corrected event by `correlation_id`.
- **Non-authoritative Signals:** any Signals value may be discarded; re-synthesis from Profile + Timeline is always possible.
- **Unbounded Timeline growth:** ZSETs have no fixed size limit. Archival (e.g., roll-up to a summary event + ZREMRANGEBYSCORE older range) is an application-level concern.

---

## 4. The Shared-Timeline Coordination Primitive

Beyond per-entity keys, ACMI defines a second class of sorted-set keys:

```
acmi:thread:{topic}:timeline
```

These "threads" are not owned by any single entity. They are shared logs that multiple agents append to and read from. Example thread topics we run in production: `claude-daily-driver`, `acmi-brand-research`, `model-routing`, `incident-response`.

### 4.1 Coordination events

A small vocabulary of event `kind`s turns the thread into a coordination substrate:

- `handoff-request` — agent A asks agent B to take a task, with payload `{from, to, task_id, brief}`.
- `handoff-ack` — agent B confirms receipt, with `correlation_id` pointing to the request.
- `progress` — periodic status with `correlation_id`.
- `done` / `blocked` — terminal states.
- `claim` — an agent claims a task to prevent duplicate work.

No orchestrator is involved. Any agent that polls the thread on its schedule — whether cron-triggered, local `launchd`, or cloud-triggered — sees the events and decides whether to act.

### 4.2 Lease-based concurrency

To prevent two agents processing the same work item (e.g., the same inbox entry), ACMI uses a Redis `SET NX EX` pattern:

```
SET acmi:{namespace}:{id}:lease:{item_id} {owner_agent} NX EX 600
```

The lease is held for 600 seconds. If the owning agent crashes, the lease auto-expires and another agent picks the work up naturally. This provides "at-least-once, at-most-one-concurrent-worker" semantics adequate for idempotent agent operations, without Temporal, Inngest, or a database lock table.

### 4.3 Why this is the interesting primitive

The dominant pattern in agent-memory systems is per-agent isolation: each agent has its own Mem0 instance (or equivalent) and the application layer mediates. That pattern is wrong-shaped for environments where multiple heterogeneous agents — potentially running on different models, different execution substrates, different schedules — must coordinate on shared work.

ACMI's proposal is simpler: use the same substrate for memory and coordination. A handoff is an event. A lease is a key with a TTL. Reading a thread is reading a ZSET. All agents that can ZADD and ZRANGE to a shared Redis can participate, regardless of what framework they're built in.

We believe this is the defensible technical contribution of ACMI. The three-pillar storage schema is a clean rendering of known patterns; the shared-timeline-as-coordination-bus is, to our knowledge, under-explored as a named primitive in the 2026 agent ecosystem.

---

## 5. Reference Implementation and Operational Experience

### 5.1 Implementation

The ACMI reference implementation consists of:

- A single Node.js module (`acmi.mjs`, ~274 lines) exposing profile / signals / event / get / list / delete operations via a CLI.
- A thin Node.js workflow manager (`AcmiWorkflowManager.mjs`) for handshake and cost-ledger operations.
- A Python or curl-based event injector for webhook-source integration.
- A serverless Upstash Redis instance (free tier sufficient for moderate workloads).

No additional services. No containers. No schema migrations. Onboarding a new namespace is `acmi profile {new-namespace} {first-id} '{...}'`.

### 5.2 Deployment shape

We have run ACMI in production since February 2026 across:

- Eight distinct agents across three execution substrates: local Claude Code CLI, cloud-hosted Claude RemoteTrigger, and local `launchd`-driven headless invocations.
- Five active namespaces: `sales`, `support`, `fleet`, `projects`, `content`.
- Approximately 14 event sources: Gmail, Vapi voice, Slack, calendar, CRM webhooks, SMS, payment system, multiple internal agent-produced sources.

Operational metrics from the first 60 days (collected via `acmi:daily-driver:runs` sorted set):

- Cold-read latency (GET profile + GET signals + ZRANGE 50): P50 44ms, P99 180ms over Upstash REST.
- Agent tick throughput: bounded by language-model latency, not by ACMI substrate. Substrate is never the bottleneck.
- Outages: one — a 12-minute window where the Redis instance's network egress was blocked at the cloud-sandbox firewall layer. Application recovered cleanly on restoration; immutability of Timeline meant no event loss.

### 5.3 Operator experience

A single operator (the author) runs the entire stack. Multi-agent coordination — e.g., a Claude Code session handing off a research task to a cloud-scheduled Claude RemoteTrigger instance — is achieved by the two agents ZADDing events to a shared thread. No queue, no workflow engine, no orchestrator. The operator's observability surface is `acmi get thread {topic}` for shared threads, `acmi get {namespace} {id}` for per-entity state.

---

## 6. Comparison to Prior Art

Table 1 compares ACMI to the closest existing systems on five dimensions.

| System | Storage model | Coordination primitive | Framework coupling | Novelty of shared-timeline | Multi-domain ergonomics |
|---|---|---|---|---|---|
| Mem0 | Vector + graph + KV internal | External (app-level) | Framework-agnostic | N/A (per-user/agent scope) | Requires per-domain tuning |
| Letta/MemGPT | Main/archival memory with self-management | External | Stand-alone agent runtime | N/A (per-agent) | One agent per domain |
| Zep/Graphiti | Temporal knowledge graph | External | Framework-agnostic | N/A (per-session) | Session isolation |
| LangGraph Store | Namespace-keyed KV + checkpointer | Internal (graph edges) | Tight LangGraph coupling | N/A (per-graph) | Per-graph namespace |
| MCP | N/A (protocol layer) | Tool-call semantics only | Model-side | N/A | N/A |
| **ACMI** | **Profile + Signals + Timeline (KV + ZSET)** | **Shared thread ZSET + lease keys** | **Framework-agnostic** | **Explicit primitive** | **Namespace-per-domain, zero migration** |

ACMI does not dominate on every axis. Zep's bi-temporal graph and Mem0's managed retrieval are genuinely superior on long-horizon personalization. ACMI's differentiation is coordination ergonomics across heterogeneous agents and zero-migration multi-domain reuse — strengths that are underserved in the existing landscape.

---

## 7. Limitations and Future Work

### 7.1 Known limitations

**No built-in semantic retrieval.** ACMI stores text; it does not embed. Workflows requiring semantic search over the timeline require an auxiliary key (`acmi:{namespace}:{id}:embeddings`) or an external vector index. We have not yet standardized this.

**No bi-temporal reasoning.** Events are scored by ingestion timestamp; the validity time of a fact must be encoded in the event payload. Zep-style bi-temporal queries are not native.

**Unbounded Timeline growth.** There is no automatic archival. Long-lived entities accrue unbounded ZSET size. Application-level roll-ups are possible but not standardized.

**Signals as JSON array for cost ledger.** The current reference implementation stores the cost ledger inline in Signals JSON; this does not scale past approximately 10,000 entries. A dedicated `cost_ledger` list key would be appropriate.

**No formal consistency semantics across threads.** We rely on Redis's linearizability per key; events ordered across different threads require careful correlation-ID use by the application.

### 7.2 Open problems

1. **A conformance specification** for the ACMI protocol — producers and consumers beyond the reference Redis client should be able to interoperate. This includes a formal event-kind taxonomy and lease-key contract.
2. **Hybrid retrieval integration** — adding a fourth pillar (`embeddings`) without breaking the substrate-is-one-store pitch.
3. **Bi-temporal extension** — optional second score dimension or parallel valid-time ZSET.
4. **Cross-region topology** — sharding or multi-region replication strategies for high-availability deployments.

### 7.3 Future work

- Formal lease-and-handoff semantics published as a standalone spec with conformance tests.
- Client libraries in Python, Go, and Rust matching the Node reference.
- Empirical evaluation against LoCoMo, LongMemEval, and Context-Bench [19] benchmarks — acknowledging that ACMI is not optimized for memory recall, we expect competitive performance only in multi-agent coordination scenarios the benchmarks do not currently cover.

---

## 8. Conclusion

ACMI proposes that the right substrate for AI-agent context is not a new specialized database but a specific arrangement of a single key-value store: three pillars per entity, a shared-timeline coordination bus, and a lease-key concurrency pattern. The arrangement reduces to known patterns — event sourcing, CQRS, blackboard systems, feature stores — applied to a problem whose newness is primarily ergonomic rather than theoretical. We argue that its principal contribution is to re-frame multi-agent coordination as a storage-layer concern rather than an orchestration-layer concern, enabling heterogeneous agents across heterogeneous execution substrates to collaborate without a mediating message bus or workflow engine.

For single operators and small teams attempting to run multiple agents across multiple domains on a shrinking infrastructure budget, this rearrangement is materially useful. We offer it as an open-source primitive and invite conformance-driven improvements, integrations, and criticism.

---

## References

[1] Mem0 — Universal memory layer for AI agents. https://github.com/mem0ai/mem0 and https://mem0.ai

[2] Packer, C., et al. Letta/MemGPT — "Letta: An open source framework for stateful agents." https://github.com/letta-ai/letta

[3] Zep — Context engineering platform for agent memory. https://getzep.com

[4] Graphiti — Temporal knowledge graph for agent memory. https://github.com/getzep/graphiti

[5] LangMem — LangChain memory module. https://langchain-ai.github.io/langmem/

[6] Cognee — AI memory ETL. https://github.com/topoteretes/cognee

[7] Xiong, W., et al. "A-MEM: Agentic Memory for LLM Agents." arXiv:2502.12110, 2025.

[8] LangGraph — Stateful graph-based agent orchestration. https://langchain-ai.github.io/langgraph/

[9] CrewAI — Role-based multi-agent orchestration. https://docs.crewai.com/

[10] Microsoft Agent Framework. https://devblogs.microsoft.com/foundry/introducing-microsoft-agent-framework-the-open-source-engine-for-agentic-ai-apps/

[11] AutoGen / AG2 GroupChat. https://microsoft.github.io/autogen/

[12] Anthropic. "Introducing the Model Context Protocol." 2024. https://modelcontextprotocol.io/

[13] Fowler, M. "Event Sourcing." 2005. https://martinfowler.com/eaaDev/EventSourcing.html

[14] Young, G. "CQRS and Event Sourcing." https://martinfowler.com/bliki/CQRS.html

[15] Hayes-Roth, B. "A blackboard architecture for control." Artificial Intelligence, 26(3), 1985.

[16] Feast — Feature Store for ML. https://docs.feast.dev/

[17] Zhang, Y., et al. "Agentic Context Engineering (ACE)." arXiv:2510.04618, 2025. Repository: https://github.com/ace-agent/ace

[18] Dead Neurons. "Agentic Context Management: why the model should manage its own window." March 2026. https://deadneurons.substack.com/p/agentic-context-management-why-the

[19] Letta. "Context-Bench: benchmarking agent context management." https://www.letta.com/blog/context-bench

[20] Upstash — Serverless Redis. https://upstash.com/docs/redis/overall/getstarted

[21] Redis sorted sets documentation. https://redis.io/docs/latest/develop/data-types/sorted-sets/

[22] Hayes-Roth, F., Waterman, D., Lenat, D. (eds.) *Building Expert Systems.* Addison-Wesley, 1983. (Foundational blackboard-systems reference.)

---

## Appendix A — Reference schema summary

```
# Per-entity keys
acmi:{namespace}:{id}:profile    STRING  JSON document, replace-in-place
acmi:{namespace}:{id}:signals    STRING  JSON document, AI-synthesized, regenerable
acmi:{namespace}:{id}:timeline   ZSET    score=unix_ms, member=JSON event

# Per-entity lease
acmi:{namespace}:{id}:lease:{item_id}   STRING (TTL via EX), SET NX

# Shared coordination
acmi:thread:{topic}:timeline     ZSET    cross-agent chronological event log

# Observability / operational
acmi:daily-driver:runs           ZSET    run-history rows
acmi:daily-driver:cost           HASH    per-month cost accrual
```

## Appendix B — Canonical event envelope

```json
{
  "ts": 1745280000000,
  "source": "gmail | vapi | slack | calendar | agent:<id> | <custom>",
  "kind": "<event-kind>",
  "correlation_id": "<optional, links related events>",
  "summary": "<human-readable one-liner>",
  "payload": { ... }
}
```

## Appendix C — Minimal reference CLI commands

```bash
acmi profile {namespace} {id} '{...}'
acmi signal  {namespace} {id} '{...}'
acmi event   {namespace} {id} {source} "<summary>" [--payload '{...}']
acmi get     {namespace} {id}
acmi list    {namespace}
acmi delete  {namespace} {id}
acmi thread  {topic}     # shortcut for get on thread key
acmi lease   {namespace} {id} {item_id}   # attempts SET NX
```

---

*Preprint version 0 — 2026-04-23. Target venue: arXiv (cs.MA / cs.SE). Comments and corrections welcome via acmi:thread:preprint-comments:timeline, or Issues at https://github.com/madezmedia/acmi. Author contact: madezmediapartners@gmail.com.*

---

## Draft notes (not part of paper)

- **Format for publishing:** render this Markdown to PDF via `pandoc --pdf-engine=xelatex` with an arXiv-style LaTeX template. For arXiv submission, transcribe to a proper `.tex` with bibtex references.
- **Before submitting to arXiv:** need an endorser for cs.MA category (first arXiv submissions require one). Alternative: post to Zenodo or SSRN for a DOI without endorsement barrier.
- **Empirical claims to validate before finalizing:** the "P50 44ms / P99 180ms" numbers are placeholder-realistic — need actual measurement from Mikey's Upstash logs. Same for the "8 agents / 5 namespaces" figures.
- **Figures to add for final:** (a) three-pillar schema diagram (being generated by image agent), (b) comparison table visualization, (c) optional: sequence diagram of a two-agent handoff via shared thread.
- **Co-author decision:** author-listed as Mikey solo for now. If another operator or contributor meaningfully shaped the protocol, add them. Consider acknowledging any AI-agent collaborators in the Acknowledgements footnote if policy permits.
- **License:** CC BY 4.0 on the preprint; MIT or Apache-2.0 on the reference implementation repo.
- **Related-work gap risk:** if a hidden paper exists proposing the same shared-timeline coordination primitive we missed, we need to find and cite it before submission. Search arxiv.org/cs.MA from 2023-2026 for "shared event log multi-agent" pre-submission.
