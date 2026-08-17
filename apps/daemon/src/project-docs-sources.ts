import { readFileSync } from "node:fs";

import {
  AbsolutePathSchema,
  ProjectIdSchema,
  type AbsolutePath,
  type ProjectId,
} from "@app-factory/contracts";

const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_SOURCES = 100;

/**
 * One project's repo-docs source: where to read its mandated docs from, and whether it is actually
 * enrolled (has kernel attempt history, so it already appears in `listProjectSummaries()`) or merely
 * "observed" -- a real repository this factory knows about but has not yet enrolled, which
 * `buildStudioSnapshotV1` synthesizes into the dashboard as its own honest entry rather than
 * pretending it does not exist.
 */
export type ProjectDocsSourceV1 = Readonly<{
  projectId: ProjectId;
  name: string;
  repositoryRoot: AbsolutePath;
  enrolled: boolean;
}>;

export class ProjectDocsSourcesConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectDocsSourcesConfigError";
  }
}

function configError(message: string): never {
  throw new ProjectDocsSourcesConfigError(message);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSource(value: unknown, index: number): ProjectDocsSourceV1 {
  if (!isRecord(value)) configError(`sources[${String(index)}] must be an object.`);
  const keys = Object.keys(value).sort();
  const expected = ["enrolled", "name", "projectId", "repositoryRoot"];
  if (keys.length !== expected.length || keys.some((key, position) => key !== expected[position])) {
    configError(`sources[${String(index)}] must have exactly the keys: ${expected.join(", ")}.`);
  }
  const projectId = ProjectIdSchema.safeParse(value.projectId);
  if (!projectId.success) configError(`sources[${String(index)}].projectId must be a project ID.`);
  if (typeof value.name !== "string" || value.name.length < 1 || value.name.length > 200) {
    configError(`sources[${String(index)}].name must be non-empty text (max 200 characters).`);
  }
  const repositoryRoot = AbsolutePathSchema.safeParse(value.repositoryRoot);
  if (!repositoryRoot.success) {
    configError(`sources[${String(index)}].repositoryRoot must be a normalized absolute path.`);
  }
  if (typeof value.enrolled !== "boolean") {
    configError(`sources[${String(index)}].enrolled must be a boolean.`);
  }
  return {
    projectId: projectId.data,
    name: value.name,
    repositoryRoot: repositoryRoot.data,
    enrolled: value.enrolled,
  };
}

function parseConfig(bytes: Buffer): readonly ProjectDocsSourceV1[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    configError("APP_FACTORY_PROJECT_DOCS_SOURCES must contain valid JSON.");
  }
  if (!isRecord(parsed)) configError("APP_FACTORY_PROJECT_DOCS_SOURCES must be a JSON object.");
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || !keys.includes("schemaVersion") || !keys.includes("sources")) {
    configError("APP_FACTORY_PROJECT_DOCS_SOURCES must have exactly {schemaVersion, sources}.");
  }
  if (parsed.schemaVersion !== 1)
    configError("APP_FACTORY_PROJECT_DOCS_SOURCES.schemaVersion must be 1.");
  if (!Array.isArray(parsed.sources) || parsed.sources.length > MAX_SOURCES) {
    configError(
      `APP_FACTORY_PROJECT_DOCS_SOURCES.sources must be an array of at most ${String(MAX_SOURCES)} entries.`,
    );
  }
  const sources = parsed.sources.map((entry, index) => parseSource(entry, index));
  const projectIds = new Set(sources.map((source) => source.projectId));
  if (projectIds.size !== sources.length) {
    configError("APP_FACTORY_PROJECT_DOCS_SOURCES.sources must have unique projectIds.");
  }
  return sources;
}

/**
 * Loads the optional per-deployment list of project repo-docs sources from
 * `APP_FACTORY_PROJECT_DOCS_SOURCES` (a path to a small JSON config file). Absent or empty env var
 * -> an empty list, not an error: `studio.snapshot` behaves exactly as it did before this file
 * existed for every daemon that has not opted in. A *present* env var that fails to parse or
 * validate fails closed (throws) rather than silently reporting zero sources, so a typo in the
 * config cannot silently make configured projects disappear from the dashboard without a visible
 * daemon startup failure.
 */
export function loadProjectDocsSourcesV1(
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly ProjectDocsSourceV1[] {
  const path = env.APP_FACTORY_PROJECT_DOCS_SOURCES;
  if (path === undefined || path.length === 0) return [];
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    configError(
      `APP_FACTORY_PROJECT_DOCS_SOURCES points at ${path}, which could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (bytes.byteLength > MAX_CONFIG_BYTES) {
    configError(
      `APP_FACTORY_PROJECT_DOCS_SOURCES at ${path} exceeds ${String(MAX_CONFIG_BYTES)} bytes.`,
    );
  }
  return parseConfig(bytes);
}
