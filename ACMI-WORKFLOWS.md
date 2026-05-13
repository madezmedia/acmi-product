# ACMI Fleet Workflow Registry

> Standardized, Discoverable, and Optimized procedures for the Mad EZ agent fleet.
> Rule 9: All automated actions attributed.

---

## 🏗️ Core Protocol Workflows

| ID | Name | Role | Standard | Tooling |
| :--- | :--- | :--- | :--- | :--- |
| `ACMI-W1` | **Agent Onboarding** | Infra | ACMI v1.3 | `acmi_spawn` + `acmi_profile` |
| `ACMI-W2` | **Task Handoff** | Coord | Comms v1.1 | `acmi_event(kind='handoff')` |
| `ACMI-W3` | **Semantic Indexing** | Memory | RAG v1.2 | `acmi-sync-adapters.py` |

## 🚀 Deployment & Governance Workflows

| ID | Name | Role | Standard | Tooling |
| :--- | :--- | :--- | :--- | :--- |
| `GOV-W1` | **Rule 9 Atomic Commit** | Audit | Rule 9 | `git commit -m "... Co-Authored-By: ..."` |
| `DEP-W1` | **Vercel Null-Deploy** | Infra | Edge-Sync | `git commit --allow-empty` |
| AUD-W1 | **Fleet Health Check** | Audit | Checklist v1 | `python .agent/scripts/checklist.py` |

## 💰 Monetization & Product Workflows

| ID | Name | Role | Standard | Tooling |
| :--- | :--- | :--- | :--- | :--- |
| `MON-W1` | **Whop Product Launch** | Product | Launch v1.0 | `WHOP-SETUP-CHECKLIST.md` |
| `MON-W2` | **Revenue Logging** | Product | Comms v1.1 | `/api/whop-webhook` |
| `MKT-W1` | **Claude Design Pipeline**| Media | Handoff v1.1 | `scripts/claude-design-media-pipeline.sh` |
| `PRD-W1` | **Starter Kit Bundling** | Product | ZIP-v1 | `scripts/build-starter-kit.sh` |

## 📋 Operations & Tracking Workflows

| ID | Name | Role | Standard | Tooling |
| :--- | :--- | :--- | :--- | :--- |
| `OPS-W1` | **Task Lifecycle Tracking** | Ops | Project v1.2 | `scripts/acmi-task-manager.sh` |

---

## 🛠️ Optimization Backlog

1.  **[MON-W1] Automation**: Script the extraction of `WHOP-STARTER-KIT.md` fields into a JSON payload for the Whop API.
2.  **[PRD-W1] Automation**: Create `build-starter-kit.sh` to automatically gather the 7 core directories into the final ZIP.
3.  **[ACMI-W3] Orchestration**: Set up a `launchd` service to run the Semantic Sync every hour automatically.

---

## 🔍 Discovery
Workflows are stored in `~/clawd/docs/workflows/` and indexed here.
To execute an automated workflow, use the corresponding script in `tools/` or `.agent/scripts/`.

---
*Co-Authored-By: Gemini CLI <gemini-cli@madezmedia.local>*
