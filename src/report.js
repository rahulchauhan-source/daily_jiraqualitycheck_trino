/**
 * Build markdown / Confluence storage-friendly report sections.
 * Each daily report is wrapped in markers so older than 3 days can be pruned.
 */

export const REPORT_START = "<!-- TRINO-TEMPLATE-CHECK:START:";
export const REPORT_END = "<!-- TRINO-TEMPLATE-CHECK:END -->";

export function reportDateKey(date = new Date(), timeZone = "UTC") {
  // YYYY-MM-DD in the chosen timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatReportMarkdown({
  summary,
  runAt = new Date(),
  timeZone = "UTC",
  jql,
  error = null,
}) {
  const dateKey = reportDateKey(runAt, timeZone);
  const iso = runAt.toISOString();
  const lines = [];
  lines.push(`${REPORT_START}${dateKey} -->`);
  lines.push(`## TEMPLATE-1143 check — ${dateKey}`);
  lines.push("");
  lines.push(`- Run at: ${iso}`);
  if (jql) lines.push(`- JQL: \`${jql}\``);
  lines.push("");

  if (error) {
    lines.push(`**Status:** blocked — ${error}`);
    lines.push("");
    lines.push(REPORT_END);
    return lines.join("\n");
  }

  lines.push(`**Compliant count:** ${summary.compliantCount} / ${summary.total}`);
  lines.push("");

  if (summary.total === 0) {
    lines.push("none found");
  } else if (summary.nonCompliantCount === 0) {
    lines.push("All matching stories are TEMPLATE-1143 compliant.");
    if (summary.compliantKeys?.length) {
      lines.push("");
      lines.push(`Compliant: ${summary.compliantKeys.join(", ")}`);
    }
  } else {
    lines.push("### Non-compliant");
    lines.push("");
    for (const item of summary.nonCompliant) {
      const missing = item.missingSections.join("; ");
      lines.push(`- [${item.key}](${item.url}) — ${item.summary}`);
      lines.push(`  - Missing: ${missing}`);
    }
  }

  lines.push("");
  lines.push(REPORT_END);
  return lines.join("\n");
}

/**
 * Keep report blocks whose dateKey is within retentionDays (inclusive of today).
 * Unknown/malformed blocks are dropped.
 */
export function pruneReports(pageBody, { now = new Date(), retentionDays = 3, timeZone = "UTC" } = {}) {
  const body = pageBody || "";
  const blockRe =
    /<!-- TRINO-TEMPLATE-CHECK:START:(\d{4}-\d{2}-\d{2}) -->([\s\S]*?)<!-- TRINO-TEMPLATE-CHECK:END -->/g;

  const kept = [];
  let match;
  while ((match = blockRe.exec(body)) !== null) {
    const dateKey = match[1];
    if (isWithinRetention(dateKey, now, retentionDays, timeZone)) {
      kept.push(match[0].trim());
    }
  }

  // Preserve any intro content before the first report marker.
  const firstMarker = body.indexOf(REPORT_START);
  const intro = firstMarker === -1 ? body.trim() : body.slice(0, firstMarker).trim();

  const parts = [];
  if (intro) parts.push(intro);
  parts.push(...kept);
  return parts.join("\n\n").trim() + (parts.length ? "\n" : "");
}

export function mergeReportIntoPage(pageBody, newReport, options) {
  const pruned = pruneReports(pageBody, options);
  // Replace same-day report if re-run; otherwise prepend newest.
  const dateKeyMatch = newReport.match(/TRINO-TEMPLATE-CHECK:START:(\d{4}-\d{2}-\d{2})/);
  const dateKey = dateKeyMatch?.[1];
  let withoutSameDay = pruned;
  if (dateKey) {
    const sameDayRe = new RegExp(
      `<!-- TRINO-TEMPLATE-CHECK:START:${dateKey} -->[\\s\\S]*?<!-- TRINO-TEMPLATE-CHECK:END -->\\n?`,
      "g"
    );
    withoutSameDay = withoutSameDay.replace(sameDayRe, "").trim();
  }

  const introAndOld = withoutSameDay;
  // Put newest report after intro, before older reports.
  const firstOld = introAndOld.indexOf(REPORT_START);
  if (firstOld === -1) {
    return [introAndOld, newReport].filter(Boolean).join("\n\n").trim() + "\n";
  }
  const intro = introAndOld.slice(0, firstOld).trim();
  const older = introAndOld.slice(firstOld).trim();
  return [intro, newReport.trim(), older].filter(Boolean).join("\n\n").trim() + "\n";
}

function isWithinRetention(dateKey, now, retentionDays, timeZone) {
  const todayKey = reportDateKey(now, timeZone);
  const today = parseDateKey(todayKey);
  const target = parseDateKey(dateKey);
  if (!today || !target) return false;
  const diffMs = today.getTime() - target.getTime();
  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  return diffDays >= 0 && diffDays < retentionDays;
}

function parseDateKey(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Short console report for automation run output. */
export function formatConsoleSummary(summary, { error } = {}) {
  if (error) {
    return [`BLOCKED: ${error}`, "Compliant count: n/a", "Non-compliant: n/a"].join("\n");
  }
  if (summary.total === 0) {
    return ["Compliant count: 0 / 0", "none found"].join("\n");
  }
  const lines = [`Compliant count: ${summary.compliantCount} / ${summary.total}`];
  if (summary.nonCompliantCount === 0) {
    lines.push("Non-compliant: none");
  } else {
    lines.push("Non-compliant:");
    for (const item of summary.nonCompliant) {
      lines.push(
        `- ${item.key} | ${item.summary} | ${item.url} | missing: ${item.missingSections.join(", ")}`
      );
    }
  }
  return lines.join("\n");
}
