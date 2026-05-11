"""gemini_demo.py — ACMI + Google Gemini (Track 2: TechEx AI Agents)

Demonstrates a Gemini-powered synthesizer agent — the THIRD framework in
ACMI's multi-framework chain. Pairs with `langchain_demo.py` (researcher)
and `crewai_demo.py` (cross-check / publish) to prove ACMI is genuinely
framework-agnostic: same three-key contract, three radically different
agent runtimes.

Track 2 — AI Agents with Google AI Studio (Gemini Award, 1st = $5K).

Why Gemini as the synthesizer:
  Gemini's long-context window (>1M tokens on 2.5-flash) is a natural fit
  for synthesizing heterogeneous source events (LangChain + CrewAI output
  + ACMI timeline replay) into one coherent final brief.

Setup:
  1. Get a free API key from https://aistudio.google.com/apikey
     (Google AI Studio gives $300 in Google Cloud credits to new users.)
  2. export GOOGLE_API_KEY="AIza..."
  3. export UPSTASH_REDIS_REST_URL="https://<your-instance>.upstash.io"
  4. export UPSTASH_REDIS_REST_TOKEN="<your-token>"
  5. pip install -r requirements-gemini.txt
  6. python bootstrap_gemini_agent.py   # one-time profile/signals seed
  7. python gemini_demo.py --topic "How should an enterprise audit AI agent actions?"

Event shape mirrors langchain_demo.py / crewai_demo.py:
  source="gemini", payload.framework="gemini", payload.agent_role="synthesizer"
plus real tokens_in / tokens_out / latency_ms from the Gemini API response.

Writes to BOTH:
  - acmi:thread:demo-amd-chain:timeline      (shared chain)
  - acmi:agent:gemini-synth:timeline         (per-agent namespace)
"""
import argparse
import json
import os
import sys
import time
from typing import Optional

import requests

try:
    import google.generativeai as genai
except ImportError:
    sys.stderr.write(
        "[gemini_demo] missing dep: pip install -r requirements-gemini.txt\n"
    )
    raise

ACMI_URL = os.environ["UPSTASH_REDIS_REST_URL"].rstrip("/")
ACMI_TOK = os.environ["UPSTASH_REDIS_REST_TOKEN"]
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    sys.stderr.write(
        "[gemini_demo] GOOGLE_API_KEY not set. Get one free at "
        "https://aistudio.google.com/apikey\n"
    )
    sys.exit(2)

# Per LabLab guidance for low-latency agent workflows. Fallback honors region.
PRIMARY_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-latest")
FALLBACK_MODEL = "gemini-1.5-flash"

CHAIN_THREAD = "demo-amd-chain"
AGENT_NS = "gemini-synth"


def _redis(*cmd):
    r = requests.post(
        ACMI_URL + "/",
        headers={
            "Authorization": f"Bearer {ACMI_TOK}",
            "Content-Type": "application/json",
        },
        json=list(cmd),
        timeout=10,
    )
    r.raise_for_status()
    j = r.json()
    if "error" in j:
        raise RuntimeError(f"upstash: {j['error']}")
    return j["result"]


def _emit(
    kind: str,
    summary: str,
    correlation_id: str,
    *,
    parent_correlation_id: Optional[str] = None,
    extra_payload: Optional[dict] = None,
    model: str = PRIMARY_MODEL,
) -> dict:
    """Write an ACMI event mirroring the langchain/crewai shape, mirror to
    both the shared chain timeline and the per-agent namespace timeline."""
    ts = int(time.time() * 1000)
    payload = {
        "framework": "gemini",
        "agent_role": "synthesizer",
        "model": model,
        "endpoint": "https://generativelanguage.googleapis.com",
    }
    if extra_payload:
        payload.update(extra_payload)
    event = {
        "ts": ts,
        "source": "gemini",
        "kind": kind,
        "correlationId": correlation_id,
        "summary": summary[:180],
        "payload": payload,
    }
    if parent_correlation_id:
        event["parentCorrelationId"] = parent_correlation_id
    blob = json.dumps(event)
    # Triple-write: shared chain + per-agent timeline. Same blob, same score.
    _redis("ZADD", f"acmi:thread:{CHAIN_THREAD}:timeline", str(ts), blob)
    _redis("ZADD", f"acmi:agent:{AGENT_NS}:timeline", str(ts), blob)
    return event


