# The Three-Pillar Protocol

*or: why I stopped bolting vector DBs onto my AI agents and started shipping*

**Draft v0 — 2026-04-23 — Mikey Shaw, Madez Media**
**Target:** Substack + dev.to crosspost, 1,700 words, 8-minute read.

---

I run eight AI agents. They talk to customers over Gmail and Vapi, they update my CRM, they book dispatch jobs for my pump company, they draft content, they audit my other agents' work, and at the end of the day they leave me a one-page summary so I can sleep.

For a year, I kept trying to build this the way every tutorial told me to:

- Vector DB for "memory."
- Relational DB for the customer record.
- Graph DB because someone on Twitter said agents need knowledge graphs.
- Orchestrator queue (Temporal, Celery, whatever) for handoffs.
- A webhook catcher glued to an n8n workflow glued to a Zap glued to a prayer.

Five services. Five auth flows. Five places state can drift. Every new agent meant writing five more adapters. Every outage meant debugging five integration seams at once.

It worked. Barely. And it was ugly in a way that made me doubt whether any of this was actually going to scale past me.

Then one night I deleted four of the five services and put everything on one Redis. The agents got faster. The code got shorter. The bugs got fewer. And a pattern I'd been half-seeing snapped into focus.

I'm calling it **ACMI** — Agentic Context Management Infrastructure. Three pillars per entity, one key-value store, one schema that fits every business I run. That's the whole thing. It's not a new idea so much as a new arrangement of old ideas that happens to be exactly the shape AI agents want to read and write.

This post is about why that arrangement is beautiful. Not "clever" — **beautiful**, in the sense that every line of code you delete makes the system feel more correct, not less.

---

## Why the beauty is in the simplicity

Every working system I've ever admired had the same quality: one primitive, used everywhere.

Unix: files. Everything is a file. Devices are files. Pipes are files. Network sockets are files. It's not that every tool on Unix is great. It's that the *substrate* is the same primitive, and every tool becomes legible the moment you learn it.

Git: the commit. Branches are pointers to commits. Tags are pointers to commits. Merges produce commits. Reverts are commits. A whole distributed version-control universe, and the object graph has three types.

Redis, at its core: keys and a handful of data types. The Lisp of databases.

Most AI agent stacks I've seen are the opposite of that. They're a pile of *different* primitives — vectors, rows, nodes, queue messages, tool calls — each with its own consistency model, each with its own auth flow, each with its own "when does this change, and who can see it." You end up reasoning about five substrates at once every time you want an agent to do something useful.

I kept asking: what's the one primitive an agent actually needs?

The answer my stack eventually gave me was: **a key, a JSON snapshot, and a timeline.**

That's it. That's the whole thing.

---

## The three pillars

Every entity in my business — a customer, a truck, a project, a support ticket, a sales deal — gets three Redis keys, and nothing else.

**Profile** — the hard state. `acmi:sales:gardine-wilson:profile` is a JSON document: company name, stage, budget, contact, last-quoted price. The facts that would go in a database row if this were 2015. When the facts change, I overwrite the JSON. That's it.

**Signals** — the soft state. `acmi:sales:gardine-wilson:signals` is JSON that the agent *synthesizes*. Churn risk: low. Sentiment: warming. Next best action: "follow up Friday with the revised proposal." The agent reads the profile and the timeline, thinks, and writes signals back. Next agent that shows up — maybe a different model, maybe a different trigger — reads the signals first and doesn't have to re-derive them.

**Timeline** — the event stream. `acmi:sales:gardine-wilson:timeline` is a Redis sorted set. Score is `unix_ms`. Each member is a JSON event: the Gmail thread that came in, the Vapi call that happened, the proposal I sent, the webhook from my CRM, the note my own agent left for its future self. Everything that ever happened to this customer, in one chronological log, from every platform that touched them.

One GET pulls profile + signals + last 50 timeline events into a single JSON payload. That payload fits in a context window. The agent reads it, acts, writes its own event back to the timeline, updates signals, and moves on.

The API is ridiculous:

