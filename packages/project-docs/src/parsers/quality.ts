import { readdirSync } from "node:fs";

import type {
  CompletionReportSummaryV1,
  CompletionReportsSummaryV1,
  ProjectDocsSourceRefV1,
  QualityManifestSummaryV1,
} from "@app-factory/contracts";

import { available, unavailable, type ParsedDocsField } from "../field-result.js";
import { readRawDoc, sourceRef, type RawDoc } from "../raw-doc.js";

const MAX_REPORTS = 200;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonDoc(doc: RawDoc): unknown | null {
  try {
    return JSON.parse(doc.text) as unknown;
  } catch {
    return null;
  }
}

/** Parses `quality/quality-manifest.json`. Tolerant of the three key-set variants observed
 * (minimal; `+notes`; Svara's `+canonicalTaskBacklog`/`+testFlightRequirements`) -- only the fields
 * this snapshot actually types are read; every other key is ignored rather than rejected. */
export function parseQualityManifest(
  repositoryRoot: string,
): ParsedDocsField<QualityManifestSummaryV1> {
  const doc = readRawDoc(repositoryRoot, "quality/quality-manifest.json");
  if (doc === null) return unavailable("quality/quality-manifest.json is absent or unreadable");
  const parsed = parseJsonDoc(doc);
  if (!isRecord(parsed)) return unavailable("quality/quality-manifest.json is not a JSON object");

  const qualityStandardVersion =
    typeof parsed.qualityStandardVersion === "string" ? parsed.qualityStandardVersion : null;
  const application = isRecord(parsed.application) ? parsed.application : null;
  const applicationName =
    application !== null && typeof application.name === "string" ? application.name : null;
  const requiredTestSuiteCount = Array.isArray(parsed.requiredTestSuites)
    ? parsed.requiredTestSuites.length
    : null;

  if (
    qualityStandardVersion === null &&
    applicationName === null &&
    requiredTestSuiteCount === null
  ) {
    return unavailable(
      "quality/quality-manifest.json parsed as JSON but had none of the recognized fields",
    );
  }
  return available({ qualityStandardVersion, applicationName, requiredTestSuiteCount }, [
    sourceRef(doc),
  ]);
}

function parseOneCompletionReport(fileName: string, doc: RawDoc): CompletionReportSummaryV1 | null {
  const parsed = parseJsonDoc(doc);
  if (!isRecord(parsed)) return null;
  const taskId = typeof parsed.taskId === "string" ? parsed.taskId : null;
  const status = typeof parsed.status === "string" ? parsed.status : null;
  const fakeDataUsedInProduction =
    typeof parsed.fakeDataUsedInProduction === "boolean" ? parsed.fakeDataUsedInProduction : null;
  const humanReviewRequiredCount = Array.isArray(parsed.humanReviewRequired)
    ? parsed.humanReviewRequired.length
    : null;
  const placeholdersRemainingCount = Array.isArray(parsed.placeholdersRemaining)
    ? parsed.placeholdersRemaining.length
    : null;
  return {
    fileName,
    taskId,
    status,
    fakeDataUsedInProduction,
    humanReviewRequiredCount,
    placeholdersRemainingCount,
  };
}

/** Parses every `quality/completion-reports/*.json` file except `EXAMPLE.json` (a template, not a
 * real report -- present in five of the six repositories, absent from Svara, so its absence is not
 * itself a signal). Real reports commonly extend well beyond the guaranteed fields this parser
 * reads (Japa's `REGISTER-JAPA-001.json` has 25 keys against the 12-key example); unrecognized keys
 * are ignored, never rejected. */
export function parseCompletionReports(
  repositoryRoot: string,
): ParsedDocsField<CompletionReportsSummaryV1> {
  let fileNames: readonly string[];
  try {
    fileNames = readdirSync(`${repositoryRoot}/quality/completion-reports`);
  } catch {
    return unavailable("quality/completion-reports is absent or unreadable");
  }
  const candidates = fileNames
    .filter((name) => name.toLowerCase().endsWith(".json") && name.toLowerCase() !== "example.json")
    .sort()
    .slice(0, MAX_REPORTS);
  if (candidates.length === 0) {
    return unavailable("quality/completion-reports has no non-example *.json reports");
  }

  const reports: CompletionReportSummaryV1[] = [];
  const sources: ProjectDocsSourceRefV1[] = [];
  for (const fileName of candidates) {
    const doc = readRawDoc(repositoryRoot, `quality/completion-reports/${fileName}`);
    if (doc === null) continue;
    const report = parseOneCompletionReport(fileName, doc);
    if (report === null) continue;
    reports.push(report);
    sources.push(sourceRef(doc));
  }
  if (reports.length === 0) {
    return unavailable("quality/completion-reports had files but none parsed as a JSON object");
  }
  return available({ reports, count: reports.length }, sources);
}
