import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findMissingSections,
  descriptionToText,
  assessIssue,
  summarizeAssessments,
  REQUIRED_SECTIONS,
} from "../src/validateTemplate.js";

const FULL_TEMPLATE = `
h2. Requirements
As a data engineer
I want Trino catalogs migrated
So that reporting keeps working

h2. Acceptance criteria
Given a migrated catalog
When a user runs a query
Then results match Hive

h2. Design
Use shadow catalogs and cutover.

h2. Testing considerations / Regression impact
Regression suite on BI dashboards.

h2. Operational impact
No extra on-call load expected.
`;

describe("findMissingSections", () => {
  it("accepts a complete TEMPLATE-1143 description", () => {
    assert.deepEqual(findMissingSections(FULL_TEMPLATE), []);
  });

  it("flags empty description as missing all sections", () => {
    assert.equal(findMissingSections("").length, REQUIRED_SECTIONS.length);
    assert.equal(findMissingSections(null).length, REQUIRED_SECTIONS.length);
  });

  it("detects missing Design and Operational impact", () => {
    const text = `
Requirements
As a analyst I want access So that I can report
Acceptance criteria
Given x When y Then z
Testing considerations / Regression impact
Run smoke tests
`;
    const missing = findMissingSections(text);
    assert.ok(missing.includes("Design"));
    assert.ok(missing.includes("Operational impact"));
    assert.ok(!missing.includes("Requirements (As a / I want / So that)"));
    assert.ok(!missing.includes("Acceptance criteria (Given / When / Then)"));
  });

  it("requires Given/When/Then for acceptance criteria", () => {
    const text = `
Requirements
As a user I want a thing So that value
Acceptance criteria
Should work well
Design
N/A
Testing considerations / Regression impact
None
Operational impact
None
`;
    const missing = findMissingSections(text);
    assert.ok(missing.includes("Acceptance criteria (Given / When / Then)"));
  });

  it("reads ADF documents", () => {
    const adf = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Requirements" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "As a tester I want coverage So that quality holds" }],
        },
        { type: "heading", content: [{ type: "text", text: "Acceptance criteria" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Given env When deploy Then healthy" }],
        },
        { type: "heading", content: [{ type: "text", text: "Design" }] },
        { type: "paragraph", content: [{ type: "text", text: "Blue/green" }] },
        {
          type: "heading",
          content: [{ type: "text", text: "Testing considerations / Regression impact" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Regression pack" }] },
        { type: "heading", content: [{ type: "text", text: "Operational impact" }] },
        { type: "paragraph", content: [{ type: "text", text: "None" }] },
      ],
    };
    assert.equal(descriptionToText(adf).includes("Requirements"), true);
    assert.deepEqual(findMissingSections(adf), []);
  });
});

describe("assessIssue / summarize", () => {
  it("builds URLs and summary counts", () => {
    const issues = [
      {
        key: "PLF-1",
        fields: { summary: "Good story", description: FULL_TEMPLATE },
      },
      {
        key: "PLF-2",
        fields: { summary: "Bad story", description: "TODO" },
      },
    ];
    const assessments = issues.map((i) =>
      assessIssue(i, "https://regnology-cloud.atlassian.net")
    );
    const summary = summarizeAssessments(assessments);
    assert.equal(summary.total, 2);
    assert.equal(summary.compliantCount, 1);
    assert.equal(summary.nonCompliantCount, 1);
    assert.equal(summary.nonCompliant[0].key, "PLF-2");
    assert.equal(
      summary.nonCompliant[0].url,
      "https://regnology-cloud.atlassian.net/browse/PLF-2"
    );
  });
});
