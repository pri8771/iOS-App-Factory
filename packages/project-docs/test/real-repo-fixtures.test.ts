import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mapCorpusLifecycleStageToCanonicalV1, readProjectDocsSnapshot } from "../src/index.js";

/**
 * Fixtures cut read-only from the six real, currently-registered iOS App Factory repositories under
 * `/Users/pchordia/Documents/wip_apps/ios_apps/` (never modified): the ten mandated docs, the
 * quality manifest, and completion reports, copied verbatim into `test/fixtures/<repo>/` preserving
 * each repository's real directory layout and case (`Docs/` for hindsight, `docs/` for the other
 * five). This proves the parser and layout adapter against real, messy, cross-repo-inconsistent
 * documentation -- not just synthetic examples -- per the six format variants the survey found:
 * YAML frontmatter (Japa) vs none, a bold-mid-sentence lifecycle token (Japa) vs a plain one, a
 * prose "Last verified" date (Anjali) vs ISO (roam-ios) vs absent, and per-repo table column/ID
 * conventions.
 */

const FIXTURES_ROOT = fileURLToPath(new URL("fixtures/", import.meta.url));
const GENERATED_AT = "2026-08-16T12:00:00.000Z";

function snapshotFor(repo: string) {
  return readProjectDocsSnapshot(`${FIXTURES_ROOT}${repo}`, GENERATED_AT);
}

