# Veea Lobster Trap × ACMI Integration

**TechEx Hackathon · Track 1 · Agent Security & AI Governance**

This document describes how ACMI's framework demos (LangChain + CrewAI) integrate with [Veea's Lobster Trap](https://github.com/veeainc/lobstertrap), a Deep Prompt Inspection (DPI) reverse proxy for LLM inference.

> Lobster Trap sits between AI agents and any OpenAI-compatible LLM backend, inspecting every prompt and every output using regex-based DPI with programmable firewall rules. **No LLM calls are used for inspection** — classification runs in sub-millisecond time using compiled regex patterns.

ACMI provides the **audit trail** layer: every policy decision LT makes — ALLOW, DENY, HUMAN_REVIEW, LOG, RATE_LIMIT — is mirrored as a Comms v1.1 event on `acmi:thread:lobstertrap-decisions:timeline`. Governance dashboards then read that timeline directly.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  langchain_demo.py    crewai_demo.py     <— ACMI-instrumented agents       │
│         │                  │             (declared_intent in _lobstertrap) │
│         └──────────────────┴──────┐                                        │
│                                    ▼                                       │
│                  ┌──────────────────────────────┐                          │
│                  │  Lobster Trap :7777          │                          │
│                  │  • ingress DPI               │                          │
│                  │  • policy eval (YAML)        │                          │
│                  │  • egress DPI                │                          │
│                  │  • _lobstertrap report       │                          │
│                  └──────────────┬───────────────┘                          │
│                                 │                                          │
│                                 ▼                                          │
│                  ┌──────────────────────────────┐                          │
│                  │  vLLM @ :8000 (MI300X)       │                          │
│                  │  Qwen2.5-7B-Instruct         │                          │
│                  └──────────────────────────────┘                          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ acmi_logger.log_if_present(...)
                                  ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  ACMI · Upstash Redis REST                                  │
        │  ZSET  acmi:thread:lobstertrap-decisions:timeline           │
        │                                                             │
        │  { kind: "lobstertrap-decision",                            │
        │    payload: { decision, declared_intent, detected_intent,   │
        │               risk_score, agent_source, timestamp_iso, ... }│
        │  }                                                          │
        └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                  governance-dashboard.html (separate sub-agent lane)
```

---

## Files

| File | Purpose |
|---|---|
| `lobstertrap-policy.yaml` | The ACMI default DPI policy — demonstrates ALLOW/DENY/HUMAN_REVIEW/LOG/RATE_LIMIT |
| `acmi_logger.py` | Helper: maps `_lobstertrap` metadata → ACMI Comms v1.1 event |
| `lobstertrap_smoke.py` | 5-prompt acceptance suite (2 ALLOW, 1 credential-leak DENY, 1 prompt-injection DENY, 1 HUMAN_REVIEW) |
| `langchain_demo.py` | Modified to honor `LOBSTERTRAP_URL` env var + hook acmi_logger on every AIMessage |
| `crewai_demo.py` | Modified to route LiteLLM through LT + drain LT's audit feed to ACMI after each kickoff |

---

## Start the Lobster Trap proxy

```bash
# 1. Build LT (Go 1.22+ required)
git clone https://github.com/veeainc/lobstertrap.git
cd lobstertrap
make build

# 2. Start LT pointed at your existing LLM backend, with the ACMI policy
./lobstertrap serve \
  --policy /path/to/acmi-product/frameworks-demo/lobstertrap-policy.yaml \
  --listen :7777 \
  --backend http://127.0.0.1:8000        # vLLM on MI300X (or any OpenAI-compat URL)
```

The real-time inspection dashboard is at <http://localhost:7777/_lobstertrap/>.

---

## Point the demos at Lobster Trap

```bash
cd /path/to/acmi-product/frameworks-demo
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# ACMI bus
export UPSTASH_REDIS_REST_URL="https://<your-instance>.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="<your-token>"

# Route all LLM traffic through LT
export LOBSTERTRAP_URL=http://localhost:7777/v1
export LOBSTERTRAP_MODEL=Qwen/Qwen2.5-7B-Instruct      # or whatever your backend serves

# Run the demos — neither script knows it's behind a DPI proxy
python langchain_demo.py "Research the three-key ACMI protocol"
python crewai_demo.py "Brief on three-key ACMI protocol"
```

Without `LOBSTERTRAP_URL` set, both demos talk directly to the vLLM endpoint (legacy behavior, unchanged).

---

## Run the acceptance suite

```bash
export LOBSTERTRAP_URL=http://localhost:7777/v1
python lobstertrap_smoke.py
```

Expected output:

```
[lt-smoke] running 5 cases ...

  [PASS] 01_benign_smalltalk          expected ALLOW   got ALLOW
  [PASS] 02_benign_code_help          expected ALLOW   got LOG       (LOG accepted as alt)
  [PASS] 03_credential_exfiltration   expected DENY    got DENY      rule=deny_sensitive_paths
  [PASS] 04_prompt_injection          expected DENY    got DENY      rule=deny_prompt_injection
  [PASS] 05_high_risk_external_write  expected HUMAN_REVIEW  got HUMAN_REVIEW

[lt-smoke] 5/5 cases passed
[lt-smoke] audit thread: acmi:thread:lobstertrap-decisions:timeline
```

Exit code is 0 on full pass, 1 otherwise.

Every case — pass or fail — ZADDs a `lobstertrap-decision` event to the ACMI audit thread plus a `lobstertrap-smoke-rollup` event with the full results.

---

## Event contract

Governance dashboards (in-flight, separate sub-agent lane) read from:

```
acmi:thread:lobstertrap-decisions:timeline
```

Every event uses the Comms v1.1 envelope:

```json
{
  "ts": 1778619543210,
  "source": "lobstertrap",
  "kind": "lobstertrap-decision",
  "correlationId": "lt-1778619543210",
  "summary": "DENY · langchain · file_io → file_io · risk=0.92 · rule=deny_sensitive_paths",
  "payload": {
    "decision":         "DENY",
    "declared_intent":  "file_io",
    "detected_intent":  "file_io",
    "risk_score":       0.92,
    "agent_source":     "langchain",
    "timestamp_iso":    "2026-05-11T18:32:23.210Z",
    "request_id":       "req-9381",
    "policy_name":      "acmi-default",
    "rule_name":        "deny_sensitive_paths",
    "mismatches":       [],
    "ingress_action":   "DENY",
    "egress_action":    "ALLOW",
    "target_paths":     ["/etc/shadow"],
    "target_domains":   ["pastebin.com"]
  }
}
```

**No events are dropped silently.** Even when LT returns no `_lobstertrap` block (e.g. proxy misconfiguration), the smoke harness writes a synthetic `NO_LT_REPORT` event so the audit trail stays complete.

---

## Why this is a serious integration

1. **Real policy, not a toy** — 16 ingress rules + 3 egress rules + rate limits + network allowlist + filesystem denylist. Every rule has a priority, conditions, and an action that maps cleanly to a Veea Award rubric category.
2. **Bidirectional metadata** — agents declare `declared_intent` in their `_lobstertrap` request block; LT records mismatches when detected intent diverges. Mismatches surface in the ACMI event's `payload.mismatches`.
3. **Visible audit trail** — every decision is a Comms v1.1 event on a public ACMI thread. Auditors can replay any chain by `correlationId`.
4. **No vendor lock-in** — LT is OpenAI-compatible. The agent code change is one env-var swap. Pull LT out and the demos run direct-to-LLM exactly as before.
5. **Sub-ms inspection** — LT is regex-based, not LLM-based. No "LLM judges LLM" recursive cost. P99 added latency stays below 5 ms on commodity CPU.

---

## See also

- Lobster Trap repo: <https://github.com/veeainc/lobstertrap>
- ACMI ops center (live fleet): <https://acmi-product.vercel.app/ops-center.html>
- TechEx Track 1 / Veea Award: rubric covers governance dashboards + audit replay + agent declared-intent + DPI policy depth
