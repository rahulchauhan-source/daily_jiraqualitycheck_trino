# daily_jiraqualitycheck_trino

Hourly Cursor automation helper: find PLF Stories created since start of day with `labels = TrinoMigration` **or** `component = "Team Trino Migration"`, validate descriptions against **TEMPLATE-1143**, and publish a short compliance report to Confluence (retaining 3 days).

## Required TEMPLATE-1143 sections

Template reference: https://jira.regnology.net/browse/TEMPLATE-1143

1. Requirements (As a / I want / So that)
2. Acceptance criteria (Given / When / Then)
3. Design
4. Testing considerations / Regression impact
5. Operational impact

## JQL

```
project = PLF AND issuetype = Story AND created >= startOfDay() AND (labels = TrinoMigration OR component = "Team Trino Migration")
```

## Setup

1. Copy `.env.example` to `.env` and fill credentials (or inject the same vars into the Cursor automation environment).
2. `npm test`
3. `npm run check`

### Credentials needed

| Variable | Purpose |
|---|---|
| `JIRA_BASE_URL` | `https://jira.regnology.net` (Server/DC; default) |
| `JIRA_EMAIL` / `JIRA_USER` | Jira username or email |
| `JIRA_API_TOKEN` / `JIRA_PASSWORD` | API token or password (read access to PLF) |
| `CONFLUENCE_BASE_URL` | `https://confluence.regnology.net` |
| `CONFLUENCE_PAGE_ID` | Numeric id for [results page](https://confluence.regnology.net/x/7BRYEg) |
| `CONFLUENCE_API_TOKEN` / password | Confluence write access |

Without these (or without private-network reachability to `*.regnology.net`), the check exits non-zero and writes a blocked report under `results/`.

## Output

- Console summary: compliant count, non-compliant list (`key` / summary / URL / missing sections), or `none found`
- Confluence page updated with today's section; report blocks older than 3 days removed
- Branch-tracked markdown in `results/YYYY-MM-DD.md` (local copies older than 3 days pruned)

## Cursor automation notes

- PLF and TEMPLATE-1143 are on **Jira Server/DC** (`jira.regnology.net`), not Atlassian Cloud.
- Atlassian MCP plugin skills expect OAuth; this cloud environment currently has **no authenticated Atlassian MCP** and **no API tokens**.
- `jira.regnology.net` / `confluence.regnology.net` resolve to private IPs and reset TLS from public cloud egress — use a private worker/VPN **and** inject the env vars above for live hourly runs.
