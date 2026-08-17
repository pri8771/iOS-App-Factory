import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectDocsSourcesConfigError,
  loadProjectDocsSourcesV1,
} from "../src/project-docs-sources.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "project-docs-sources-"));
  roots.push(dir);
  const path = join(dir, "sources.json");
  writeFileSync(path, content);
  return path;
}

describe("loadProjectDocsSourcesV1", () => {
  it("returns an empty list when the env var is unset or empty, without touching the filesystem", () => {
    expect(loadProjectDocsSourcesV1({})).toEqual([]);
    expect(loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: "" })).toEqual([]);
  });

  it("parses a valid config", () => {
    const projectId = randomUUID();
    const path = writeConfig(
      JSON.stringify({
        schemaVersion: 1,
        sources: [{ projectId, name: "Example", repositoryRoot: "/repos/example", enrolled: true }],
      }),
    );
    const sources = loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: path });
    expect(sources).toEqual([
      { projectId, name: "Example", repositoryRoot: "/repos/example", enrolled: true },
    ]);
  });

  it("fails closed for malformed JSON", () => {
    const path = writeConfig("{not json");
    expect(() => loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: path })).toThrow(
      ProjectDocsSourcesConfigError,
    );
  });

  it("fails closed for a config pointing at a nonexistent file", () => {
    expect(() =>
      loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: "/nonexistent/sources.json" }),
    ).toThrow(ProjectDocsSourcesConfigError);
  });

  it("fails closed for duplicate projectIds", () => {
    const projectId = randomUUID();
    const path = writeConfig(
      JSON.stringify({
        schemaVersion: 1,
        sources: [
          { projectId, name: "A", repositoryRoot: "/repos/a", enrolled: true },
          { projectId, name: "B", repositoryRoot: "/repos/b", enrolled: false },
        ],
      }),
    );
    expect(() => loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: path })).toThrow(
      /unique projectIds/,
    );
  });

  it("fails closed for a source with an extra or missing key", () => {
    const projectId = randomUUID();
    const path = writeConfig(
      JSON.stringify({
        schemaVersion: 1,
        sources: [
          { projectId, name: "A", repositoryRoot: "/repos/a", enrolled: true, extra: "nope" },
        ],
      }),
    );
    expect(() => loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: path })).toThrow(
      /exactly the keys/,
    );
  });

  it("fails closed for a non-absolute repositoryRoot", () => {
    const projectId = randomUUID();
    const path = writeConfig(
      JSON.stringify({
        schemaVersion: 1,
        sources: [{ projectId, name: "A", repositoryRoot: "relative/path", enrolled: true }],
      }),
    );
    expect(() => loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: path })).toThrow(
      /normalized absolute path/,
    );
  });

  it("fails closed for an unsupported schemaVersion", () => {
    const path = writeConfig(JSON.stringify({ schemaVersion: 2, sources: [] }));
    expect(() => loadProjectDocsSourcesV1({ APP_FACTORY_PROJECT_DOCS_SOURCES: path })).toThrow(
      /schemaVersion must be 1/,
    );
  });
});
