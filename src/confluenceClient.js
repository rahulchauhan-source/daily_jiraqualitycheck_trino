/**
 * Confluence Server/DC + Cloud page update helpers.
 * Target page default: https://confluence.regnology.net/x/7BRYEg
 */

export function getConfluenceConfig(env = process.env) {
  const baseUrl = (env.CONFLUENCE_BASE_URL || "").replace(/\/$/, "");
  const pageId = env.CONFLUENCE_PAGE_ID || "";
  const pageUrl = env.CONFLUENCE_PAGE_URL || "https://confluence.regnology.net/x/7BRYEg";
  const email = env.CONFLUENCE_EMAIL || env.JIRA_EMAIL || env.ATLASSIAN_EMAIL || "";
  const token =
    env.CONFLUENCE_API_TOKEN ||
    env.CONFLUENCE_PASSWORD ||
    env.JIRA_API_TOKEN ||
    env.ATLASSIAN_API_TOKEN ||
    "";
  const isCloud = String(env.CONFLUENCE_CLOUD || "").toLowerCase() === "true";
  return { baseUrl, pageId, pageUrl, email, token, isCloud };
}

export function assertConfluenceConfig(config) {
  const missing = [];
  if (!config.baseUrl) missing.push("CONFLUENCE_BASE_URL");
  if (!config.email) missing.push("CONFLUENCE_EMAIL (or JIRA_EMAIL)");
  if (!config.token) missing.push("CONFLUENCE_API_TOKEN (or JIRA_API_TOKEN)");
  if (!config.pageId && !config.pageUrl) missing.push("CONFLUENCE_PAGE_ID or CONFLUENCE_PAGE_URL");
  if (missing.length) {
    const err = new Error(
      `Missing Confluence credentials/config: ${missing.join(", ")}. Cannot publish report.`
    );
    err.code = "MISSING_CONFLUENCE_CREDENTIALS";
    err.missing = missing;
    throw err;
  }
}

function authHeader(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function resolvePageId(config, fetchImpl) {
  if (config.pageId) return config.pageId;

  // Tiny link /x/<key> — resolve via Server/DC short-link or search is unreliable.
  // Prefer explicit CONFLUENCE_PAGE_ID. Attempt contentbody conversion via expand on tinyurl is not standard.
  // Fallback: if URL contains /pages/viewpage.action?pageId= or /pages/<id>
  const fromQuery = /[?&]pageId=(\d+)/.exec(config.pageUrl || "");
  if (fromQuery) return fromQuery[1];
  const fromPath = /\/pages\/(\d+)(?:\/|$)/.exec(config.pageUrl || "");
  if (fromPath) return fromPath[1];

  // Try Confluence tiny URL redirect to extract pageId
  if (config.pageUrl) {
    const response = await fetchImpl(config.pageUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Authorization: authHeader(config.email, config.token),
        Accept: "application/json, text/html",
      },
    });
    const location = response.headers.get("location") || "";
    const locId =
      /[?&]pageId=(\d+)/.exec(location)?.[1] ||
      /\/pages\/(\d+)(?:\/|$)/.exec(location)?.[1];
    if (locId) return locId;

    // Cloud wiki URLs: /wiki/spaces/X/pages/123/Title
    const cloudId = /\/pages\/(\d+)/.exec(location || config.pageUrl)?.[1];
    if (cloudId) return cloudId;
  }

  const err = new Error(
    "Could not resolve Confluence page id from CONFLUENCE_PAGE_URL. Set CONFLUENCE_PAGE_ID explicitly."
  );
  err.code = "CONFLUENCE_PAGE_ID_UNRESOLVED";
  throw err;
}

export async function getPage(config, { fetchImpl = fetch } = {}) {
  assertConfluenceConfig(config);
  const pageId = await resolvePageId(config, fetchImpl);
  const apiBase = config.isCloud
    ? `${config.baseUrl}/wiki/rest/api/content/${pageId}`
    : `${config.baseUrl}/rest/api/content/${pageId}`;
  const url = `${apiBase}?expand=body.storage,version,title`;
  const response = await fetchImpl(url, {
    headers: {
      Authorization: authHeader(config.email, config.token),
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Confluence get page failed (${response.status}): ${text.slice(0, 500)}`);
    err.code = "CONFLUENCE_GET_FAILED";
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  return {
    id: data.id || pageId,
    title: data.title,
    version: data.version?.number,
    body: data.body?.storage?.value || "",
  };
}

/**
 * Update page storage body. For markdown-oriented agents we wrap content in
 * <ac:structured-macro> is heavy; storage HTML with <p>/<h2>/<ul> from a simple converter.
 */
export async function updatePage(config, { title, bodyStorage, version, fetchImpl = fetch } = {}) {
  assertConfluenceConfig(config);
  const pageId = await resolvePageId(config, fetchImpl);
  const apiBase = config.isCloud
    ? `${config.baseUrl}/wiki/rest/api/content/${pageId}`
    : `${config.baseUrl}/rest/api/content/${pageId}`;

  const response = await fetchImpl(apiBase, {
    method: "PUT",
    headers: {
      Authorization: authHeader(config.email, config.token),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: pageId,
      type: "page",
      title,
      version: { number: version + 1 },
      body: {
        storage: {
          value: bodyStorage,
          representation: "storage",
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Confluence update failed (${response.status}): ${text.slice(0, 500)}`);
    err.code = "CONFLUENCE_UPDATE_FAILED";
    err.status = response.status;
    throw err;
  }
  return response.json();
}

/** Minimal markdown → Confluence storage XHTML for our report shape. */
export function markdownToStorage(markdown) {
  const lines = String(markdown).split("\n");
  const out = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw;
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (line.startsWith("<!--")) {
      flushList();
      out.push(line);
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flushList();
      out.push(`<h2>${escapeXml(inlineMd(h2[1]))}</h2>`);
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      flushList();
      out.push(`<h3>${escapeXml(inlineMd(h3[1]))}</h3>`);
      continue;
    }
    const li = /^-\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMdToStorage(li[1])}</li>`);
      continue;
    }
    // Indented continuation under list item
    const cont = /^\s{2}-\s+(.*)$/.exec(line);
    if (cont && inList) {
      out.push(`<li>${inlineMdToStorage(cont[1])}</li>`);
      continue;
    }
    flushList();
    out.push(`<p>${inlineMdToStorage(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}

function inlineMd(text) {
  return text;
}

function inlineMdToStorage(text) {
  let s = escapeXml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
