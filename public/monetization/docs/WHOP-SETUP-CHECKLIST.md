# Whop Setup Checklist — TONIGHT

**Goal:** Two Whop products live and accepting payments by end of session.
**Time budget:** 90 minutes (60 min Whop setup + 30 min smoke test + launch tweets)
**Owner:** Mikey

---

## Phase 0 — Pre-flight (10 min)

- [ ] Sign in to Whop creator dashboard at https://whop.com/dashboard
- [ ] Confirm/claim `@madezmedia` company handle (or pick the strongest alternative if taken)
- [ ] Confirm Stripe is connected to Whop (for payouts) — if not, do this first
- [ ] Confirm Discord server exists and has a `Lab Member` role created (create if needed)
- [ ] Whop Discord integration: install Whop bot in your Discord server, grant Manage Roles permission

## Phase 1 — Create the ACMI Starter Kit ($47 one-time) (20 min)

- [ ] **Whop dashboard → Create product → One-time payment**
- [ ] Title: `ACMI Starter Kit — The Fleet Coordination Protocol for AI Builders`
- [ ] Short description: paste from `WHOP-STARTER-KIT.md` (the 157-char subtitle line)
- [ ] Long description: paste full long-description block from `WHOP-STARTER-KIT.md`
- [ ] Price: `$47.00 USD`
- [ ] Upload cover image: `cover-techex-B@2x.png` (3840×2160) from `/Users/michaelshaw/clawd/projects/acmi-techex-hackathon/`
- [ ] Upload product video: `sizzle-techex-audio.mp4` (75s) from same folder
- [ ] Upload deliverable file: ZIP the contents of the Starter Kit (see "ZIP contents" below) and attach
- [ ] Set refund window: 14 days (Whop default)
- [ ] Set membership/Discord: leave OFF for Starter Kit (only Lab uses role-gate)
- [ ] Save as DRAFT — do NOT publish yet, smoke test first

**ZIP contents (build this before uploading):**

```
acmi-starter-kit-v1.zip
├── README.md                 # 15-min deploy walkthrough
├── 01-protocol-spec/
│   └── ACMI-Protocol-Spec-v1.3.pdf
├── 02-agents/
│   ├── claude-engineer.profile.json
│   ├── bentley.profile.json
│   ├── claude-web.profile.json
│   ├── gemini-cli.profile.json
│   ├── perplexity.profile.json
│   ├── antigravity.profile.json
│   ├── claude-cowork.profile.json
│   ├── synthesizer.profile.json
│   ├── researcher.profile.json
│   └── publisher.profile.json
├── 03-redis-schema/
│   ├── schema.md
│   ├── keyspace-layout.md
│   └── bootstrap.sh
├── 04-crons/
│   ├── openclaw-crons.json (31 jobs)
│   └── launchd/ (8 .plist templates)
├── 05-lobstertrap/
│   ├── lobstertrap-policy.yaml
│   └── README.md
├── 06-dashboard/
│   └── governance-dashboard/  # React source, forkable
├── 07-mcp/
│   └── INSTALL.md  # @madezmedia/acmi-mcp install steps
└── 08-discord-invite/
    └── INVITE.md  # how to claim Discord role
```

**Stub-out path if you can't ZIP it all in 20 min:** ship the README + a Notion page link with the rest. Add the ZIP within 48h. The README must be real.

## Phase 2 — Create the Claude Engineer Lab ($39/mo) (15 min)

- [ ] **Whop dashboard → Create product → Subscription → Monthly**
- [ ] Title: `Claude Engineer Lab — Live builds + weekly drops + private Discord`
- [ ] Short description: paste 154-char subtitle from `WHOP-LAB.md`
- [ ] Long description: paste full long-description block from `WHOP-LAB.md`
- [ ] Price: `$39.00 USD per month`
- [ ] Trial: **NO** (lifetime grandfathering is the real lever)
- [ ] Upload cover image: `cover-techex-A@2x.png` (3840×2160)
- [ ] Upload product video: same `sizzle-techex-audio.mp4` for now (record a Lab-specific 60s clip within 7 days)
- [ ] Bundled content: attach the same ZIP from the Starter Kit (Lab gets everything in Starter Kit instantly)
- [ ] Set membership/Discord: **YES** → connect Discord → role: `Lab Member`
- [ ] Save as DRAFT — smoke test first

## Phase 3 — Smoke Test (15 min)

- [ ] Publish both products
- [ ] Use Whop's test-mode or a real card to buy the **Starter Kit** at $47 — verify:
  - [ ] Email receipt arrives
  - [ ] ZIP download link works
  - [ ] Whop dashboard shows the sale
