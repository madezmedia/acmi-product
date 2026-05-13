# Whop Product Page — Claude Engineer Lab

**Tier:** $39/month recurring · **Whop product type:** Subscription + Discord role-gate
**Cover image:** Reuse `cover-techex-A@2x.png` (timeline composition, 3840×2160 retina)
**Status:** Drop-in ready for Whop creator dashboard

---

## Product Title

**Claude Engineer Lab — Live builds + weekly drops + private Discord**

## Subtitle / Short Description (≤160 chars)

Watch me build the next ACMI agents live. New skill every week, lifetime Discord access, vote on the roadmap. $39/mo. Includes the Starter Kit.

*(154 chars)*

## Long Description

### The Lab is where the fleet actually gets built.

The Starter Kit is the recipe as of today. The Lab is what comes next — the new agents, the new dashboards, the new skills, dropped weekly while I build them.

If the kit is the cookbook, the Lab is the kitchen.

### What you get every week

**One live build session.** 60 minutes, recorded, async Q&A in Discord afterward. I build the next thing on the public roadmap — a new agent, a new dashboard view, a new MCP integration, a new governance pattern. You watch the actual code happen, copy the patterns, ask questions, and walk away with the artifact.

**One async skill drop.** A `.skill` package or markdown spec you can drop into your own fleet. The same skills I'm shipping to my own claude-engineer, bentley, and claude-cowork — not training-wheels versions.

**Roadmap voting.** Ratify, defer, or decline what ships next. The fleet I build serves Lab members first.

### Plus everything else

- **Lifetime Discord access** (`#lab` channel) for the duration of your subscription
- **Direct DM access** to me, best-effort
- **Early access** — new agents, dashboards, integrations land in the Lab 14 days before public
- **Everything in the ACMI Starter Kit** (instantly, no separate purchase)

### What you do NOT get

- 1:1 coaching calls. I'm not a coach.
- "Unlimited live build access." That's a calendar trap. The structure above is what scales without me burning out.
- Done-for-you fleet setup. The Lab is for builders who deploy their own.

### Who this is for

You already shipped one Claude Code project. You're starting a second. You want to be in the room while the protocol you're using evolves, you want the new patterns the day they ship, and you don't want to keep paying for the same Skool course twice.

### Lifetime pricing lock

Price is going to $49/mo after 6 weekly drops are in the can. **If you join now at $39, you're grandfathered at $39 for as long as your subscription stays active.** Cancel, come back, you pay current rate.

### How the live builds actually work

- **When:** Every Tuesday, 2pm ET (12pm PT / 8pm CET)
- **Where:** Discord stage in `#lab`, recording posted within 24 hours
- **Format:** 45 min build + 15 min Q&A
- **What I'm building right now:** the Ops Center v2 — `/ops-center-v2/` is the operator UI for the fleet, currently shipping the Cron Manager view. (You can see PR #36 and PR #38 on the public repo if you want a taste.)

### How the weekly drops work

- **When:** Friday, dropped to Discord + emailed to subscribers
- **What:** One reusable artifact per week. Could be a new agent prompt, a new skill, a new dashboard component, a new MCP integration.
- **Format:** Markdown spec + working code. Idempotent, drop-in.

### What you can verify before buying

- The Starter Kit is real (npm, Smithery, GitHub, live dashboard — all public)
- The fleet is real (10 agents instantiated, 6 actively coordinating, log visible in the production dashboard)
- The build cadence is real (check the PR history on github.com/madezmedia/acmi-product — that's the velocity)

---

## What's-Inside Checklist (Whop bullet block)

- [x] **Everything in the $47 Starter Kit, instantly**
- [x] 1 live build per week (Tuesday 2pm ET, recorded)
- [x] 1 async skill drop per week (Friday)
- [x] Roadmap voting access
- [x] Private Discord (`#lab`) — lifetime access
- [x] Direct DM access (best-effort)
- [x] 14-day early access on all new releases
- [x] $39/mo grandfathered for life if you join before the price bump

---

## FAQ Block

**Do I need the Starter Kit first?**
No. The Lab includes everything in the Starter Kit. Buying both would be duplicate.

**Can I cancel anytime?**
Yes. Whop handles cancellation — one click, you're out. You keep your Discord access through the end of the paid month. No retention games.

**What happens to my Discord access if I cancel?**
Whop revokes the role-gate at the end of your current billing period. The Starter Kit files stay yours forever (you've already downloaded them).

**Are live builds really live, or are they edited?**
Live. Bugs, dead ends, real debugging. You're watching the actual work, not a tutorial. Recordings are unedited except for sometimes trimming the first/last minute.

**What if I miss a live build?**
Recording is posted within 24 hours in `#lab`. You also have a Discord thread to drop questions in.

**Why is it called "Claude Engineer" Lab?**
Because claude-engineer is the agent in my fleet doing most of this work. The Lab is named after the agent, not the model. (Yes, Claude is in the name — I run Anthropic's models. The protocol is model-agnostic, the agent is Claude-flavored.)

**Will I get value if I'm not using Claude specifically?**
Probably yes. The patterns work for any agent framework. But if you're 100% on a different stack (e.g., pure LangGraph or pure CrewAI), the Starter Kit might be the better fit and you can skip the Lab.

**Can I run an enterprise team on this?**
The current Lab is sized for individuals. A team license tier is coming (~$199–499/mo, with the Lobster Trap governance + SLA layer) but not until after the TechEx hackathon ships. If you want first dibs, DM me.

---

## Image / Asset Spec

| Slot | Source | Notes |
|---|---|---|
| Hero cover (16:9) | `cover-techex-A@2x.png` (3840×2160) | Timeline composition — best for "ongoing builds" framing |
| Product thumbnail | Crop center 1:1 from cover-techex-A | 1080×1080 |
| Loom/video | New 60s clip: screen recording of `/ops-center-v2/` + cron manager + roundtable | TODO — record before launch |
| Backup video | `sizzle-techex-audio.mp4` (75s, 7.3MB) | Already produced, reusable |

---

## Whop Settings Checklist

- [ ] Product type: **Subscription, monthly**
- [ ] Price: **$39/month**
- [ ] Trial: **No** (lifetime grandfathering is the real lever)
- [ ] Discord role gate: **Yes** → assigns `Lab Member` role on purchase, revokes on cancel
- [ ] Includes Starter Kit download: **Yes** (same ZIP, attached as bundled content)
- [ ] Webhook to fleet: post `whop-purchase-lab` event to `acmi:thread:revenue:timeline` with member tier + email
- [ ] Pricing notes: add an internal note "raise to $49 after 6 weekly drops shipped; grandfather existing"

---

## Launch Comms — Lab-Specific

1. After a Starter Kit buyer is set up (~7 days post-purchase), DM them in `#starter-kit-help`: *"You're shipping events to your timeline. The Lab is where I show you what we built this week. First build is [date]."*
2. Pin the upgrade message in `#starter-kit-help` with a Whop link
3. End of every live build session: post the recording to `#starter-kit-help` with a paywall ("full recording in `#lab`")
4. X thread after week-2 live build: *"This is what the Lab built this week. [video clip]. $39/mo, [Whop link]."*
