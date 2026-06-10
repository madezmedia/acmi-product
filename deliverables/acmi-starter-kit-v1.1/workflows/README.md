# Workflow Examples

This directory contains sample workflow configurations for ACMI-powered agent systems.

---

## Available Workflows

**Note:** This starter kit includes workflow templates and documentation. For production deployments, implement these patterns using your preferred workflow engine (Temporal, Inngest, cron, etc.).

---

## 1. Daily Driver Workflow

**Purpose:** Coordinate a daily cycle of research, synthesis, and reporting across multiple agents.

**Thread:** `acmi:thread:daily-driver:timeline`

**Event Flow:**
```
1. daily-driver-start (scheduler agent)
   ↓
2. task-dispatch (multiple agents)
   ↓
3. task-complete (each agent)
   ↓
4. daily-driver-end (scheduler)
   ↓
5. report-generation (reporting agent)
```

**Configuration:**
```yaml
name: daily-driver
schedule: "0 9 * * *"  # 9 AM daily
thread_key: acmi:thread:daily-driver:timeline
agents:
  - claude-engineer
  - claude-researcher
  - claude-writer
tasks:
  - quota-monitoring
  - inbox-drain
  - content-creation
  - audit-skills
```

---

## 2. Inbox Processing Workflow

**Purpose:** Process incoming messages (email, voice, chat) without duplication across multiple agents.

**Lease Pattern:** `acmi:inbox:{source}:lease:{message_id}`

**Event Flow:**
```
1. inbox-item-received (webhook)
   ↓
2. Agent A attempts to claim lease (SET NX EX 600)
   → If successful: process message
   → If failed: skip, pick another message
   ↓
3. inbox-item-processed (agent)
   ↓
4. lease expires (auto-cleanup)
```

**Configuration:**
```yaml
name: inbox-processor
sources:
  - gmail
  - vapi-voice
  - telegram
  - slack
lease_ttl: 600  # 10 minutes
max_concurrent_agents: 3
retry_on_failure: true
```

---

## 3. Handoff Workflow

**Purpose:** Seamless handoffs between specialized agents (research → synthesis → writing).

**Thread:** `acmi:thread:handoffs:timeline`

**Event Flow:**
```
1. Agent A completes research
   → ZADD handoff-request event
   ↓
2. Agent B reads thread
   → Sees handoff-request for task
   → ZADD handoff-ack event
   ↓
3. Agent B completes synthesis
   → ZADD done event
   ↓
4. Agent C reads thread
   → Sees done event from synthesis
   → Picks up writing task
```

**Configuration:**
```yaml
name: handoff-coordinator
thread_key: acmi:thread:handoffs:timeline
handoff_timeout: 3600  # 1 hour
agent_capabilities:
  research-agent: [research, data-analysis]
  synthesis-agent: [synthesis, executive-summary]
  writing-agent: [writing, formatting]
```

---

## 4. Timeline Archival Workflow

**Purpose:** Automatically archive old timeline events and generate summaries.

**Trigger:** When `ZCARD timeline > 1000`

**Event Flow:**
```
1. Check timeline size
   ↓
2. If > 1000: archive bottom 500 events
   → ZRANGEBYSCORE timeline -inf <cutoff>
   → ZADD to timeline:archive
   → ZREMRANGEBYSCORE on timeline
   ↓
3. Generate LLM summary of archived events
   → Create summary JSON with rollup metadata
   → LPUSH to summary list
   ↓
4. Record archival event
```

**Configuration:**
```yaml
name: timeline-archiver
check_interval: 3600  # Every hour
threshold: 1000
archive_batch_size: 500
summarization:
  enabled: true
  max_word_count: 200
  summary_llm: claude-sonnet-4
```

---

## 5. Agent Health Monitoring Workflow

**Purpose:** Monitor agent health, detect failures, and trigger recovery.

**Namespace:** `fleet`

**Thread:** `acmi:thread:agent-health:timeline`

**Event Flow:**
```
1. Agent emits heartbeat event every 5 minutes
   ↓
2. Monitor checks timeline for stale heartbeats
   → If agent hasn't heartbeated in 15 minutes
   → ZADD agent-stale event
   ↓
3. Recovery agent picks up stale event
   → Attempts to restart agent
   → ZADD agent-recovered event (success) or agent-failed (retry)
```

**Configuration:**
```yaml
name: agent-health-monitor
heartbeat_interval: 300  # 5 minutes
stale_threshold: 900  # 15 minutes
agents:
  - claude-engineer
  - claude-researcher
  - claude-writer
recovery_strategy:
  max_retries: 3
  backoff_seconds: 60
```

