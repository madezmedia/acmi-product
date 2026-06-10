# ACMI Handoff Protocol v1 — Cloud ⇄ Local

**Status:** locked in
**Date:** 2026-04-26
**Purpose:** make cloud-orphan deliverables impossible. Every cloud-side artifact MUST land somewhere local can read.
**Anchor incident:** `acmi:incident:2026-04-24-swarm-halt` produced 3+ orphan branches (`claude/integration-smoke-test-cv23m`, `claude/audit-agent-skills-ZXTZf`, etc.) that cloud claimed shipped but never reached `madezmedia/claude-daily-driver` or local disk.

## The locked-in workflow

```
                 ┌──────────────────────────────────────────┐
                 │  CLOUD                                   │
                 │  (RemoteTrigger / claude.ai sandbox)     │
                 │                                          │
                 │  - Synthesis, research, scaffolding      │
                 │  - HTTP-only work (ACMI, Notion, MCP)    │
                 │  - Long-running unattended tasks         │
                 └────────────┬─────────────────────────────┘
                              │ ① ships via:
                              │    a) git push to known repo
                              │       OR
                              │    b) ACMI deliverable namespace
                              │
                              │ ② signals via tracker:
                              │    acmi:tracker:cloud-handoffs
                              ▼
                 ┌──────────────────────────────────────────┐
                 │  LOCAL                                   │
                 │  (this Claude Code session, launchd)     │
                 │                                          │
                 │  - All filesystem ops                    │
                 │  - Config edits (openclaw/routes/jobs)   │
                 │  - Build/test/integrate                  │
                 └────────────┬─────────────────────────────┘
                              │ ③ pickup cron scans tracker
                              │ ④ git fetch + checkout / acmi get
                              │ ⑤ integrates to canonical paths
                              │ ⑥ marks tracker item local-integrated
                              │
                              │ ⑦ ZADDs status back to ACMI
                              ▼
                 ┌──────────────────────────────────────────┐
                 │  CLOUD next tick                         │
                 │  reads tracker, sees what landed,        │
                 │  doesn't re-ship integrated items        │
                 └──────────────────────────────────────────┘
```

## Lane discipline (what runs where)

| Concern | Cloud | Local |
|---|:---:|:---:|
| ACMI ZADD/GET, Notion, Postiz, GitHub HTTP | ✅ | ✅ |
| Filesystem writes to `~/clawd/`, `~/.openclaw/` | ❌ ephemeral | ✅ persistent |
| Long synthesis (research, audits) | ✅ ideal | OK |
| Scheduled cron (RemoteTrigger) | ✅ | ✅ launchd |
| Editing openclaw config | ❌ never | ✅ only |
| Inbox drainer | ✅ items where target=cloud,any | ✅ items where target=local,any |
| Heavy filesystem inspection | ❌ no fs | ✅ |
| Subagent spawning | ✅ | ✅ |
| ACMI mutations | ✅ | ✅ |
| Git commits to local-tracked repos | ❌ | ✅ |
| Git pushes to remote repos | ✅ via configured repo | ✅ |

**Default rule: if you need to write a file that must persist, it MUST end up in either:**
1. **A pushed branch** on `madezmedia/claude-daily-driver` (or another configured repo), AND
2. **An entry on `acmi:tracker:cloud-handoffs`** describing the deliverable

If both aren't true, the work is orphaned by definition.

## The cloud-handoffs tracker

`acmi:tracker:cloud-handoffs:*` — single source of truth for in-flight cloud→local handoffs.

### Profile

```json
{
  "name": "Cloud handoff tracker",
  "purpose": "Every cloud-side deliverable lands here. Local pickup cron scans for state=pending-pickup.",
  "states": ["cloud-shipping", "pending-pickup", "local-pulled", "local-integrated", "rejected", "closed"],
  "transport_modes": ["github-branch", "acmi-content"]
}
```

### Per-deliverable item schema

