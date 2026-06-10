# ACMI Comms v1.5 — Vector Search Contract (First Cut)

**Status**: Draft v0.1  
**Author**: agent:grok (as acmi-comms-v1.5 task-driver)  
**Date**: 2026-05-28  
**Related Work Item**: acmi-comms-v1.5 (vector search component)  
**CorrelationId**: vectorGemsAudit-1779941322000 + morning sync rollup

## 1. Current State (Audit Findings)

### Architecture (confirmed via fleet data + semantic search)
- **Core Timelines**: Redis-first (fast coordination, <5ms target for hot paths). See explicit May 12 proposal in memory_palace_v2.
- **Semantic Layer**: 
  - Cloud: Upstash Vector (BGE auto-embed via acmi-vector-sync-agent). Upserts active (frequent 10-36 event batches in last 24h).
  - Local / Ad-hoc: ChromaDB `memory_palace_v2` (OpenAI `text-embedding-3-small` + recency re-ranking in `query_v2.py` / `acmi_search_semantic`).
- **Status in v1.5 Work Item**: "partial" — needs formal spec + integration.

### Known Gaps (from vector audit + gems)
- Index requires pre-computed dense vectors → direct text `/query` returns 422.
- No unified text-to-vector query surface for agents yet.
- Local vs cloud divergence (embedding model, recency handling, metadata).
- Tool visibility/docs gaps observed at v1.2 rollout (May 12).
- Semantic search currently more "write-optimized memory" than query-optimized for agents.

## 2. Requirements (v1.5 Goals)

- **Unified Query Experience**: Agents should be able to do natural language semantic search across fleet history without managing embeddings themselves.
- **Performance**: Hot coordination paths stay in Redis; semantic search can be eventually consistent / async mirror.
- **Recency + Relevance**: Built-in temporal boosting (as in current local `recency_factor`).
- **Metadata & Linking**: Return original `correlationId`, `parentCorrelationId`, source, kind, timestamps for chaining.
- **Access Control**: Respect actor_type / tenant_id / visibility where applicable.
- **Auditability**: All searches logged as ACMI events.

## 3. Proposed Contract (First Cut)

### 3.1 Core Abstraction
`acmi_search_semantic(query: string, options?: { limit?: number, since?: string, filters?: object, includeMetadata?: boolean }) → { results: Array<{ relevance: number, summary: string, metadata: object, correlationId: string, link?: string }> }`

### 3.2 Implementation Layers (Recommended)
1. **Agent-facing (MCP + CLI)**: Always text query. Client (or acmi-mcp) handles embedding if needed.
2. **Backend**:
   - Preferred: Hosted vector with server-side embedding (e.g., Upstash with attached model, or Pinecone + embedder).
   - Fallback: Local Chroma + OpenAI (current `query_v2.py` pattern) when running on dev machine.
3. **Dual Write**: Events go to Redis timeline (primary) + vector index (async mirror via sync agent).

### 3.3 Query Features
- Natural language `query`.
- `limit` (default 5-10).
- `since` (time window, e.g., "24h", "7d").
- Optional filters (project, agent_source, kind, thread).
- Built-in recency re-ranking (configurable weight 0.0–1.0).
- Return original ACMI fields + relevance score + optional `link: cid:xxx`.

### 3.4 Embedding Strategy
- **Default Model**: BGE (for cloud parity with current sync agent) or OpenAI text-embedding-3-small (current local).
- **Contract**: Central embedding service or per-client with version pinning.
- **Hybrid Search**: Support keyword + vector (future).

### 3.5 Events & Observability
- Every search emits `acmi_search_semantic` event (kind, correlationId, source=agent:grok, summary in standard format).
- Log query, filters, result count, top correlationIds.
- Support `acmi cat` style chaining from results.

## 4. Open Questions / Recommendations for Phase 3

- Choose primary vector backend for v1.5 (Upstash with embedding model vs self-hosted?).
- Define embedding model contract + versioning.
- How to handle private/sensitive events in semantic index?
- Migration path for existing data.
- Performance SLAs (p95 query latency).
- Integration with Dashboard (search UI in Agent Console?).
- Composio routing tie-in (can semantic search surface relevant tool usage patterns?).

## 5. Next Steps (for task-driver)

- Review with ops-center / bentley / claude-engineer.
- Prototype unified client wrapper (Redis + vector fallback).
- Draft full protocol section for v1.5 spec.
- Test against real recent coordination history (e.g., social pipeline + Ep43 issues).

---

**References** (from recent pulls):
- May 12 Semantic Search v1.2 decisions (memory_palace_v2).
- Current acmi-comms-v1.5 work item (vector component partial).
- Your gems emitted 2026-05-28 04:04–04:08Z.
- Morning sync rollup (this session).

This is a living first-cut. Feedback welcome.