---

## 6. Cost Tracking Workflow

**Purpose:** Track token usage and costs across all agents.

**Namespace:** `fleet`

**Key Pattern:** `acmi:agent:{agent_id}:signals.cost_ledger`

**Event Flow:**
```
1. Agent completes operation
   → Calculate tokens used
   → Calculate cost
   → Append to cost_ledger in signals
   ↓
2. Periodic aggregation (hourly)
   → Sum costs per agent
   → ZADD to acmi:fleet:cost:timeline
   ↓
3. Daily report
   → Generate cost breakdown by agent
   → ZADD to acmi:fleet:daily-reports:timeline
```

**Configuration:**
```yaml
name: cost-tracker
aggregation_interval: 3600  # Hourly
report_interval: 86400  # Daily
cost_thresholds:
  daily_alert_usd: 50
  monthly_alert_usd: 1000
model_pricing:
  claude-sonnet-4:
    input_per_1m: 3.0
    output_per_1m: 15.0
  gpt-4:
    input_per_1m: 30.0
    output_per_1m: 60.0
```

---

## 7. Cloud ⇄ Local Handoff Workflow

**Purpose:** Coordinate work between cloud-hosted and local agents.

**Thread:** `acmi:tracker:cloud-handoffs:timeline`

**Event Flow:**
```
1. Cloud agent completes synthesis
   → Git push to repo branch
   → ZADD cloud-shipped event with branch + sha
   ↓
2. Local pickup cron scans tracker
   → git fetch + checkout branch
   → Apply to canonical path
   → ZADD local-integrated event
   ↓
3. Cloud agent sees local-integrated
   → Doesn't re-ship (work complete)
```

**Configuration:**
```yaml
name: cloud-local-handoff
thread_key: acmi:tracker:cloud-handoffs:timeline
repo: madezmedia/claude-daily-driver
pickup_interval: 3600  # Hourly
transport_modes:
  - github-branch
  - acmi-content
validation:
  - target_path_exists
  - sha256_matches
  - has_local-integrated_event
```

---

## Implementing These Workflows

### Using Cron + Node.js

```javascript
// Example: Daily driver workflow
const cron = require('node-cron');
const acmi = require('./acmi.mjs');

cron.schedule('0 9 * * *', async () => {
  // Start daily driver
  await acmi.event('thread', 'daily-driver', 'scheduler', 'daily-driver-start', 'Beginning daily cycle.');

  // Dispatch tasks
  await acmi.event('thread', 'daily-driver', 'scheduler', 'task-dispatch', 'Dispatching quota-monitoring task.', {
    task_id: 'quota-monitor',
    agent: 'claude-engineer'
  });
});
```

### Using Temporal

```typescript
// Example: Inbox processing workflow
@workflow
export class InboxProcessorWorkflow {
  @signal
  public inboxItemReceived!: Signal<[string, string]>; // source, message_id

  @query
  public isProcessing!: Query<boolean>;

  async run(source: string, messageId: string) {
    // Attempt to claim lease
    const claimed = await activities.claimLease(source, messageId);
    if (!claimed) {
      return; // Another agent is processing this
    }

    // Process message
    await activities.processMessage(source, messageId);

    // Release lease (or let it expire)
  }
}
```

### Using Cron Jobs

```bash
# crontab entries

# Daily driver at 9 AM
0 9 * * * cd /path/to/acmi && node workflows/daily-driver.mjs

# Inbox processor every 5 minutes
*/5 * * * * cd /path/to/acmi && node workflows/inbox-processor.mjs

# Timeline archiver every hour
0 * * * * cd /path/to/acmi && node workflows/timeline-archiver.mjs

# Agent health monitor every 5 minutes
*/5 * * * * cd /path/to/acmi && node workflows/agent-health-monitor.mjs
```

---

## Best Practices

1. **Use correlation IDs** — Link related events across the workflow
2. **Set appropriate TTLs** — Prevent stuck leases from blocking work
3. **Monitor timeline growth** — Archive old events to prevent unbounded growth
4. **Track costs** — Append to cost_ledger in signals for every LLM call
5. **Handle failures gracefully** — Write failure events so other agents can recover
6. **Test with 2 agents** — Validate coordination patterns before scaling to many agents
7. **Document event kinds** — Maintain a taxonomy of what events mean

---

## Extending These Workflows

To create a new workflow:

1. Define the thread key (or lease pattern)
2. Define the event kinds you'll emit
3. Define the agent roles and handoffs
4. Implement the workflow in your preferred engine
5. Test locally before deploying

---

*Workflows are open-source templates. Adapt them to your needs and contribute back to the ACMI community.*