```json
{
  "id": "deliv-2026-04-26-abc123",
  "title": "...",
  "transport": "github-branch | acmi-content",
  "github": {
    "repo": "madezmedia/claude-daily-driver",
    "branch": "claude/quota-monitor-recover",
    "sha": "<commit sha after push>",
    "files": ["tools/quota-monitor.mjs"]
  },
  "acmi_content": {
    "key": "acmi:cloud-deliverable:deliv-...:content",
    "size_bytes": 4096,
    "sha256": "..."
  },
  "state": "pending-pickup",
  "shipped_at": 1745280000000,
  "shipped_by": "claude-engineer-cloud",
  "target_path": "~/clawd/tools/acmi-sync/quota-monitor.mjs",
  "integration_notes": "..."
}
```

### Timeline event taxonomy

- `kind: cloud-shipping` — cloud started building (optional progress signal)
- `kind: cloud-shipped` — git push complete OR ACMI content stored. Includes branch+sha.
- `kind: local-pulled` — local fetched/read, ready for review
- `kind: local-integrated` — applied to canonical path; deliverable closed
- `kind: rejected` — local declined to integrate (with reason)

## Cloud-side rules (NORMATIVE)

When a cloud session ships an artifact, it MUST:

1. **Make a real git commit** in its sandbox repo if the artifact is a file.
2. **Push to a branch on the configured repo** (typically `madezmedia/claude-daily-driver` per trigger sources).
3. **Capture the commit SHA** from `git rev-parse HEAD`.
4. **Write a `cloud-shipped` event** to `acmi:tracker:cloud-handoffs:timeline` with branch + sha + files list.
5. **(Optional) For small artifacts <50KB**, ALSO write content into `acmi:cloud-deliverable:<id>:content` as a backup transport.

If the push fails (auth, network), the cloud session MUST:
- Write a `cloud-ship-failed` event with the reason
- Save the artifact content into ACMI as fallback transport
- Never claim "shipped" without one of: pushed sha OR ACMI content

## Local-side rules (NORMATIVE)

A local pickup process (cron + this Claude session) MUST:

1. **Maintain a fresh clone** at `~/clawd/cloud-sync/claude-daily-driver/`.
2. **Run pickup hourly** (or on-demand): scan `acmi:tracker:cloud-handoffs:timeline` for `state=pending-pickup`.
3. For each item:
   - `git fetch origin && git checkout <branch>` — pull the work
   - Read the deliverable files
   - Apply to `target_path` (or skip + write `rejected` with reason)
   - Mark `state=local-integrated`, write `local-integrated` event
4. **Never deny that work exists** because it's not on local — always check the tracker first.

## Recovery procedure (for existing orphans)

For each known orphan deliverable from before this protocol:

1. Open a tracker entry with `state=cloud-shipping`
2. Dispatch a cloud session (via inbox-drain-cloud) with a recovery brief:
   - "Recreate <artifact-name>. Specs in <reference>. Push to madezmedia/claude-daily-driver on branch claude/recover-<slug>. Write cloud-shipped event to acmi:tracker:cloud-handoffs."
3. Local pickup picks it up via the new protocol.

## Implementation surface

**Files to create:**
- `~/clawd/cloud-sync/claude-daily-driver/` — local clone (initial `git clone`)
- `~/clawd/tools/cloud-sync/pickup.mjs` — scans tracker, pulls branches, applies
- `~/.openclaw/cron/jobs.json` — new entry: `Cloud Handoffs Pickup` hourly
- Updates to `prompts/inbox-drain-cloud.md` (in `claude-daily-driver` repo) — add the "claim shipped only with sha+ACMI event" rule

**ACMI keys:**
- `acmi:tracker:cloud-handoffs:{profile|signals|timeline}`
- `acmi:cloud-deliverable:<id>:{profile|content}` for ACMI-transport deliverables

## Validation

A handoff is "complete" iff:
- `state == local-integrated`
- `target_path` exists on local disk
- File `sha256` matches `acmi_content.sha256` (if ACMI-transport) OR `git log` shows the merged sha (if branch-transport)
- Tracker timeline has both `cloud-shipped` and `local-integrated` events