def _fetch_recent_chain(limit: int = 20) -> list:
    """Pull recent events from the shared chain to feed Gemini as context."""
    try:
        raw = _redis(
            "ZRANGE", f"acmi:thread:{CHAIN_THREAD}:timeline", "-{}".format(limit), "-1"
        )
    except Exception:
        return []
    out = []
    for s in raw or []:
        try:
            out.append(json.loads(s))
        except (json.JSONDecodeError, TypeError):
            continue
    return out


def synthesize(topic: str, correlation_id: str, parent_cid: Optional[str]) -> dict:
    """Run Gemini synthesis, return event payload + the response text."""
    genai.configure(api_key=GOOGLE_API_KEY)

    prior = _fetch_recent_chain(limit=20)
    prior_summary = "\n".join(
        f"- [{e.get('source','?')}] {e.get('kind','?')}: {e.get('summary','')}"
        for e in prior[-12:]
    ) or "(no prior chain events)"

    system_prompt = (
        "You are the SYNTHESIZER agent in a 3-framework ACMI chain "
        "(LangChain researcher -> CrewAI cross-check -> YOU). "
        "Combine prior chain events into ONE coherent final brief: "
        "headline, 3-4 sentence body, one call-to-action line. "
        "Be concrete, name the three-key ACMI protocol (profile / signals / "
        "timeline) where relevant, no fluff."
    )
    user_msg = (
        f"Topic: {topic}\n\n"
        f"Prior chain events (most recent {min(len(prior), 12)}):\n{prior_summary}\n\n"
        "Produce the final synthesis brief now."
    )

    model_id = PRIMARY_MODEL
    t0 = time.time()
    try:
        model = genai.GenerativeModel(model_id, system_instruction=system_prompt)
        resp = model.generate_content(user_msg)
    except Exception as e:  # region / model availability fallback
        sys.stderr.write(
            f"[gemini_demo] {PRIMARY_MODEL} failed ({e!r}); falling back to {FALLBACK_MODEL}\n"
        )
        model_id = FALLBACK_MODEL
        model = genai.GenerativeModel(model_id, system_instruction=system_prompt)
        resp = model.generate_content(user_msg)
    latency_ms = int((time.time() - t0) * 1000)

    text = (resp.text or "").strip()
    # Gemini exposes usage_metadata on the response
    um = getattr(resp, "usage_metadata", None)
    tokens_in = int(getattr(um, "prompt_token_count", 0) or 0) if um else 0
    tokens_out = int(getattr(um, "candidates_token_count", 0) or 0) if um else 0

    event = _emit(
        kind="synthesis-output",
        summary=f"[gemini] {text[:180]}",
        correlation_id=correlation_id,
        parent_correlation_id=parent_cid,
        extra_payload={
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "latency_ms": latency_ms,
        },
        model=model_id,
    )
    return {"event": event, "text": text, "model": model_id, "latency_ms": latency_ms}


def main():
    parser = argparse.ArgumentParser(description="ACMI Gemini synthesizer demo")
    parser.add_argument(
        "--topic",
        default="How should an enterprise audit AI agent actions?",
        help="Topic to synthesize",
    )
    parser.add_argument(
        "--parent-cid",
        default=None,
        help="Optional parent correlationId (e.g. from a langchain/crewai run)",
    )
    args = parser.parse_args()

    cid = f"demoChain-{int(time.time()*1000)}"
    print(f"[gemini_demo] topic: {args.topic}")
    print(f"[gemini_demo] model: {PRIMARY_MODEL} (fallback: {FALLBACK_MODEL})")
    print(f"[gemini_demo] cid: {cid}")

    _emit(
        kind="framework-task-start",
        summary=f"[gemini] synthesizer launching * topic: {args.topic[:100]}",
        correlation_id=cid,
        parent_correlation_id=args.parent_cid,
    )

    out = synthesize(args.topic, cid, args.parent_cid)

    print(f"\n[gemini_demo] synthesis:\n{out['text'][:800]}")
    print(
        f"\n[gemini_demo] model={out['model']} latency_ms={out['latency_ms']} "
        f"tokens_in={out['event']['payload']['tokens_in']} "
        f"tokens_out={out['event']['payload']['tokens_out']}"
    )

    _emit(
        kind="framework-task-complete",
        summary=f"[gemini] synthesizer complete * cid={cid}",
        correlation_id=cid,
        parent_correlation_id=args.parent_cid,
        extra_payload={"latency_ms": out["latency_ms"]},
        model=out["model"],
    )
    print(f"\n[gemini_demo] done * cid={cid}")


if __name__ == "__main__":
    main()
