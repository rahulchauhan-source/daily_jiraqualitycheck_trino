#!/usr/bin/env node
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { getJiraConfig, searchStories, DEFAULT_JQL, DEFAULT_JIRA_BASE_URL } from "./jiraClient.js";
import {
  getConfluenceConfig,
  getPage,
  updatePage,
  markdownToStorage,
  assertConfluenceConfig,
} from "./confluenceClient.js";
import { assessIssue, summarizeAssessments } from "./validateTemplate.js";
import {
  formatReportMarkdown,
  formatConsoleSummary,
  mergeReportIntoPage,
  reportDateKey,
} from "./report.js";

const RETENTION_DAYS = Number(process.env.REPORT_RETENTION_DAYS || 3);
const TIME_ZONE = process.env.REPORT_TIMEZONE || "UTC";
const SKIP_CONFLUENCE = String(process.env.SKIP_CONFLUENCE || "").toLowerCase() === "true";
const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";
const RESULTS_DIR = path.resolve(process.env.RESULTS_DIR || "results");

async function pruneLocalResults(dir, { now, retentionDays, timeZone }) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const todayKey = reportDateKey(now, timeZone);
  const today = parseDateKey(todayKey);
  if (!today) return;

  for (const name of entries) {
    const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(name);
    if (!m) continue;
    const target = parseDateKey(m[1]);
    if (!target) continue;
    const diffDays = (today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000);
    if (diffDays >= retentionDays) {
      await unlink(path.join(dir, name));
      console.log(`Pruned local result older than ${retentionDays} days: ${name}`);
    }
  }
}

function parseDateKey(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

async function main() {
  const runAt = new Date();
  const jiraConfig = getJiraConfig();
  const confluenceConfig = getConfluenceConfig();
  const browseBase = jiraConfig.baseUrl || DEFAULT_JIRA_BASE_URL;

  let summary = { total: 0, compliantCount: 0, nonCompliantCount: 0, nonCompliant: [], compliantKeys: [] };
  let error = null;

  try {
    const issues = await searchStories(jiraConfig);
    const assessments = issues.map((issue) => assessIssue(issue, browseBase));
    summary = summarizeAssessments(assessments);
  } catch (err) {
    error = err.message || String(err);
  }

  const reportMd = formatReportMarkdown({
    summary,
    runAt,
    timeZone: TIME_ZONE,
    jql: jiraConfig.jql || DEFAULT_JQL,
    error,
  });

  const consoleText = formatConsoleSummary(summary, { error });
  console.log(consoleText);
  console.log("");
  console.log("--- markdown report ---");
  console.log(reportMd);

  await mkdir(RESULTS_DIR, { recursive: true });
  await pruneLocalResults(RESULTS_DIR, {
    now: runAt,
    retentionDays: RETENTION_DAYS,
    timeZone: TIME_ZONE,
  });
  const dateKey = reportDateKey(runAt, TIME_ZONE);
  const outFile = path.join(RESULTS_DIR, `${dateKey}.md`);
  await writeFile(outFile, reportMd, "utf8");
  console.log(`Wrote branch report: ${outFile}`);

  // Keep gitignored reports/ copy for local debugging parity with prior runs.
  const legacyDir = path.resolve("reports");
  await mkdir(legacyDir, { recursive: true });
  await writeFile(path.join(legacyDir, `${dateKey}.md`), reportMd, "utf8");

  if (SKIP_CONFLUENCE) {
    console.log("SKIP_CONFLUENCE=true — not publishing to Confluence.");
    if (error) process.exitCode = 2;
    return;
  }

  try {
    assertConfluenceConfig(confluenceConfig);
    if (DRY_RUN) {
      console.log("DRY_RUN=true — skipping Confluence write.");
      if (error) process.exitCode = 2;
      return;
    }

    const page = await getPage(confluenceConfig);
    const newStorageBlock = markdownToStorage(reportMd);
    const merged = mergeReportIntoPage(page.body, newStorageBlock, {
      now: runAt,
      retentionDays: RETENTION_DAYS,
      timeZone: TIME_ZONE,
    });
    await updatePage(confluenceConfig, {
      title: page.title,
      bodyStorage: merged,
      version: page.version,
    });
    console.log(
      `Published to Confluence page ${page.id} (${confluenceConfig.pageUrl || ""}); pruned reports older than ${RETENTION_DAYS} days.`
    );
  } catch (err) {
    console.error(`Confluence publish failed: ${err.message}`);
    process.exitCode = error ? 2 : 3;
    return;
  }

  if (error) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
