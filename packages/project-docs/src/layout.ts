import { readdirSync } from "node:fs";

import type { MandatedProjectDocKeyV1, ProjectDocsLayoutV1 } from "@app-factory/contracts";

import { readRawDoc, type RawDoc } from "./raw-doc.js";

/**
 * Canonical `docs/<FILE>.md` name for each mandated key. All six surveyed repositories
 * (hindsight, Japa, Svara, Anjali, aurafit, roam-ios) keep every one of these directly inside their
 * docs directory.
 */
export const MANDATED_DOC_FILE_NAMES_V1: Readonly<Record<MandatedProjectDocKeyV1, string>> = {
  status: "STATUS.md",
  architecture: "ARCHITECTURE.md",
  features: "FEATURES.md",
  bugs: "BUGS.md",
  decisions: "DECISIONS.md",
  risks: "RISKS.md",
  assumptions: "ASSUMPTIONS.md",
  testPlan: "TEST_PLAN.md",
  releaseChecklist: "RELEASE_CHECKLIST.md",
  handoff: "HANDOFF.md",
};

function listEntries(path: string): readonly string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/**
 * Resolves which docs directory this repository actually uses. Tries the 0.2.0-canonical lowercase
 * `docs` first, then the capitalized `Docs` the legacy/Gen1-2 convention (and hindsight, live) uses,
 * then falls back to a case-insensitive scan of the root listing for anything spelled `docs` in any
 * case. Returns `absent` when no such directory exists at all, honestly -- the reader never invents
 * a docs directory.
 */
export function resolveDocsDirectoryName(repositoryRoot: string): ProjectDocsLayoutV1 {
  const rootEntries = listEntries(repositoryRoot);
  if (rootEntries.includes("docs")) return "docs";
  if (rootEntries.includes("Docs")) return "Docs";
  const caseInsensitive = rootEntries.find((entry) => entry.toLowerCase() === "docs");
  if (caseInsensitive === "docs" || caseInsensitive === "Docs") return caseInsensitive;
  return "absent";
}

export type ResolvedMandatedDoc = Readonly<{
  doc: RawDoc;
  /** True when the file was found via a fallback (case-insensitive match, or a root-level
   * location) rather than the exact canonical `<docsDir>/<FILE>.md` path. */
  legacySourced: boolean;
}>;

const STUB_PATTERN =
  /(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*status:?\*\*|status:)\s*`?(superseded|historical_pointer|retired|deprecated)`?/i;

/** True when a doc's own leading content declares itself a stub/redirect -- the recurring
 * `Status: `superseded`` / `historical_pointer` / "Retired concept document" convention observed
 * across the six surveyed repositories (Svara's `docs/PROJECT_DOCUMENTATION.md`, roam-ios's root
 * `LAUNCH_READINESS.md`, roam-ios's `MARKETING_PLAN.md`/`BETA_TESTING_PLAN.md`). Only the first 20
 * lines are checked -- this is a leading-notice convention, not a claim about the whole document. */
export function looksSupersededV1(doc: RawDoc): boolean {
  const head = doc.lines.slice(0, 20).join("\n");
  return STUB_PATTERN.test(head) || /^\s*>?\s*\*\*retired concept document\.\*\*/im.test(head);
}

/**
 * Resolves one mandated doc key against a repository, trying in order: the canonical
 * `<docsDir>/<FILE>.md` path; a case-insensitive match against every entry actually in the docs
 * directory (handles a stray-case file inside an otherwise-consistent tree); and finally the same
 * file name at the repository root (the legacy/Gen1-2 convention this package also supports).
 * Returns `null` when none of those exist -- never inferred, never fabricated.
 */
export function resolveMandatedDoc(
  repositoryRoot: string,
  docsDirName: ProjectDocsLayoutV1,
  key: MandatedProjectDocKeyV1,
): ResolvedMandatedDoc | null {
  const fileName = MANDATED_DOC_FILE_NAMES_V1[key];

  if (docsDirName !== "absent") {
    const canonical = readRawDoc(repositoryRoot, `${docsDirName}/${fileName}`);
    if (canonical !== null) return { doc: canonical, legacySourced: false };

    const dirEntries = listEntries(`${repositoryRoot}/${docsDirName}`);
    const caseInsensitiveMatch = dirEntries.find(
      (entry) => entry.toLowerCase() === fileName.toLowerCase() && entry !== fileName,
    );
    if (caseInsensitiveMatch !== undefined) {
      const found = readRawDoc(repositoryRoot, `${docsDirName}/${caseInsensitiveMatch}`);
      if (found !== null) return { doc: found, legacySourced: true };
    }
  }

  // Legacy/Gen1-2 fallback: the same mandated file at the repository root.
  const atRoot = readRawDoc(repositoryRoot, fileName);
  if (atRoot !== null) return { doc: atRoot, legacySourced: true };

  return null;
}
