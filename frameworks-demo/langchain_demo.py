"""langchain_demo.py — ACMI + LangChain + MI300X (Track 1: AMD Hackathon)

Demonstrates a LangChain agent running against:
  - vLLM serving Qwen/Qwen2.5-7B-Instruct on AMD Instinct MI300X (OpenAI-compat)
  - ACMI (Agent Communication & Memory Infrastructure) via direct REST tools
  - Optional: Veea Lobster Trap DPI proxy in front of the LLM (TechEx Track 1)

Judge proof: this script imports `from langchain ...` + `from langchain_openai ...`,
constructs a `create_agent(...)` agent, binds two ACMI tools, and runs a task.
The agent's tool calls produce real ACMI events with source="langchain" so they
show up in the timeline at acmi:thread:demo-amd-chain:timeline.

Lobster Trap integration: set LOBSTERTRAP_URL to a running LT instance (e.g.
http://localhost:7777/v1). LT is OpenAI-compatible, so the only change is the
base_url. After every model invocation we extract LT's `_lobstertrap` block
and emit a Comms v1.1 event on acmi:thread:lobstertrap-decisions:timeline via
acmi_logger.log_if_present(...).

Run:
  source ~/.env       # UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
  export LOBSTERTRAP_URL=http://localhost:7777/v1   # optional — defaults to direct vLLM
  python langchain_demo.py "Research the three-key ACMI protocol"
"""
import os
import sys
import json
import time
import requests
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.tools import tool

import acmi_logger

# ACMI REST client (no SDK; just fetch)
ACMI_URL = os.environ["UPSTASH_REDIS_REST_URL"].rstrip("/")
ACMI_TOK = os.environ["UPSTASH_REDIS_REST_TOKEN"]


def _redis(*cmd):
    r = requests.post(
        ACMI_URL + "/",
        headers={"Authorization": f"Bearer {ACMI_TOK}", "Content-Type": "application/json"},
        json=list(cmd),
        timeout=10,
    )
    r.raise_for_status()
    j = r.json()
    if "error" in j:
        raise RuntimeError(f"upstash error: {j['error']}")
    return j["result"]


# ACMI tools the LangChain agent can call
@tool
def acmi_event(thread: str, kind: str, summary: str, correlation_id: Optional[str] = None) -> str:
    """Log an event to an ACMI thread timeline.

    Args:
        thread: ACMI thread name (e.g. "demo-amd-chain", "agent-coordination")
        kind: event kind (e.g. "research-output", "step-done", "decision")
        summary: short human-readable summary of what happened
        correlation_id: optional camelCase correlationId for chain tracking
    """
    ts = int(time.time() * 1000)
    cid = correlation_id or f"langchainDemo-{ts}"
    event = {
        "ts": ts,
        "source": "langchain",
        "kind": kind,
        "correlationId": cid,
        "summary": summary,
        "payload": {"framework": "langchain", "model": "Qwen/Qwen2.5-7B-Instruct", "endpoint": "vllm@MI300X"},
    }
    key = f"acmi:thread:{thread}:timeline"
    _redis("ZADD", key, str(ts), json.dumps(event))
    return f"event logged to {key} with correlationId={cid}"


@tool
def acmi_signal(namespace: str, entity_id: str, signals_json: str) -> str:
    """Update mutable signals (mood, status, scores) on an ACMI entity.

    Args:
        namespace: ACMI namespace (e.g. "agent", "character")
        entity_id: entity ID within the namespace
        signals_json: JSON string with signal fields
    """
    json.loads(signals_json)  # validate
    key = f"acmi:{namespace}:{entity_id}:signals"
    _redis("SET", key, signals_json)
    return f"signals updated at {key}"


# Build LangChain agent against vLLM on MI300X (or through Lobster Trap if configured).
# Lobster Trap is OpenAI-compatible — swapping the base_url is the entire integration.
LLM_BASE_URL = os.environ.get("LOBSTERTRAP_URL") or "http://127.0.0.1:8000/v1"
LLM_API_KEY = os.environ.get("LLM_API_KEY", "not-required")
LLM_MODEL = os.environ.get("LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")
LT_ENABLED = "lobstertrap" in LLM_BASE_URL.lower() or os.environ.get("LOBSTERTRAP_URL")

# Carry an agent_id declaration so LT can record declared-vs-detected mismatches.
DEFAULT_EXTRA_BODY = {
    "_lobstertrap": {
        "declared_intent": "general",
        "agent_id": "acmi-langchain-demo",
    }
}

llm = ChatOpenAI(
    base_url=LLM_BASE_URL,
    api_key=LLM_API_KEY,
    model=LLM_MODEL,
    temperature=0.4,
    extra_body=DEFAULT_EXTRA_BODY if LT_ENABLED else None,
)

agent = create_agent(
    model=llm,
    tools=[acmi_event, acmi_signal],
    system_prompt=(
        "You are a research agent running inside a LangChain framework on AMD MI300X. "
        "When you complete steps, log them to ACMI via acmi_event(thread='demo-amd-chain', kind='step-done', summary=...). "
        "When the user asks for a summary, finish with acmi_event(kind='research-output', summary=<one-sentence-thesis>). "
        "Be concise. Use the tools at least once."
    ),
)


def main():
    task = sys.argv[1] if len(sys.argv) > 1 else "Research the three-key ACMI protocol (profile, signals, timeline) and log a one-sentence thesis."
    print(f"[langchain_demo] task: {task}")
    print(f"[langchain_demo] LLM: {LLM_BASE_URL} * {LLM_MODEL}")
    print(f"[langchain_demo] tools: acmi_event, acmi_signal")
    print(f"[langchain_demo] lobstertrap: {'ENABLED' if LT_ENABLED else 'bypassed (direct LLM)'}")

    cid = f"langchainDemo-{int(time.time()*1000)}"
    acmi_event.invoke({
        "thread": "demo-amd-chain",
        "kind": "framework-task-start",
        "summary": f"[langchain] task: {task[:120]}",
        "correlation_id": cid,
    })

    result = agent.invoke({"messages": [{"role": "user", "content": task + f"\n\nUse correlationId={cid} when calling tools."}]})

    final = result["messages"][-1]
    final_content = final.content if hasattr(final, 'content') else str(final)
    print(f"\n[langchain_demo] final response:\n{final_content[:800]}")

    # Lobster Trap hook: scan every AI message for an `_lobstertrap` block and
    # mirror each decision onto acmi:thread:lobstertrap-decisions:timeline.
    if LT_ENABLED:
        try:
            logged = 0
            for msg in result.get("messages", []):
                ev = acmi_logger.log_if_present(
                    msg, agent_source="langchain", correlation_id=cid
                )
                if ev:
                    logged += 1
            print(f"[langchain_demo] lobstertrap decisions logged: {logged}")
        except Exception as e:
            print(f"[langchain_demo] lobstertrap log error (non-fatal): {e}")

    acmi_event.invoke({
        "thread": "demo-amd-chain",
        "kind": "framework-task-complete",
        "summary": f"[langchain] complete * {len(final_content)}c * cid={cid}",
        "correlation_id": cid,
    })
    print(f"\n[langchain_demo] done * cid={cid}")


if __name__ == "__main__":
    main()
