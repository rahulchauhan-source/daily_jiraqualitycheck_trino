const DEFAULT_JQL =
  'project = PLF AND issuetype = Story AND created >= startOfDay() AND (labels = TrinoMigration OR component = "Team Trino Migration")';

export function getJiraConfig(env = process.env) {
  const baseUrl = (env.JIRA_BASE_URL || env.ATLASSIAN_BASE_URL || "").replace(/\/$/, "");
  const email = env.JIRA_EMAIL || env.ATLASSIAN_EMAIL || "";
  const token = env.JIRA_API_TOKEN || env.ATLASSIAN_API_TOKEN || "";
  const jql = env.JIRA_JQL || DEFAULT_JQL;
  return { baseUrl, email, token, jql };
}

export function assertJiraConfig(config) {
  const missing = [];
  if (!config.baseUrl) missing.push("JIRA_BASE_URL");
  if (!config.email) missing.push("JIRA_EMAIL");
  if (!config.token) missing.push("JIRA_API_TOKEN");
  if (missing.length) {
    const err = new Error(
      `Missing Jira credentials: ${missing.join(", ")}. Set env vars to query PLF stories.`
    );
    err.code = "MISSING_JIRA_CREDENTIALS";
    err.missing = missing;
    throw err;
  }
}

function authHeader(email, token) {
  const encoded = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Search Jira Cloud (API v3) with JQL. Paginates with nextPageToken when present,
 * falls back to startAt for older responses.
 */
export async function searchStories(config, { fetchImpl = fetch, maxResults = 50 } = {}) {
  assertJiraConfig(config);
  const issues = [];
  let nextPageToken = null;
  let startAt = 0;

  for (;;) {
    const url = new URL(`${config.baseUrl}/rest/api/3/search/jql`);
    // Prefer enhanced search endpoint; fall back handled below.
    let response;
    const body = {
      jql: config.jql,
      maxResults,
      fields: ["summary", "description", "labels", "components", "issuetype", "created"],
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    else body.startAt = startAt;

    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(config.email, config.token),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 404) {
      // Older Cloud tenants: classic /search
      return searchStoriesClassic(config, { fetchImpl, maxResults });
    }

    if (!response.ok) {
      const text = await response.text();
      const err = new Error(`Jira search failed (${response.status}): ${text.slice(0, 500)}`);
      err.code = "JIRA_SEARCH_FAILED";
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    issues.push(...(data.issues || []));

    if (data.nextPageToken) {
      nextPageToken = data.nextPageToken;
      continue;
    }
    if (data.isLast === false && (data.issues || []).length > 0) {
      startAt += (data.issues || []).length;
      continue;
    }
    break;
  }

  return issues;
}

async function searchStoriesClassic(config, { fetchImpl, maxResults }) {
  const issues = [];
  let startAt = 0;
  for (;;) {
    const url = new URL(`${config.baseUrl}/rest/api/3/search`);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(config.email, config.token),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql: config.jql,
        startAt,
        maxResults,
        fields: ["summary", "description", "labels", "components", "issuetype", "created"],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      const err = new Error(`Jira search failed (${response.status}): ${text.slice(0, 500)}`);
      err.code = "JIRA_SEARCH_FAILED";
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    const batch = data.issues || [];
    issues.push(...batch);
    startAt += batch.length;
    if (startAt >= (data.total || 0) || batch.length === 0) break;
  }
  return issues;
}

export { DEFAULT_JQL };
