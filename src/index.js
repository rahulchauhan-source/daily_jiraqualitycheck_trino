#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getJiraConfig, searchStories, DEFAULT_JQL } from "./jiraClient.js";
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

async function main() {
  const runAt = new Date();
  const jiraConfig = getJiraConfig();
  const confluenceConfig = getConfluenceConfig();
  const browseBase = jiraConfig.baseUrl || "https://regnology-cloud.atlassian.net";

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

  const outDir = path.resolve("reports");
  await mkdir(outDir, { recursive: true });
  const dateKey = reportDateKey(runAt, TIME_ZONE);
  const outFile = path.join(outDir, `${dateKey}.md`);
  await writeFile(outFile, reportMd, "utf8");
  console.log(`Wrote local report: ${outFile}`);

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
    // Page body may be storage HTML; convert our markers by working on a hybrid:
    // extract existing marker blocks from storage as-is, merge markdown report as storage.
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
