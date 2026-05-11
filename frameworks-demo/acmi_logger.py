"""acmi_logger.py — map Lobster Trap `_lobstertrap` metadata → ACMI Comms v1.1 events.

When Lobster Trap proxies an OpenAI-compatible chat-completions call, it embeds
its inspection report on the response body under the `_lobstertrap` key (and on
DENY responses, on the error envelope too). This helper consumes that block and
ZADDs one event per decision onto:

    acmi:thread:lobstertrap-decisions:timeline

Event shape (Comms v1.1):

    {
      "ts": <ms>,
      "source": "lobstertrap",
      "kind": "lobstertrap-decision",
      "correlationId": <cid>,
      "summary": "<verdict> · <agent_source> · <declared> → <detected>",
      "payload": {
        "decision":         "ALLOW" | "DENY" | "HUMAN_REVIEW" | "LOG" | "RATE_LIMIT",
        "declared_intent":  "<from agent _lobstertrap.declared_intent or 'unstated'>",
        "detected_intent":  "<intent_category from DPI>",
        "risk_score":       0.0..1.0,
        "agent_source":     "langchain" | "crewai" | "<other>",
        "timestamp_iso":    "2026-05-11T..Z",
        "request_id":       "<LT request_id>",
        "policy_name":      "<LT policy_name>",
        "rule_name":        "<which rule fired, if any>",
        "mismatches":       [...],
        "ingress_action":   "<ALLOW|DENY|...>",
        "egress_action":    "<ALLOW|DENY|...>",
        "target_paths":     [...],
        "target_domains":   [...]
      }
    }

This is the exact contract the (in-flight) governance-dashboard sub-agent reads
from — keep the keys stable.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

import requests

ACMI_URL = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
ACMI_TOK = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")

LOBSTERTRAP_THREAD = "lobstertrap-decisions"
LOBSTERTRAP_THREAD_KEY = f"acmi:thread:{LOBSTERTRAP_THREAD}:timeline"


def _redis(*cmd) -> Any:
    """Direct Upstash REST call. Raises on transport or upstream error."""
    if not ACMI_URL or not ACMI_TOK:
        raise RuntimeError(
            "ACMI not configured: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN"
        )
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
        raise RuntimeError(f"upstash error: {j['error']}")
    return j["result"]


def _resolve_decision(lt_report: dict) -> str:
    """LT can split ingress/egress actions. Use verdict if present, else worst-of."""
    verdict = lt_report.get("verdict")
    if verdict:
        return str(verdict).upper()

    ingress_action = (lt_report.get("ingress") or {}).get("action", "ALLOW")
    egress_action = (lt_report.get("egress") or {}).get("action", "ALLOW")

    # Worst-of precedence (matches Veea rubric severity ordering)
    precedence = ["DENY", "HUMAN_REVIEW", "QUARANTINE", "RATE_LIMIT", "LOG", "ALLOW"]
    for tier in precedence:
        if ingress_action == tier or egress_action == tier:
            return tier
    return "ALLOW"


def _resolve_rule_name(lt_report: dict) -> Optional[str]:
    """Pull the rule_name that fired from whichever side recorded it."""
    for side in ("ingress", "egress"):
        block = lt_report.get(side) or {}
        rule = block.get("rule_name") or block.get("matched_rule")
        if rule:
            return rule
    return None


def log_lobstertrap_decision(
    lt_report: dict,
    *,
    agent_source: str,
    correlation_id: Optional[str] = None,
    extra_payload: Optional[dict] = None,
) -> dict:
    """ZADD one Comms v1.1 event for this LT decision. Returns the event dict written.

    Args:
        lt_report:       the `_lobstertrap` block from an LT response (or error).
        agent_source:    "langchain" / "crewai" / etc — the agent making the call.
        correlation_id:  optional cid; defaults to LT request_id, then a timestamp.
        extra_payload:   any extra metadata to inline into payload (best-effort).

    Never raises on missing fields — degrades to empty values so we never lose
    an event over a malformed report. Will raise on transport errors so callers
    can surface them.
    """
    if not isinstance(lt_report, dict):
        lt_report = {}

    ts = int(time.time() * 1000)
    timestamp_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    request_id = lt_report.get("request_id") or f"lt-{ts}"
    cid = correlation_id or request_id

    decision = _resolve_decision(lt_report)

    ingress = lt_report.get("ingress") or {}
    egress = lt_report.get("egress") or {}
    declared = ingress.get("declared") or {}
    detected = ingress.get("detected") or {}
    egress_detected = egress.get("detected") or {}

    declared_intent = declared.get("declared_intent") or "unstated"
    detected_intent = detected.get("intent_category") or "general"

    # Risk score: prefer ingress, fall back to egress if ingress missing
    risk_score = detected.get("risk_score")
    if risk_score is None:
        risk_score = egress_detected.get("risk_score", 0.0)
    try:
        risk_score = float(risk_score)
    except (TypeError, ValueError):
        risk_score = 0.0

    rule_name = _resolve_rule_name(lt_report)

    payload = {
        "decision": decision,
        "declared_intent": declared_intent,
        "detected_intent": detected_intent,
        "risk_score": risk_score,
        "agent_source": agent_source,
        "timestamp_iso": timestamp_iso,
        "request_id": request_id,
        "policy_name": lt_report.get("policy_name", "acmi-default"),
        "rule_name": rule_name,
        "mismatches": ingress.get("mismatches", []) or [],
        "ingress_action": ingress.get("action", "ALLOW"),
        "egress_action": egress.get("action", "ALLOW"),
        "target_paths": detected.get("target_paths", []) or [],
        "target_domains": detected.get("target_domains", []) or [],
    }
    if extra_payload:
        # extra_payload never overwrites core fields — they're contract-stable
        for k, v in extra_payload.items():
            payload.setdefault(k, v)

    summary = (
        f"{decision} · {agent_source} · "
        f"{declared_intent} → {detected_intent} · risk={risk_score:.2f}"
    )
    if rule_name:
        summary += f" · rule={rule_name}"

    event = {
        "ts": ts,
        "source": "lobstertrap",
        "kind": "lobstertrap-decision",
        "correlationId": cid,
        "summary": summary,
        "payload": payload,
    }

    _redis("ZADD", LOBSTERTRAP_THREAD_KEY, str(ts), json.dumps(event))
    return event


def extract_lt_report_from_response(response_obj: Any) -> Optional[dict]:
    """Best-effort extractor for the `_lobstertrap` block off any client return type.

    Handles:
      - raw dicts (requests.Response().json())
      - pydantic models (openai.ChatCompletion, langchain AIMessage)
      - objects with a `.model_extra` / `.additional_kwargs` / `.response_metadata` carrier

    Returns None if no LT block is present.
    """
    if response_obj is None:
        return None

    # Direct dict
    if isinstance(response_obj, dict):
        return response_obj.get("_lobstertrap")

    # Pydantic v2 model_extra
    me = getattr(response_obj, "model_extra", None)
    if isinstance(me, dict) and "_lobstertrap" in me:
        return me["_lobstertrap"]

    # LangChain AIMessage carries extras on additional_kwargs / response_metadata
    for attr in ("additional_kwargs", "response_metadata"):
        carrier = getattr(response_obj, attr, None)
        if isinstance(carrier, dict) and "_lobstertrap" in carrier:
            return carrier["_lobstertrap"]

    # Last-resort: a `_lobstertrap` attribute
    direct = getattr(response_obj, "_lobstertrap", None)
    if isinstance(direct, dict):
        return direct

    return None


def log_if_present(
    response_obj: Any,
    *,
    agent_source: str,
    correlation_id: Optional[str] = None,
) -> Optional[dict]:
    """Convenience: extract + log in one call. Returns the event if logged, else None.

    Use this as a one-liner hook after every LLM call:

        result = llm.invoke(messages)
        acmi_logger.log_if_present(result, agent_source="langchain", correlation_id=cid)
    """
    report = extract_lt_report_from_response(response_obj)
    if report is None:
        return None
    return log_lobstertrap_decision(
        report, agent_source=agent_source, correlation_id=correlation_id
    )
