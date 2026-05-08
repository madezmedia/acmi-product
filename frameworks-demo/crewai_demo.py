"""crewai_demo.py — ACMI + CrewAI + MI300X (Track 1: AMD Hackathon)

Demonstrates a CrewAI 3-agent crew (researcher / synthesizer / publisher)
running against:
  - vLLM serving Qwen/Qwen2.5-7B-Instruct on AMD Instinct MI300X
  - ACMI memory backbone (events written via crewai-tagged tools)

Judge proof: this script imports `from crewai import Agent, Task, Crew`,
constructs three Agents sharing the same LLM and ACMI tools, and runs a
Crew. Each agent's tool calls produce ACMI events with source="crewai".

Run:
  source ~/.env
  python crewai_demo.py "Brief on three-key ACMI protocol"
"""
import os
import sys
import json
import time
import requests
from typing import Optional

from crewai import Agent, Task, Crew, Process
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

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
        raise RuntimeError(f"upstash: {j['error']}")
    return j["result"]


# ACMI tool wrapped for CrewAI
class AcmiEventInput(BaseModel):
    thread: str = Field(..., description="ACMI thread name (e.g. 'demo-amd-chain')")
    kind: str = Field(..., description="event kind (e.g. 'step-done', 'research-output')")
    summary: str = Field(..., description="short human-readable summary")
    correlation_id: Optional[str] = Field(None, description="camelCase cid for chain tracking")


class AcmiEventTool(BaseTool):
    name: str = "acmi_event"
    description: str = (
        "Log an event to an ACMI thread timeline. Use this to record what your agent is doing "
        "so other agents and operators can see the progression. Always tag with kind + summary."
    )
    args_schema: type = AcmiEventInput

    def _run(self, thread: str, kind: str, summary: str, correlation_id: Optional[str] = None) -> str:
        ts = int(time.time() * 1000)
        cid = correlation_id or f"crewaiDemo-{ts}"
        event = {
            "ts": ts,
            "source": "crewai",
            "kind": kind,
            "correlationId": cid,
            "summary": summary,
            "payload": {"framework": "crewai", "model": "Qwen/Qwen2.5-7B-Instruct", "endpoint": "vllm@MI300X"},
        }
        key = f"acmi:thread:{thread}:timeline"
        _redis("ZADD", key, str(ts), json.dumps(event))
        return f"event logged to {key} cid={cid}"


# Configure LLM env for crewai (uses LiteLLM under the hood)
os.environ["OPENAI_API_BASE"] = "http://127.0.0.1:8000/v1"
os.environ["OPENAI_API_KEY"] = "not-required"
os.environ.setdefault("OPENAI_MODEL_NAME", "openai/Qwen/Qwen2.5-7B-Instruct")

LLM_MODEL = "hosted_vllm/Qwen/Qwen2.5-7B-Instruct"

acmi_tool = AcmiEventTool()

# Define 3 agents — researcher / synthesizer / publisher
researcher = Agent(
    role="Researcher",
    goal="Identify 3-5 specific points about the topic and log each one to ACMI.",
    backstory="You are running inside a CrewAI framework on AMD MI300X. You produce sourced research output.",
    tools=[acmi_tool],
    llm=LLM_MODEL,
    verbose=True,
    allow_delegation=False,
    max_iter=4,
)

synthesizer = Agent(
    role="Synthesizer",
    goal="Take research notes and weave them into one coherent thesis paragraph.",
    backstory="You synthesize multi-point research into clear prose. Concise. Log result to ACMI.",
    tools=[acmi_tool],
    llm=LLM_MODEL,
    verbose=True,
    allow_delegation=False,
    max_iter=3,
)

publisher = Agent(
    role="Publisher",
    goal="Take a synthesis paragraph and produce a final brief: headline + 2-3 sentence body + call-to-action. Log final to ACMI.",
    backstory="You publish polished briefs. Punchy. Log to ACMI when done.",
    tools=[acmi_tool],
    llm=LLM_MODEL,
    verbose=True,
    allow_delegation=False,
    max_iter=3,
)


def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "Brief on the three-key ACMI protocol"
    cid = f"crewaiDemo-{int(time.time()*1000)}"
    print(f"[crewai_demo] topic: {topic}")
    print(f"[crewai_demo] LLM: vllm@MI300X * Qwen/Qwen2.5-7B-Instruct")
    print(f"[crewai_demo] crew: researcher -> synthesizer -> publisher")
    print(f"[crewai_demo] cid: {cid}")

    research_task = Task(
        description=(
            f"Research this topic: {topic}. Identify 3-5 specific points in 1-2 sentences each. "
            f"Use the acmi_event tool with thread='demo-amd-chain', kind='research-output', "
            f"correlation_id='{cid}' to log a summary."
        ),
        expected_output="A numbered list of 3-5 research points + a one-sentence thesis.",
        agent=researcher,
    )
    synthesis_task = Task(
        description=(
            f"Take the research output above and weave it into ONE coherent paragraph (3-5 sentences). "
            f"End with one sentence on what should happen next. "
            f"Log result via acmi_event(thread='demo-amd-chain', kind='synthesis-output', correlation_id='{cid}')."
        ),
        expected_output="A paragraph of 3-5 sentences ending with a forward-looking sentence.",
        agent=synthesizer,
        context=[research_task],
    )
    publish_task = Task(
        description=(
            f"Take the synthesis above and produce a final brief: headline + 2-3 sentences + call-to-action. "
            f"Markdown ok. Log via acmi_event(thread='demo-amd-chain', kind='publish-output', correlation_id='{cid}')."
        ),
        expected_output="A markdown brief: ### Headline + 2-3 sentence body + 1-line call-to-action.",
        agent=publisher,
        context=[synthesis_task],
    )

    crew = Crew(
        agents=[researcher, synthesizer, publisher],
        tasks=[research_task, synthesis_task, publish_task],
        process=Process.sequential,
        verbose=True,
    )

    # Bootstrap event
    acmi_tool._run("demo-amd-chain", "framework-task-start", f"[crewai] crew launching * topic: {topic[:100]}", correlation_id=cid)

    result = crew.kickoff()
    print(f"\n[crewai_demo] final brief:\n{result.raw[:800] if hasattr(result, 'raw') else str(result)[:800]}")

    acmi_tool._run("demo-amd-chain", "framework-task-complete", f"[crewai] crew complete * cid={cid}", correlation_id=cid)
    print(f"\n[crewai_demo] done * cid={cid}")


if __name__ == "__main__":
    main()