```bash
acmi profile sales gardine-wilson '{"company":"ClientCo","stage":"Proposal Sent"}'
acmi event   sales gardine-wilson "gmail" "Sent revised proposal PDF."
acmi signal  sales gardine-wilson '{"churn_risk":"low","next_action":"Follow up Friday"}'
acmi get     sales gardine-wilson
```

Four commands. Works for sales, works for support, works for dispatch, works for my content team, works for project management. Same four commands. Different namespace.

**That's the separation.**

---

## What the separation actually separates

This is the part I think most stacks are getting wrong.

When you bolt a vector DB onto an agent, you're coupling *retrieval strategy* to *storage*. When you put your customer data in Postgres and your conversation history in Pinecone and your task queue in Redis, you're coupling *source system* to *access pattern*.

ACMI separates three things that every other stack tangles:

1. **Application layer ↔ Agent layer.** My pump company doesn't need to know anything about AI. It fires webhooks into Redis. Agents read the timeline. If I swap Claude for Gemini tomorrow, the pump company doesn't notice.
2. **Hard state ↔ Soft state.** Facts (Profile) vs. AI synthesis (Signals) are different keys. Signals can be wrong, stale, or recomputed. Profile is the source of truth. When an agent goes sideways, I nuke Signals and the Profile survives.
3. **State ↔ History.** The current snapshot (Profile) is cheap to read and cheap to update. The full history (Timeline) is append-only and chronologically ordered. Different access patterns, different keys, no foreign-key gymnastics.

All three separations collapse into one schema: `acmi:{namespace}:{id}:{profile|signals|timeline}`. Three keys, three concerns, one substrate.

This isn't new thinking. It's CQRS (Fowler wrote about it in 2005). It's event sourcing. It's the blackboard pattern from 1980s AI research. What's new — for agents, in 2026 — is how *exactly* these shapes match the way an LLM actually wants to consume context.

A language model wants: a snapshot of facts, a synthesized summary of how to think about them, and the last N things that happened, in order. That is not a database query. That is exactly three Redis keys.

---

## The one part that's genuinely new

Everything above is a well-arranged application of prior patterns. I'd be lying if I called it a breakthrough on its own. Senior infra engineers have been shipping CQRS on Redis for fifteen years.

Here's the part I think *is* new — or at least, the part I haven't seen framed this way before:

**The timeline isn't just memory. It's a coordination bus.**

When I put a `kind: handoff-request` event on the timeline, the next agent that scheduled-ticks picks it up and acts on it. When one agent leases an inbox item with `SET NX EX 600`, no other agent touches that item for ten minutes. When my Claude session wants to hand state to my Gemini session, it ZADDs an event to a *shared* timeline — `acmi:thread:claude-daily-driver:timeline` — and Gemini ZRANGEs it next time it wakes up.

Mem0, Zep, Letta — all brilliant products — are **per-agent** memory. Each agent has its own store and they talk through an orchestrator. That's fine for one agent with a long memory. It's wrong-shaped for *my* problem, which is eight heterogeneous agents, across two CLIs and a cloud runner, coordinating on real work.

In ACMI, the shared timeline is the coordination primitive. No orchestrator. No message bus. No Temporal. The agents don't even need to know about each other — they just read and write the same ZSET and trust the chronology.

- Lease lock: `SET NX EX 600 lease:<item_id>`
- Handoff: `ZADD {thread} {ts} {"kind":"handoff-request","from":"A","to":"B"}`
- Acknowledgement: `ZADD {thread} {ts} {"kind":"handoff-ack","correlation_id":"..."}`
- Cost tracking: append-to-list inside Signals

It's… it's just Redis. Three commands. A lease key. Nothing clever. And yet I've never seen the combination — *shared timeline + lease + handoff events on the same substrate as memory* — called out as a primitive. Mem0 is per-user. LangGraph checkpoints are per-graph. MCP is per-tool-call. The cross-agent, cross-platform, cross-session coordination log is still unclaimed ground, as far as I can see.

If that turns out to be the part that matters, the rest of ACMI is just a good implementation of an otherwise boring storage schema. Which is fine. That's how most real infrastructure works: one surprising primitive, wrapped in a boring, correct, reliable substrate.

---

## What ACMI is not

