# Fleet Coordination Templates

This directory contains template configurations for coordinating fleets of AI agents using ACMI.

---

## Shared Thread Templates

### Daily Driver Thread

**Thread Key:** `acmi:thread:daily-driver:timeline`

**Purpose:** Coordinated daily execution across multiple agents (research, synthesis, reporting).

**Event Kinds:**
- `daily-driver-start` — Agent signals beginning of daily cycle
- `task-dispatch` — Agent claims a task from the daily queue
- `task-complete` — Agent reports task completion
- `daily-driver-end` — Agent signals end of cycle, hands off to reporting agent

**Example Event:**
```json
{
  "ts": 1745280000000,
  "source": "claude-engineer",
  "kind": "task-dispatch",
  "correlation_id": "daily-2026-05-22-001",
  "summary": "Starting quota monitoring analysis for Q2",
  "payload": {
    "task_id": "quota-monitor-q2",
    "agent": "claude-engineer",
    "priority": "high",
    "estimated_minutes": 15
  }
}
```

---

## Lease Templates

### Inbox Processing Lease

**Lease Key Pattern:** `acmi:inbox:{source}:lease:{message_id}`

**TTL:** 600 seconds (10 minutes)

**Purpose:** Prevent duplicate processing of inbox messages across multiple agents.

**Usage:**
```bash
# Agent A attempts to claim the lease
SET acmi:inbox:gmail:lease:msg-abc123 agent-a NX EX 600

# If successful (returns "OK"), proceed with processing
# If nil (already claimed), skip and pick another message
```

**Renewal Pattern:**
If processing takes longer than expected, renew the lease:
```bash
SET acmi:inbox:gmail:lease:msg-abc123 agent-a XX EX 600
```

---

## Namespace Templates

### Sales Namespace

**Namespace:** `sales`

**Entity IDs:** Customer names or CRM IDs (e.g., `gardine-wilson`, `client-prospect-452`)

**Key Pattern:**
```
acmi:sales:{customer_id}:profile
acmi:sales:{customer_id}:signals
acmi:sales:{customer_id}:timeline
```

**Profile Schema:**
```json
{
  "name": "Customer Name",
  "company": "Company Name",
  "stage": "Discovery | Proposal | Negotiation | Closed | Churned",
  "budget_usd": 50000,
  "primary_contact": "email@company.com",
  "last_contacted_ms": 1745280000000,
  "last_updated_ms": 1745280000000
}
```

**Signals Schema:**
```json
{
  "churn_risk": "low | medium | high",
  "sentiment": "cold | warming | hot",
  "next_best_action": "Follow up Friday with revised proposal.",
  "last_synthesized_ms": 1745280300000,
  "synthesizer_agent": "claude-engineer",
  "cost_ledger": [...]
}
```

---

### Support Namespace

**Namespace:** `support`

**Entity IDs:** Ticket numbers (e.g., `ticket-8922`, `incident-1001`)

**Key Pattern:**
```
acmi:support:{ticket_id}:profile
acmi:support:{ticket_id}:signals
acmi:support:{ticket_id}:timeline
```

**Profile Schema:**
```json
{
  "ticket_id": "8922",
  "customer": "Customer Name",
  "product": "Pump Model X",
  "severity": "low | medium | high | critical",
  "status": "Open | In Progress | Resolved | Escalated",
  "assigned_agent": "agent-name",
  "created_ms": 1745280000000,
  "last_updated_ms": 1745280000000
}
```

**Timeline Event Kinds:**
- `ticket-created`
- `message-inbound` — Customer response
- `message-outbound` — Agent response
- `agent-escalated` — Escalation to higher tier
- `ticket-resolved`
- `ticket-reopened`

---

### Fleet Namespace

**Namespace:** `fleet`

**Entity IDs:** Vehicle IDs (e.g., `truck-04`, `van-12`)

**Key Pattern:**
```
acmi:fleet:{vehicle_id}:profile
acmi:fleet:{vehicle_id}:signals
acmi:fleet:{vehicle_id}:timeline
```

**Profile Schema:**
```json
{
  "vehicle_id": "truck-04",
  "type": "Pump Truck | Van",
  "driver": "Driver Name",
  "status": "Available | On Route | Maintenance",
  "location": "Latitude, Longitude",
  "current_job_id": "job-1234",
  "last_updated_ms": 1745280000000
}
```