- [ ] Refund the test purchase
- [ ] Buy the **Lab** at $39 — verify:
  - [ ] Same as above
  - [ ] Discord role `Lab Member` gets assigned automatically
  - [ ] You can see the `#lab` channel
- [ ] Cancel the Lab subscription — verify role gets revoked at period end (usually visible immediately in test mode)
- [ ] Refund the test purchase

## Phase 4 — ACMI Wiring (10 min)

- [ ] Set up a Whop webhook → your `/api/whop-webhook` endpoint on acmi-product.vercel.app
  - (If endpoint doesn't exist yet, push a stub that just logs to ACMI thread `revenue`)
- [ ] Endpoint should ZADD a revenue event to `acmi:thread:revenue:timeline` with shape:
  ```json
  {
    "ts": <ms-epoch>,
    "source": "whop:webhook",
    "kind": "purchase",
    "correlationId": "whopPurchase<starterKit|lab>-<ts>",
    "summary": "[purchase TIER @mikey] amount $XX from buyer:<email-hash>",
    "payload": { "tier": "starter-kit|lab", "amount_usd": 47|39, "buyer_email_hash": "...", "whop_member_id": "..." }
  }
  ```
- [ ] Confirm the test purchases (before refund) showed up in the timeline

## Phase 5 — Launch Comms (20 min)

- [ ] **X post #1** (anchor post — keep this one alive, pin to profile):
  > I shipped 10 AI agents in production. They forget what each other did unless they share a memory layer.
  >
  > I built that layer. MIT, runs on Redis, works with Claude Code + Cursor + Cline.
  >
  > Today I'm releasing the fleet recipe: $47 kit, $39/mo lab.
  >
  > Link: [Whop URL]

- [ ] **X post #2** (the proof thread — 5 tweets):
  - Tweet 1: "Here's what's in the box"
  - Tweet 2: Screenshot of governance-dashboard.html live
  - Tweet 3: `npm install @madezmedia/acmi` terminal screencap
  - Tweet 4: List of 10 agents
  - Tweet 5: Whop link + grandfathering note

- [ ] **Reply-guy plays** (15 min):
  - Find the top open thread on r/cursor about "project-specific context memory" (forum #136157) → reply with the protocol + soft mention
  - Find a recent Mem0 or Letta post on X → reply: "if your agents need shared timeline not just per-agent memory, here's the OSS protocol I run" + Whop link
  - r/ClaudeAI top recent thread about context loss → same play

- [ ] **Discord pre-seed** (5 min):
  - Pin a welcome message in `#starter-kit-help` and `#lab`
  - Drop a "you're in — here's what to do first" message template ready to send to each new buyer

## Phase 6 — ACMI Rollup (5 min)

- [ ] Post a `milestone-shipped` event to `acmi:agent:claude-engineer:timeline` with correlationId `whopProductsLaunchedV1-<ts>`, summary: `[milestone-shipped @mikey @fleet] Whop products live: ACMI Starter Kit ($47) + Claude Engineer Lab ($39/mo). Both pages published, smoke-tested, X launch threads up.`
- [ ] Update `acmi:agent:claude-engineer:rollup:latest` to include the launch in next-session priorities (track revenue events, monitor first 24h conversion)

---

## Decision Points Where You Should Pause

- **Whop handle collision:** if `@madezmedia` is taken, pick between `@madez-media`, `@acmi-protocol`, or `@madez-ai` before publishing. Recommendation: `@madez-media` (matches GitHub).
- **Pricing wobble:** if a friend says "$47 is too low for the protocol," resist. Market data says $47 is the gravity well. Raise the Lab to $49 after 6 weekly drops, never the kit.
- **Refund spike in first 24h:** if >15% refund rate, pause launch comms and DM each refunder to find out what broke. Most likely cause: ZIP delivery or Discord role-gate misfire.

## What NOT To Do Tonight

- Don't write a course curriculum. The kit is a codebase, not a course.
- Don't promise "live 1:1 support." Calendar trap.
- Don't set up an affiliate program. Comes later.
- Don't open an email list opt-in flow. Whop captures emails; that's enough for V1.
- Don't promise an enterprise tier publicly. Mention it only in DMs from buyers who ask.

---

## Success Bar for "Tonight Was a Win"

- [ ] Both products published and live in Whop
- [ ] Each product has been bought + refunded successfully (smoke tested)
- [ ] Webhook into ACMI revenue thread is firing
- [ ] X anchor post up, pinned to profile
- [ ] First reply-guy play executed in at least one of: r/cursor, r/ClaudeAI, X Mem0/Letta thread
- [ ] Rollup event logged

If you hit all 6, you went from zero to live monetization in one session. Anything beyond that is bonus.
