# ACMI v1.1 — Bi-temporal, History, Rollup

**Status:** draft, designed for backward compatibility with v1.0
**Date:** 2026-04-25
**Implements:** preprint section 7 limitations #2, #3, and the implicit identity-history gap
**Tracker items:** imp-1, imp-2, imp-7

## What v1.1 adds

| Concern | v1.0 | v1.1 |
|---|---|---|
| When did this fact become true? | unknown — only ingestion ts | optional `valid_from` / `valid_to` |
| What was true on date X? | application-side filter | helper `as_of()` reads timeline + applies validity window |
| What was the agent like 3 weeks ago? | unknowable — profile overwritten | new key `acmi:agent:<id>:profile_history` (ZSET, append-only) |
| Long timeline blowing context? | manual roll-up or accept | new key `acmi:{ns}:{id}:timeline:archive` + `:summary` |

**Backward compatibility:** every change is additive. v1.0 events without `valid_*` keep working — they're treated as "valid since `ts`, no end". v1.0 agents without `profile_history` keep working — the helper returns the current profile. v1.0 timelines without archive keep working — read API only checks archive if explicitly asked.

---

## 1. Bi-temporal event envelope (imp-1)

The v1.0 event envelope:

```json
{ "ts": 1745280000000, "source": "...", "kind": "...", "summary": "...", "payload": {...} }
```

v1.1 adds three optional fields:

```json
{
  "ts": 1745280000000,            // ingestion time (unchanged, REQUIRED)
  "tx_time": 1745280000000,        // alias for ts; explicit when authoring with bi-temporal intent
  "valid_from": 1745280000000,     // OPTIONAL: when did this fact become true in the world
  "valid_to": null,                // OPTIONAL: when did it stop being true (null = ongoing)
  "source": "...",
  "kind": "...",
  "summary": "...",
  "payload": {...}
}
```

**Invariants:**
- If `valid_from` is omitted, it defaults to `ts` (legacy events: ingestion = becoming-true).
- If `valid_to` is omitted, the fact is treated as ongoing.
- `valid_from <= valid_to` if both present.
- `ts` is still the ZSET score — chronological-by-ingestion is preserved.

**Query patterns (helper functions, not new keys):**

- `as_of(key, asof_ts)` → returns events where `valid_from <= asof_ts AND (valid_to == null OR valid_to >= asof_ts)`. Requires reading the timeline + filtering — no separate index. Cost: O(N) per query, fine up to N≈10K (use rollups beyond that).
- `valid_now(key)` → `as_of(key, Date.now())`.
- `tx_history(key, since, until)` → unchanged ZRANGEBYSCORE (still ingestion-time ordered).

For high-frequency `as_of` queries, an optional auxiliary key `acmi:{ns}:{id}:timeline:valid` can be maintained — same events, scored by `valid_from`. Defer until there's a measurable need.

---

## 2. Agent profile history (imp-7)

**v1.0 problem:** `acmi:agent:<id>:profile` is overwritten in place. If Bentley evolves (model swap, persona update), there's no record. Want: query "what was Bentley like on 2026-03-15?"

**v1.1 schema:**

| Key | Type | Purpose |
|---|---|---|
| `acmi:agent:<id>:profile` | string (JSON) | UNCHANGED. Always reflects the current active version. |
| `acmi:agent:<id>:profile_history` | ZSET | NEW. Score = `valid_from` (ms). Member = JSON of historical profile snapshot with `{valid_from, valid_to, version, profile}`. |
| `acmi:agent:<id>:signals.active_profile_version` | int | NEW. Tracks which version is currently active. |

**Update protocol:**

When an agent's profile changes:
1. Read current `acmi:agent:<id>:profile` (the about-to-be-superseded version)
2. Write it to `profile_history` with `valid_from = previous active_profile_ts`, `valid_to = now`
3. Overwrite `acmi:agent:<id>:profile` with new version
4. Update `signals.active_profile_version += 1`, `signals.active_profile_ts = now`

**Query:**
- `profile_at(agent_id, ts)` → ZRANGEBYSCORE on profile_history where `valid_from <= ts AND valid_to >= ts`. If none match (i.e. `ts` is in the active version), return current profile.
- `profile_history(agent_id)` → full ZRANGE.

