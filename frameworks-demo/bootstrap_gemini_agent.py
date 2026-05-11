"""bootstrap_gemini_agent.py — one-shot ACMI seed for the Gemini synthesizer.

Idempotent. Writes the standard ACMI three-key contract for the new agent:
  acmi:agent:gemini-synth:profile   (JSON, immutable identity)
  acmi:agent:gemini-synth:signals   (JSON, mutable state)
  acmi:agent:gemini-synth:timeline  (ZSET, append-only; touched with one boot event)

Run once before the first `python gemini_demo.py` invocation. Safe to re-run.
"""
import json
import os
import time

import requests

ACMI_URL = os.environ["UPSTASH_REDIS_REST_URL"].rstrip("/")
ACMI_TOK = os.environ["UPSTASH_REDIS_REST_TOKEN"]

AGENT_ID = "gemini-synth"
NS_PREFIX = f"acmi:agent:{AGENT_ID}"


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


def main():
    profile = {
        "id": AGENT_ID,
        "displayName": "Gemini Synth",
        "framework": "gemini",
        "model": "gemini-2.5-flash-latest",
        "endpoint": "https://generativelanguage.googleapis.com",
        "role": "synthesizer",
        "chain": "demo-amd-chain",
        "track": "TechEx Track 2 (AI Agents with Google AI Studio)",
        "createdAt": int(time.time() * 1000),
        "description": (
            "Long-context synthesizer in the ACMI three-framework demo chain. "
            "Pairs with langchain (researcher) + crewai (cross-check/publish)."
        ),
        "links": {
            "aiStudio": "https://aistudio.google.com/apikey",
            "ops": "https://acmi-product.vercel.app/ops-center.html",
        },
    }
    signals = {
        "status": "ready",
        "mood": "focused",
        "lastBoot": int(time.time() * 1000),
        "chain": "demo-amd-chain",
        "fallbackModel": "gemini-1.5-flash",
    }

    _redis("SET", f"{NS_PREFIX}:profile", json.dumps(profile))
    _redis("SET", f"{NS_PREFIX}:signals", json.dumps(signals))

    ts = int(time.time() * 1000)
    boot_event = {
        "ts": ts,
        "source": "gemini",
        "kind": "agent-bootstrap",
        "correlationId": f"bootstrap-{ts}",
        "summary": f"[gemini] gemini-synth profile+signals seeded @ {ts}",
        "payload": {
            "framework": "gemini",
            "agent_role": "synthesizer",
            "model": profile["model"],
        },
    }
    _redis(
        "ZADD",
        f"{NS_PREFIX}:timeline",
        str(ts),
        json.dumps(boot_event),
    )

    print(f"[bootstrap] wrote {NS_PREFIX}:profile")
    print(f"[bootstrap] wrote {NS_PREFIX}:signals")
    print(f"[bootstrap] seeded {NS_PREFIX}:timeline with bootstrap event")
    print(f"[bootstrap] agent ready: {AGENT_ID}")


if __name__ == "__main__":
    main()
