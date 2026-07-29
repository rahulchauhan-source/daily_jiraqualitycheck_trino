import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatReportMarkdown,
  pruneReports,
  mergeReportIntoPage,
  reportDateKey,
  formatConsoleSummary,
} from "../src/report.js";

describe("report retention", () => {
  it("prunes reports older than 3 days", () => {
    const now = new Date("2026-07-28T15:00:00Z");
    const body = [
      "Intro text",
      "<!-- TRINO-TEMPLATE-CHECK:START:2026-07-28 -->\n## TEMPLATE-1143 check — 2026-07-28\n\n<!-- TRINO-TEMPLATE-CHECK:END -->",
      "<!-- TRINO-TEMPLATE-CHECK:START:2026-07-26 -->\n## TEMPLATE-1143 check — 2026-07-26\n\n<!-- TRINO-TEMPLATE-CHECK:END -->",
      "<!-- TRINO-TEMPLATE-CHECK:START:2026-07-24 -->\n## TEMPLATE-1143 check — 2026-07-24\n\n<!-- TRINO-TEMPLATE-CHECK:END -->",
    ].join("\n\n");

    const pruned = pruneReports(body, { now, retentionDays: 3, timeZone: "UTC" });
    assert.match(pruned, /2026-07-28/);
    assert.match(pruned, /2026-07-26/);
    assert.doesNotMatch(pruned, /2026-07-24/);
    assert.match(pruned, /Intro text/);
  });

  it("replaces same-day report on merge", () => {
    const now = new Date("2026-07-28T15:00:00Z");
    const existing = formatReportMarkdown({
      summary: { total: 0, compliantCount: 0, nonCompliantCount: 0, nonCompliant: [], compliantKeys: [] },
      runAt: now,
      timeZone: "UTC",
      jql: "project = PLF",
    });
    const updated = formatReportMarkdown({
      summary: {
        total: 1,
        compliantCount: 1,
        nonCompliantCount: 0,
        nonCompliant: [],
        compliantKeys: ["PLF-9"],
      },
      runAt: now,
      timeZone: "UTC",
      jql: "project = PLF",
    });
    const merged = mergeReportIntoPage(existing, updated, {
      now,
      retentionDays: 3,
      timeZone: "UTC",
    });
    const starts = merged.match(/TRINO-TEMPLATE-CHECK:START:2026-07-28/g) || [];
    assert.equal(starts.length, 1);
    assert.match(merged, /PLF-9/);
  });
});

describe("formatters", () => {
  it("reports none found", () => {
    const text = formatConsoleSummary({
      total: 0,
      compliantCount: 0,
      nonCompliantCount: 0,
      nonCompliant: [],
    });
    assert.match(text, /none found/);
  });

  it("reportDateKey is stable UTC", () => {
    assert.equal(reportDateKey(new Date("2026-07-28T01:02:03Z"), "UTC"), "2026-07-28");
  });
});