- **Not a vector DB.** I don't embed anything. If I need semantic retrieval later, I'll add it as a fourth key (`acmi:{namespace}:{id}:embeddings`) and keep the schema open. Today, 50 events in chronological order is more than any of my agents need.
- **Not a graph DB.** Entities are flat. Relationships live in Profile JSON. If I need true graph traversal I'll bolt Graphiti on top. Today I don't.
- **Not a replacement for Mem0 or Zep.** They are better at long-term per-agent personalization than this is. Use them if that's your problem. ACMI is the right shape if your problem is *many agents coordinating across many platforms on many domains*.
- **Not a product.** It's a schema + a ~300-line CLI + a single Redis. The "product" question is about what you build *on top* of the schema.
- **Not a trademark claim.** The acronym collides with aviation and an Australian museum, and I'm fine with that. What I care about is the schema and the protocol.

---

## The operator angle

I built this because I'm one person running several businesses. I don't have an infra team. I don't have a DevOps hire. I have a Redis instance that costs less than my Spotify subscription, and eight agents that file themselves into it while I sleep.

This is what I mean when I talk about being an **augmented human being**: it's not a cyborg thing, it's not a transhumanist thing, it's a boring thing — *one operator + a well-chosen substrate + a handful of language models* can do the work of a small team, if the substrate is clean enough to reason about at 11pm.

The beauty is in the simplicity. Three keys. One store. Any domain. Every agent. No orchestrator, no queue, no graph, no vector DB I haven't earned the right to add. Everything that has ever happened to an entity, in chronological order, readable by any agent that shows up with a context window and a prompt.

If that shape is useful to anyone else, the repo is at **github.com/madezmedia/acmi**. The README has the four commands, a Redis Cloud free-tier setup, and an example namespace for sales. Total install time is ~4 minutes.

If you build something on it, ZADD me an event on `acmi:thread:public:timeline`. I'll see it next time my agents wake up.

---

## Want me to look at your stack?

I run this for eight agents across three businesses. If you're trying to coordinate more than one AI agent and your stack feels like it's getting away from you, I can help.

**ACMI Architecture Review — $297, 90 minutes.**

We jump on a call, I look at your current setup (vector DB, queue, orchestrator, whatever you've bolted on), and you walk away with:

- A whiteboarded ACMI keyspace mapped to your specific domain
- The three-key schema for each entity that matters to you (customers, jobs, projects, conversations — whatever)
- A handoff/lease pattern for any cross-agent coordination you're doing
- A written 1-page implementation plan you can hand to whoever's coding it (or run yourself in an afternoon)

Most teams I talk to walk into the call with 4-5 services and walk out with one substrate and a shorter weekend. If you're spending more time wiring than shipping, this pays for itself in the first sprint.

**[Book a slot → square.link/u/9Js5ZSDT](https://square.link/u/9Js5ZSDT)**

If your timing is off this week, drop your email and I'll send you the playbook PDF when it's done — no pitch, just the schema.

---

*Mikey Shaw builds AI-leveraged small businesses and documents the attempt at madezmedia.com. This post first appeared on [blog URL] and was [crossposted to dev.to / Substack / HN]. The ACMI repo is at github.com/madezmedia/acmi.*

---

## Publishing checklist (not part of post body)

Before sending this to Substack/dev.to/HN:
- [ ] Finalize blog URL + crosspost URLs
- [ ] Add at least one screenshot or diagram of the three-pillar schema
- [ ] Tag v0.1.0 on the repo so the GitHub link resolves to a dated commit
- [ ] Add a dated footer: "Published 2026-04-XX, canonical at [URL]"
- [ ] "Show HN" title variant: "Show HN: ACMI — three-pillar agent context on Redis"
- [ ] dev.to tags: `#ai`, `#redis`, `#agents`, `#opensource`, `#architecture`

## SEO hooks covered

- Tier 4 exact-phrase "agentic context management infrastructure" (winnable in weeks)
- Tier 3 "redis for ai agents" (Redis.io owns but we have an operator-voice angle)
- Tier 3 "multi-agent coordination" (semi-competitive)
- Tier 4 "three-pillar agent context" (uncontested)
- Tier 4 "event sourcing for AI agents" (uncontested)
- Personal-brand "augmented human being" (uncontested; domain purchase recommended before this post)