describe("real repository fixtures", () => {
  it("hindsight: capital-Docs layout, no frontmatter, no dated STATUS entries", () => {
    const snapshot = snapshotFor("hindsight");
    expect(snapshot.layout).toBe("Docs");
    expect(snapshot.docs.every((doc) => doc.present && !doc.legacySourced)).toBe(true);
    expect(snapshot.docs.every((doc) => !doc.looksSuperseded)).toBe(true);
    expect(snapshot.lifecycleStatus.value).toBe("verification_pending");
    expect(mapCorpusLifecycleStageToCanonicalV1(snapshot.lifecycleStatus.value ?? "")).toBe("qa");
    expect(snapshot.lastVerifiedAt.value).toBeNull();
    expect(snapshot.statusDatedEntries.value).toBeNull();
    expect(snapshot.releaseChecklist.value).toMatchObject({ totalItems: 22, checkedItems: 16 });
    expect(snapshot.openBugs.value).toMatchObject({ totalCount: 5, openCount: 2 });
    expect(snapshot.openRisks.value).toMatchObject({ totalCount: 15, openCount: 15 });
    expect(snapshot.decisions.value?.count).toBe(9);
    expect(snapshot.qualityManifest.value).toEqual({
      qualityStandardVersion: "0.2.0",
      applicationName: "Hindsight",
      requiredTestSuiteCount: 3,
    });
    expect(snapshot.completionReports.value?.count).toBe(5);
    expect(
      snapshot.completionReports.value?.reports.some(
        (report) => report.fileName === "EXAMPLE.json",
      ),
    ).toBe(false);
  });

  it("Japa: bold-mid-sentence lifecycle token, YAML frontmatter docs, dated reconciliation entries", () => {
    const snapshot = snapshotFor("Japa");
    expect(snapshot.layout).toBe("docs");
    expect(snapshot.lifecycleStatus.value).toBe("beta");
    expect(mapCorpusLifecycleStageToCanonicalV1(snapshot.lifecycleStatus.value ?? "")).toBe(
      "launch-prep",
    );
    expect(snapshot.statusDatedEntries.value).toHaveLength(5);
    expect(snapshot.releaseChecklist.value).toMatchObject({ totalItems: 26, checkedItems: 24 });
    expect(snapshot.openBugs.value).toMatchObject({ totalCount: 10, openCount: 10 });
    expect(snapshot.qualityManifest.value).toEqual({
      qualityStandardVersion: "0.4.0",
      applicationName: "Mala",
      requiredTestSuiteCount: 3,
    });
    // Japa's one real (non-example) completion report extends well beyond the guaranteed field set
    // (25 keys); only the guaranteed subset is read.
    expect(snapshot.completionReports.value?.count).toBe(1);
    expect(snapshot.completionReports.value?.reports[0]).toMatchObject({
      fileName: "REGISTER-JAPA-001.json",
    });
  });

  it("Svara: TestFlight-flavored release checklist, no completion-reports/EXAMPLE.json", () => {
    const snapshot = snapshotFor("Svara");
    expect(snapshot.layout).toBe("docs");
    expect(snapshot.lifecycleStatus.value).toBe("verification_pending");
    expect(snapshot.releaseChecklist.value).toMatchObject({ totalItems: 37, checkedItems: 19 });
    // BUGS.md mixes REL-### and UI-### ID prefixes in one table; RISKS.md uses a
    // "Mitigation / task" column name instead of "Mitigation" -- neither breaks the parser, since it
    // only looks for an ID/Summary-or-Risk/Status column by name, not a fixed schema.
    expect(snapshot.openBugs.value).toMatchObject({ totalCount: 23, openCount: 17 });
    expect(snapshot.openRisks.value).toMatchObject({ totalCount: 9, openCount: 9 });
    expect(snapshot.completionReports.value?.count).toBe(2);
  });

  it("Anjali: prose 'Last verified' date, docs/ARCHITECTURE.md overriding a duplicate root file", () => {
    const snapshot = snapshotFor("Anjali");
    expect(snapshot.layout).toBe("docs");
    expect(snapshot.lifecycleStatus.value).toBe("verification_pending");
    // "Last verified: 14 August 2026." (long-form prose) must normalize to ISO.
    expect(snapshot.lastVerifiedAt.value).toBe("2026-08-14");
    // The canonical docs/ARCHITECTURE.md resolves (not the non-mandated root duplicate); this
    // snapshot never even looks at the root file since docs/ARCHITECTURE.md exists.
    const architecture = snapshot.docs.find((doc) => doc.key === "architecture");
    expect(architecture?.present).toBe(true);
    expect(architecture?.legacySourced).toBe(false);
    expect(architecture?.source?.path).toBe("docs/ARCHITECTURE.md");
    expect(snapshot.decisions.value?.count).toBe(15);
    expect(snapshot.qualityManifest.value?.qualityStandardVersion).toBe("0.2.0");
    expect(snapshot.completionReports.value?.count).toBe(5);
  });

  it("aurafit: no root/docs LAUNCH_READINESS.md, 'Verified on <date>' dated entries", () => {
    const snapshot = snapshotFor("aurafit");
    expect(snapshot.layout).toBe("docs");
    expect(snapshot.lifecycleStatus.value).toBe("mvp_development");
    expect(mapCorpusLifecycleStageToCanonicalV1(snapshot.lifecycleStatus.value ?? "")).toBe(
      "building",
    );
    expect(snapshot.statusDatedEntries.value).toHaveLength(2);
    expect(
      snapshot.statusDatedEntries.value?.every((entry) => entry.heading.startsWith("Verified on")),
    ).toBe(true);
    expect(snapshot.releaseChecklist.value).toMatchObject({ totalItems: 30, checkedItems: 6 });
    expect(snapshot.completionReports.value?.count).toBe(3);
  });

  it("roam-ios: ISO 'Last verified', non-contiguous bug IDs, deprecated-stub root LAUNCH_READINESS.md untouched", () => {
    const snapshot = snapshotFor("roam-ios");
    expect(snapshot.layout).toBe("docs");
    expect(snapshot.lifecycleStatus.value).toBe("mvp_development");
    expect(snapshot.lastVerifiedAt.value).toBe("2026-08-16");
    expect(snapshot.releaseChecklist.value).toMatchObject({ totalItems: 27, checkedItems: 9 });
    expect(snapshot.openBugs.value).toMatchObject({ totalCount: 32, openCount: 22 });
    expect(snapshot.openRisks.value).toMatchObject({ totalCount: 24, openCount: 24 });
    // LAUNCH_READINESS.md is not in the mandated set at all, so its "historical_pointer" stub
    // content is simply never read by this snapshot.
    expect(snapshot.docs.some((doc) => doc.key === ("launchReadiness" as never))).toBe(false);
  });

  it("every fixture snapshot validates against ProjectDocsSnapshotV1 and is digest-stable", () => {
    for (const repo of ["hindsight", "Japa", "Svara", "Anjali", "aurafit", "roam-ios"]) {
      const first = snapshotFor(repo);
      const second = snapshotFor(repo);
      expect(second.snapshotDigest).toBe(first.snapshotDigest);
      expect(first.snapshotDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });
});
