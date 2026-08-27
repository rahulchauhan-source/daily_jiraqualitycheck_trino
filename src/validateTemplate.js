/**
 * TEMPLATE-1143 required description sections.
 * A section is present when its heading (or close synonym) appears and,
 * for Requirements / Acceptance criteria, the expected cue phrases appear nearby.
 */

export const REQUIRED_SECTIONS = [
  {
    id: "requirements",
    label: "Requirements (As a / I want / So that)",
    headingPatterns: [
      /\brequirements?\b/i,
      /\buser\s*story\b/i,
    ],
    cuePatterns: [/\bas\s+a\b/i, /\bi\s+want\b/i, /\bso\s+that\b/i],
    requireAllCues: true,
  },
  {
    id: "acceptance_criteria",
    label: "Acceptance criteria (Given / When / Then)",
    headingPatterns: [
      /\bacceptance\s*criteria\b/i,
      /\bacceptance\s*criterion\b/i,
      /\bacs?\b/i,
    ],
    cuePatterns: [/\bgiven\b/i, /\bwhen\b/i, /\bthen\b/i],
    requireAllCues: true,
  },
  {
    id: "design",
    label: "Design",
    headingPatterns: [/\bdesign\b/i, /\btechnical\s*design\b/i, /\bsolution\s*design\b/i],
    cuePatterns: [],
    requireAllCues: false,
  },
  {
    id: "testing_regression",
    label: "Testing considerations / Regression impact",
    headingPatterns: [
      /\btesting\s*considerations?\b/i,
      /\bregression\s*impact\b/i,
      /\btesting\s*considerations?\s*\/\s*regression\s*impact\b/i,
      /\btest(ing)?\s*(notes|plan|impact)\b/i,
    ],
    cuePatterns: [/\bregression\b/i, /\btest(ing)?\b/i],
    requireAllCues: false,
    // Pass if either a matching heading exists OR both cue families are present.
    alternateCueMode: "any",
  },
  {
    id: "operational_impact",
    label: "Operational impact",
    headingPatterns: [
      /\boperational\s*impact\b/i,
      /\bops\s*impact\b/i,
      /\boperations?\s*impact\b/i,
    ],
    cuePatterns: [],
    requireAllCues: false,
  },
];

/** Flatten Jira ADF / HTML-ish description into searchable plain text. */
export function descriptionToText(description) {
  if (description == null) return "";
  if (typeof description === "string") {
    return stripMarkup(description);
  }
  if (typeof description === "object") {
    return stripMarkup(adfToText(description));
  }
  return String(description);
}

function stripMarkup(text) {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]+\}/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function adfToText(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join(" ");
  if (typeof node !== "object") return "";

  const parts = [];
  if (typeof node.text === "string") parts.push(node.text);
  if (node.content) parts.push(adfToText(node.content));
  // Separate block nodes with newlines so headings stay detectable.
  const blockTypes = new Set([
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "panel",
    "blockquote",
    "rule",
    "codeBlock",
    "table",
    "tableRow",
  ]);
  const joined = parts.join(" ");
  if (node.type && blockTypes.has(node.type)) {
    return `${joined}\n`;
  }
  return joined;
}

export function findMissingSections(description) {
  const text = descriptionToText(description);
  if (!text) {
    return REQUIRED_SECTIONS.map((s) => s.label);
  }

  const missing = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!sectionPresent(text, section)) {
      missing.push(section.label);
    }
  }
  return missing;
}

function sectionPresent(text, section) {
  const hasHeading = section.headingPatterns.some((re) => re.test(text));

  if (section.cuePatterns.length === 0) {
    return hasHeading;
  }

  const matchedCues = section.cuePatterns.filter((re) => re.test(text));
  const cuesOk = section.requireAllCues
    ? matchedCues.length === section.cuePatterns.length
    : matchedCues.length > 0;

  // For Requirements / AC: need heading (or strong cues) AND cue phrases.
  // Accept full cue set even without an explicit heading (common in pasted templates).
  if (section.requireAllCues) {
    return cuesOk && (hasHeading || cuesOk);
  }

  // Testing/regression: heading match OR relevant cues.
  if (section.alternateCueMode === "any") {
    return hasHeading || cuesOk;
  }

  return hasHeading && cuesOk;
}

export function assessIssue(issue, browseBaseUrl) {
  const key = issue.key;
  const fields = issue.fields || {};
  const summary = fields.summary || "(no summary)";
  const missingSections = findMissingSections(fields.description);
  const url = `${browseBaseUrl.replace(/\/$/, "")}/browse/${key}`;
  return {
    key,
    summary,
    url,
    compliant: missingSections.length === 0,
    missingSections,
  };
}

export function summarizeAssessments(assessments) {
  const compliant = assessments.filter((a) => a.compliant);
  const nonCompliant = assessments.filter((a) => !a.compliant);
  return {
    total: assessments.length,
    compliantCount: compliant.length,
    nonCompliantCount: nonCompliant.length,
    nonCompliant,
    compliantKeys: compliant.map((a) => a.key),
  };
}
