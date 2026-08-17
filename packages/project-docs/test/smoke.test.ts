import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { mapCorpusLifecycleStageToCanonicalV1, readProjectDocsSnapshot } from "../src/index.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRepo(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "project-docs-smoke-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("readProjectDocsSnapshot smoke test", () => {
  it("reads a minimal well-formed repository", () => {
    const root = makeRepo({
      "docs/STATUS.md": [
        "# Project Status",
        "",
        "Last verified: 2026-08-16",
        "",
        "## Lifecycle status",
        "",
        "`verification_pending`",
        "",
        "## Verified on 2026-08-13",
        "",
        "All good.",
      ].join("\n"),
      "docs/RELEASE_CHECKLIST.md": ["# Release Checklist", "- [x] Item A", "- [ ] Item B"].join(
        "\n",
      ),
      "docs/BUGS.md": [
        "# Bugs",
        "",
        "| ID | Severity | Summary | Status |",
        "|---|---|---|---|",
        "| B-1 | high | Crash on launch | confirmed |",
        "| B-2 | low | Typo | resolved |",
      ].join("\n"),
      "docs/RISKS.md": [
        "# Risks",
        "",
        "| ID | Risk | Status |",
        "|---|---|---|",
        "| R-1 | Data loss | open |",
      ].join("\n"),
      "docs/DECISIONS.md": [
        "# Decisions",
        "",
        "## DEC-001 — Use SwiftData",
        "",
        "- **Status:** accepted",
        "- **Date Recorded:** 2026-07-01",
      ].join("\n"),
      "docs/ARCHITECTURE.md": "# Architecture\n",
      "docs/FEATURES.md": "# Features\n",
      "docs/ASSUMPTIONS.md": "# Assumptions\n",
      "docs/TEST_PLAN.md": "# Test plan\n",
      "docs/HANDOFF.md": "# Handoff\n",
      "quality/quality-manifest.json": JSON.stringify({
        qualityStandardVersion: "0.4.0",
        application: { name: "Example" },
        requiredTestSuites: ["unit", "ui"],
      }),
      "quality/completion-reports/EXAMPLE.json": JSON.stringify({ taskId: "EXAMPLE" }),
      "quality/completion-reports/TASK-001.json": JSON.stringify({
        taskId: "TASK-001",
        status: "verified",
        fakeDataUsedInProduction: false,
        humanReviewRequired: [],
        placeholdersRemaining: [],
      }),
    });

    const snapshot = readProjectDocsSnapshot(root, "2026-08-16T12:00:00.000Z");

    expect(snapshot.layout).toBe("docs");
    expect(snapshot.docs).toHaveLength(10);
    expect(snapshot.docs.every((doc) => doc.present)).toBe(true);
    expect(snapshot.lifecycleStatus.value).toBe("verification_pending");
    expect(snapshot.lastVerifiedAt.value).toBe("2026-08-16");
    expect(snapshot.statusDatedEntries.value).toEqual([
      { heading: "Verified on 2026-08-13", date: "2026-08-13" },
    ]);
    expect(snapshot.releaseChecklist.value).toEqual({
      items: [
        { text: "Item A", checked: true },
        { text: "Item B", checked: false },
      ],
      totalItems: 2,
      checkedItems: 1,
    });
    expect(snapshot.openBugs.value?.totalCount).toBe(2);
    expect(snapshot.openBugs.value?.openCount).toBe(1);
    expect(snapshot.openRisks.value?.openCount).toBe(1);
    expect(snapshot.decisions.value).toEqual({
      entries: [
        { id: "DEC-001", title: "Use SwiftData", status: "accepted", dateRecorded: "2026-07-01" },
      ],
      count: 1,
    });
    expect(snapshot.qualityManifest.value).toEqual({
      qualityStandardVersion: "0.4.0",
      applicationName: "Example",
      requiredTestSuiteCount: 2,
    });
    expect(snapshot.completionReports.value?.count).toBe(1);
    expect(snapshot.completionReports.value?.reports[0]?.fileName).toBe("TASK-001.json");
    expect(snapshot.snapshotDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    expect(mapCorpusLifecycleStageToCanonicalV1(snapshot.lifecycleStatus.value ?? "")).toBe("qa");
  });

  it("reports honest unavailability for a repository with no docs directory at all", () => {
    const root = makeRepo({ "README.md": "# Nothing here\n" });
    const snapshot = readProjectDocsSnapshot(root, "2026-08-16T12:00:00.000Z");

    expect(snapshot.layout).toBe("absent");
    expect(snapshot.docs.every((doc) => !doc.present)).toBe(true);
    expect(snapshot.lifecycleStatus).toEqual({
      value: null,
      unavailableReason: "STATUS.md is absent or unreadable",
      sources: [],
    });
    expect(snapshot.qualityManifest.value).toBeNull();
    expect(snapshot.qualityManifest.unavailableReason).toMatch(/quality-manifest\.json/);
  });

  it("resolves a capital-Docs layout and a root-level legacy fallback file", () => {
    const root = makeRepo({
      "Docs/STATUS.md": "# Project Status\n\n## Lifecycle status\n\n`beta`\n",
      "LAUNCH_READINESS.md": "irrelevant to the mandated set",
      // HANDOFF.md deliberately only at repo root, not inside Docs/, to exercise the legacy fallback.
      "HANDOFF.md": "# Handoff\n\nEverything you need to know.\n",
    });
    const snapshot = readProjectDocsSnapshot(root, "2026-08-16T12:00:00.000Z");

    expect(snapshot.layout).toBe("Docs");
    expect(snapshot.lifecycleStatus.value).toBe("beta");
    const handoff = snapshot.docs.find((doc) => doc.key === "handoff");
    expect(handoff?.present).toBe(true);
    expect(handoff?.legacySourced).toBe(true);
    expect(handoff?.source?.path).toBe("HANDOFF.md");
  });

  it("flags a superseded/stub doc without refusing to read it", () => {
    const root = makeRepo({
      "docs/STATUS.md": [
        "# Project Documentation (Superseded)",
        "",
        "- **Status:** `superseded`",
        "- **Canonical replacement:** `docs/README.md`",
        "",
        "## Lifecycle status",
        "",
        "`idea`",
      ].join("\n"),
    });
    const snapshot = readProjectDocsSnapshot(root, "2026-08-16T12:00:00.000Z");
    const status = snapshot.docs.find((doc) => doc.key === "status");
    expect(status?.present).toBe(true);
    expect(status?.looksSuperseded).toBe(true);
    // Still honestly parses the content that is there -- looksSuperseded is informational, not a refusal.
    expect(snapshot.lifecycleStatus.value).toBe("idea");
  });
});
