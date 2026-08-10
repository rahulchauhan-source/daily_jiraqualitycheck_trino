<!-- TEAM-WORKLOAD-CAPTURE:START:2026-08-10 -->
# Team Workload Capture — 2026-08-10

- Run at: 2026-08-10T03:30:00.657Z (cron `30 3 * * 1`)
- Automation: Team Workload Capture for my roster (week-by-week) (`aa29a7ac-908f-11f1-ba66-0e7d0216e441`)
- Branch: `cursor/team-workload-capture-dae2`
- Agent: https://cursor.com/agents/bc-a71f71b0-5844-4edc-9564-af61643abf5d
- Prompt path expected: `~/Documents/pr-reviews/team-workload-capture-prompt.md`

**Status:** blocked — full open PLF + DEFECT list per person with Keep/Reassign/Park suggestions could not be produced.

## Short verdict

No live Jira query ran. No roster was available. Per-person Keep / Reassign / Park recommendations are **not available** this week (would be fabricated without ticket + roster data).

## Intended output (not produced)

For each person on the roster:

1. Full open **PLF** issues
2. Full open **DEFECT** issues
3. Suggestion per issue: **Keep** / **Reassign** / **Park**

## Blockers

| # | Blocker | Evidence |
|---|---------|----------|
| 1 | Roster prompt missing | `~/Documents/pr-reviews/team-workload-capture-prompt.md` does not exist in this Cloud Agent VM (`~/Documents` was empty until created this run) |
| 2 | No Jira credentials | No `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` (or `JIRA_USER` / `JIRA_PASSWORD`) in environment |
| 3 | No Jira MCP | MCP catalog has only `Cursor Automation Tools` and `cursor-cloud`. No `regnlogy-jira-mcp`, no Atlassian MCP |
| 4 | Jira Server unreachable from public egress | `curl https://jira.regnology.net/` → TLS `Recv failure: Connection reset by peer` (private host pattern from sibling runs: `10.98.26.2`) |
| 5 | Cloud tenant is not a substitute | `https://regnology-cloud.atlassian.net` is reachable (HTTP 302) but sibling PLF automations confirmed **no PLF project** there |

## What was checked

- Prompt path and `~/Documents/pr-reviews/`
- Automation memory (empty — first workload-capture run)
- MCP servers available to this run
- Env for `JIRA_*` / `ATLASSIAN_*` / `CONFLUENCE_*`
- Network probe to `jira.regnology.net` and `regnology-cloud.atlassian.net`
- Sibling automation transcripts for PLF access patterns (same credentials/network/MCP blockers)

## Unblock checklist (for next Monday cron)

1. **Provision the prompt** at `~/Documents/pr-reviews/team-workload-capture-prompt.md` (or mount/sync Documents into the environment) including:
   - People roster (display name + Jira username/accountId/email)
   - PLF open-work JQL
   - DEFECT open-work JQL (project and/or issuetype)
   - Keep / Reassign / Park decision rules
2. **Inject secrets:** `JIRA_BASE_URL=https://jira.regnology.net`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
3. **Private worker / VPN** that can reach `jira.regnology.net`
4. Optionally **connect Jira MCP** (`regnlogy-jira-mcp` or authenticated Atlassian MCP that can hit Server/DC)

## Per-person open list

_None — access and roster blocked. No Keep/Reassign/Park suggestions generated._

<!-- TEAM-WORKLOAD-CAPTURE:END -->