**Migration (one-time):**
- For each agent in `acmi:agent:list`, take current profile, ZADD to `profile_history` with `valid_from = onboarding_ts || now`, `valid_to = now` (treat as "first version, becoming superseded right now").
- This gives a baseline. Future updates extend the history.

---

## 3. Timeline archival + summary (imp-2)

**v1.0 problem:** long-lived entities accrue unbounded ZSET. Customer with 5 years of touchpoints = 100K+ events; can't fit in context, expensive to query.

**v1.1 schema:**

| Key | Type | Purpose |
|---|---|---|
| `acmi:{ns}:{id}:timeline` | ZSET | UNCHANGED. Holds **recent** events only (sliding window). |
| `acmi:{ns}:{id}:timeline:archive` | ZSET | NEW. Older events moved here. Same shape as timeline. |
| `acmi:{ns}:{id}:summary` | LIST (JSON entries) | NEW. LLM-synthesized rollups: `{rollup_id, range_start_ts, range_end_ts, event_count, summary, source_kinds}`. Newest first (LPUSH). |

**Archival trigger:**
- Threshold: configurable per namespace. Default: when `ZCARD timeline > 1000`, archive the bottom 500.
- Process: `ZRANGEBYSCORE timeline -inf <cutoff_ts>` → ZADD to archive → ZREMRANGEBYSCORE on timeline.
- Optionally: feed the archived events to an LLM, get a 200-word summary, LPUSH to `summary` list.

**Query patterns:**
- `timeline(key)` → ZRANGE on `:timeline` only (recent events, fast).
- `timeline_full(key)` → ZRANGE on `:timeline` + `:timeline:archive` merged. Use sparingly.
- `timeline_summary(key)` → LRANGE on `:summary` for rollups. Cheap context for "what's happened over time" without loading every event.

**Rollup invariants:**
- Rollups never lose data — original events stay in `:timeline:archive` permanently.
- A rollup's `[range_start_ts, range_end_ts]` must be contiguous to the previous rollup (no gaps).
- Rollups can be regenerated (the source events are preserved).

---

## 4. CLI additions

```
acmi profile-update <ns> <id> '<json>'   # auto-snapshots prev profile to history
acmi profile-at <ns> <id> <ts>           # bi-temporal lookup
acmi profile-history <ns> <id>           # full history
acmi event-bi <ns> <id> <source> '<summary>' --valid-from <ms> --valid-to <ms>
acmi as-of <ns> <id> <ts>                # filter timeline events valid at ts
acmi archive <ns> <id> [--threshold N]   # archive bottom of timeline
acmi summary <ns> <id>                   # show summary list
```

These are additive to v1.0's 4 commands (`profile`, `event`, `signal`, `get`).

## 5. Helper module

`~/clawd/tools/acmi-sync/acmi-temporal.mjs` — single file, Upstash REST direct (same pattern as `quota-monitor.mjs`). Exports:

```
events.write_bitemporal(key, source, kind, summary, payload, validFrom, validTo)
events.as_of(key, asof_ts)
agent.update_profile(agent_id, new_profile)
agent.profile_at(agent_id, ts)
timeline.archive(key, opts)
timeline.summarize(key, llm_call_fn)  // takes a function for LLM call to keep this provider-agnostic
```

## 6. Migration plan

**Phase 1 (now):** ship spec + helper module + CLI additions. No data migration. New events can use bi-temporal fields. Old events keep working.

**Phase 2 (operator-gated):** run a one-time `migrate_agent_history` for each agent in `acmi:agent:list`. Builds the baseline `profile_history` ZSET. Idempotent.

**Phase 3 (per-entity, on demand):** when a specific timeline grows past threshold, run `archive` to move cold events. Optional summarization.

## 7. Confidence + risks

- **imp-1 confidence: HIGH.** Pure schema-additive; helper is ~80 lines.
- **imp-7 confidence: HIGH.** Append-only profile history is a well-known pattern; migration is straightforward.
- **imp-2 confidence: MEDIUM.** Archival + summarization is more code (~200 lines) and depends on a model call for the summary step. Defer summarization until imp-1 + imp-7 are smoke-tested.

**Biggest risk:** if `profile_history` migration runs twice, you get duplicate baseline entries. Mitigation: idempotency check before ZADD.
