# daily_jiraqualitycheck_trino

Hourly Cursor automation helper: find PLF Stories created since start of day with `labels = TrinoMigration` **or** `component = "Team Trino Migration"`, validate descriptions against **TEMPLATE-1143**, and publish a short compliance report to Confluence (retaining 3 days).

## Required TEMPLATE-1143 sections

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
| `JIRA_BASE_URL` | e.g. `https://regnology-cloud.atlassian.net` |
| `JIRA_EMAIL` | Atlassian account email |
| `JIRA_API_TOKEN` | Jira API token (read access to PLF) |
| `CONFLUENCE_BASE_URL` | e.g. `https://confluence.regnology.net` |
| `CONFLUENCE_PAGE_ID` | Numeric id for [results page](https://confluence.regnology.net/x/7BRYEg) |
| `CONFLUENCE_API_TOKEN` / password | Confluence write access |

Without these, the check exits non-zero and writes a blocked report under `reports/`.

## Output

- Console summary: compliant count, non-compliant list (`key` / summary / URL / missing sections), or `none found`
- Confluence page updated with today's section; report blocks older than 3 days removed
- Local markdown copy in `reports/YYYY-MM-DD.md`

## Cursor automation notes

- Atlassian MCP plugin skills expect OAuth; this cloud environment currently has **no authenticated Atlassian MCP** and **no API tokens**.
- Inject the env vars above (or enable Atlassian MCP auth) for live hourly runs to succeed.