**Timeline Event Kinds:**
- `vehicle-dispatched`
- `location-update`
- `job-started`
- `job-completed`
- `maintenance-scheduled`
- `fuel-alert`

---

## Handoff Templates

### Research → Synthesis Handoff

**Thread:** `acmi:thread:research-synthesis:timeline`

**Pattern:**
```json
// Research agent completes work
{
  "ts": 1745280000000,
  "source": "research-agent",
  "kind": "handoff-request",
  "correlation_id": "research-2026-05-22-001",
  "summary": "Research complete. Ready for synthesis.",
  "payload": {
    "from": "research-agent",
    "to": "synthesis-agent",
    "task_id": "research-2026-05-22-001",
    "research_findings_key": "acmi:work:research-001:profile",
    "brief": "Analyze quota monitoring data and prepare executive summary"
  }
}

// Synthesis agent acknowledges
{
  "ts": 1745280300000,
  "source": "synthesis-agent",
  "kind": "handoff-ack",
  "correlation_id": "research-2026-05-22-001",
  "summary": "Handoff acknowledged. Beginning synthesis.",
  "payload": {
    "acknowledged_by": "synthesis-agent",
    "estimated_completion_ms": 1745281800000
  }
}

// Synthesis agent completes
{
  "ts": 1745281800000,
  "source": "synthesis-agent",
  "kind": "done",
  "correlation_id": "research-2026-05-22-001",
  "summary": "Synthesis complete. Executive summary ready.",
  "payload": {
    "deliverable_key": "acmi:work:synthesis-001:profile",
    "word_count": 1500
  }
}
```

---

## Rollup Templates

### Timeline Archival Configuration

**Thresholds:**
- Archive when `ZCARD timeline > 1000`
- Archive bottom 500 events
- Retain top 500 in active timeline

**Summary Configuration:**
```json
{
  "rollup_id": "summary-001",
  "range_start_ts": 1745000000000,
  "range_end_ts": 1745280000000,
  "event_count": 500,
  "summary": "Between April 15 and April 22: 25 customer interactions, 3 proposals sent, 2 deals closed. Average deal size: $45,000. Churn risk remains low across portfolio.",
  "source_kinds": ["gmail", "vapi", "crm", "agent"],
  "synthesizer_agent": "claude-engineer",
  "synthesized_ms": 1745281800000
}
```

**Query Pattern:**
```bash
# Get recent events
acmi get sales gardine-wilson  # Returns timeline with last 50

# Get summaries only (no individual events)
LRANGE acmi:sales:gardine-wilson:summary 0 -1

# Get full history (recent + archived)
# (Custom helper function combining both ZRANGEs)
```

---

## Cost Tracking Templates

### Cost Ledger Schema (v1.1)

**Stored in:** `acmi:{namespace}:{id}:signals.cost_ledger`

**Entry Format:**
```json
{
  "ts": 1745280300000,
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "tokens": {
    "input": 1800,
    "output": 650,
    "total": 2450
  },
  "cost_usd": 0.0735,
  "operation": "synthesis"
}
```

**Summary Aggregation:**
```json
{
  "total_tokens": 50000,
  "total_cost_usd": 1.50,
  "by_model": {
    "claude-sonnet-4": {"tokens": 30000, "cost_usd": 0.90},
    "gpt-4": {"tokens": 20000, "cost_usd": 0.60}
  },
  "by_operation": {
    "synthesis": {"cost_usd": 0.90},
    "analysis": {"cost_usd": 0.60}
  }
}
```

---

## Multi-Agent Coordination Checklist

When setting up a new fleet coordination pattern:

1. **Define the shared thread** — `acmi:thread:{topic}:timeline`
2. **Define the event kinds** — What events will agents emit?
3. **Define lease keys** — What resources need exclusive access?
4. **Define handoff protocol** — How do agents pass work?
5. **Define namespaces** — What business domains are involved?
6. **Define cost tracking** — Who pays for what operations?
7. **Define archival strategy** — When do timelines get archived?
8. **Test with 2 agents** — Validate the pattern before scaling

---

## Extending These Templates

To create your own templates:

1. Copy the relevant template file
2. Customize for your domain
3. Add to this directory
4. Document the event kinds and lease patterns
5. Share back to the community!

---

*Templates are open-source. Feel free to fork, modify, and contribute back to the ACMI project.*