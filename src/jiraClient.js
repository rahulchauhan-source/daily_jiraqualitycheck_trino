const DEFAULT_JQL =
  'project = PLF AND issuetype = Story AND created >= startOfDay() AND (labels = TrinoMigration OR component = "Team Trino Migration")';

const DEFAULT_JIRA_BASE_URL = "https://jira.regnology.net";

export function getJiraConfig(env = process.env) {
  const baseUrl = (env.JIRA_BASE_URL || env.ATLASSIAN_BASE_URL || DEFAULT_JIRA_BASE_URL).replace(
    /\/$/,
    ""
  );
  const email = env.JIRA_EMAIL || env.ATLASSIAN_EMAIL || env.JIRA_USER || "";
  const token = env.JIRA_API_TOKEN || env.ATLASSIAN_API_TOKEN || env.JIRA_PASSWORD || "";
  const jql = env.JIRA_JQL || DEFAULT_JQL;
  // cloud | server | auto (default): try Cloud search/jql first, then Server/DC api/2
  const apiMode = (env.JIRA_API_MODE || "auto").toLowerCase();
  return { baseUrl, email, token, jql, apiMode };
}

export function assertJiraConfig(config) {
  const missing = [];
  if (!config.baseUrl) missing.push("JIRA_BASE_URL");
  if (!config.email) missing.push("JIRA_EMAIL (or JIRA_USER)");
  if (!config.token) missing.push("JIRA_API_TOKEN (or JIRA_PASSWORD)");
  if (missing.length) {
    const err = new Error(
      `Missing Jira credentials: ${missing.join(", ")}. Set env vars to query PLF stories on ${config.baseUrl || DEFAULT_JIRA_BASE_URL}.`
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

const ISSUE_FIELDS = ["summary", "description", "labels", "components", "issuetype", "created"];

/**
 * Search Jira with JQL. Supports Cloud (api/3 search/jql) and Server/DC (api/2 search).
 * Default base: https://jira.regnology.net (Server/DC).
 */
export async function searchStories(config, { fetchImpl = fetch, maxResults = 50 } = {}) {
  assertJiraConfig(config);
  const mode = config.apiMode || "auto";

  if (mode === "server" || mode === "dc") {
    return searchStoriesServer(config, { fetchImpl, maxResults });
  }
  if (mode === "cloud") {
    return searchStoriesCloud(config, { fetchImpl, maxResults });
  }

  // auto: prefer Server/DC for on-prem hosts; Cloud for atlassian.net
  if (/\.atlassian\.net$/i.test(new URL(config.baseUrl).hostname)) {
    try {
      return await searchStoriesCloud(config, { fetchImpl, maxResults });
    } catch (err) {
      if (err.status === 404 || err.status === 410) {
        return searchStoriesServer(config, { fetchImpl, maxResults });
      }
      throw err;
    }
  }

  try {
    return await searchStoriesServer(config, { fetchImpl, maxResults });
  } catch (err) {
    if (err.status === 404 || err.code === "FETCH_FAILED") {
      return searchStoriesCloud(config, { fetchImpl, maxResults });
    }
    throw err;
  }
}

async function searchStoriesCloud(config, { fetchImpl, maxResults }) {
  const issues = [];
  let nextPageToken = null;
  let startAt = 0;

  for (;;) {
    const url = new URL(`${config.baseUrl}/rest/api/3/search/jql`);
    const body = {
      jql: config.jql,
      maxResults,
      fields: ISSUE_FIELDS,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    else body.startAt = startAt;

    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: authHeader(config.email, config.token),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const wrapped = new Error(`Jira Cloud request failed: ${err.message}`);
      wrapped.code = "FETCH_FAILED";
      wrapped.cause = err;
      throw wrapped;
    }

    if (response.status === 404 || response.status === 410) {
      return searchStoriesClassicCloud(config, { fetchImpl, maxResults });
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

async function searchStoriesClassicCloud(config, { fetchImpl, maxResults }) {
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
        fields: ISSUE_FIELDS,
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

/** Jira Server / Data Center REST API v2 search. */
async function searchStoriesServer(config, { fetchImpl, maxResults }) {
  const issues = [];
  let startAt = 0;
  for (;;) {
    const url = new URL(`${config.baseUrl}/rest/api/2/search`);
    let response;
    try {
      response = await fetchImpl(url, {
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
          fields: ISSUE_FIELDS,
        }),
      });
    } catch (err) {
      const wrapped = new Error(
        `Jira Server/DC unreachable at ${config.baseUrl}: ${err.message}. Host may require VPN/private worker.`
      );
      wrapped.code = "FETCH_FAILED";
      wrapped.cause = err;
      throw wrapped;
    }

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

export { DEFAULT_JQL, DEFAULT_JIRA_BASE_URL };
