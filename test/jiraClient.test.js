import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getJiraConfig, assertJiraConfig, DEFAULT_JIRA_BASE_URL, DEFAULT_JQL } from "../src/jiraClient.js";

describe("getJiraConfig", () => {
  it("defaults base URL to jira.regnology.net", () => {
    const cfg = getJiraConfig({});
    assert.equal(cfg.baseUrl, DEFAULT_JIRA_BASE_URL);
    assert.equal(cfg.jql, DEFAULT_JQL);
    assert.equal(cfg.apiMode, "auto");
  });

  it("accepts JIRA_USER / JIRA_PASSWORD aliases", () => {
    const cfg = getJiraConfig({
      JIRA_USER: "bot",
      JIRA_PASSWORD: "secret",
    });
    assert.equal(cfg.email, "bot");
    assert.equal(cfg.token, "secret");
  });
});

describe("assertJiraConfig", () => {
  it("lists missing credential env vars", () => {
    assert.throws(
      () => assertJiraConfig({ baseUrl: "", email: "", token: "" }),
      /Missing Jira credentials/
    );
  });
});
