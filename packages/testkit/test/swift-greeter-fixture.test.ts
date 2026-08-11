import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TaskSpecV1Schema } from "@app-factory/contracts";

import {
  SWIFT_GREETER_ACCEPTANCE_INJECTION_PATH,
  SWIFT_GREETER_AUTHORIZED_WRITE_PATHS,
  SWIFT_GREETER_PROTECTED_PATHS,
  createInvalidFarewellTaskSpecSamples,
  injectTrustedFarewellAcceptanceTest,
  inspectSwiftGreeterTemplate,
  materializeSwiftGreeterFixture,
  runSwiftGreeterTests,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

function makeTemporaryRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-testkit-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Swift Greeter fixture materialization", () => {
  it("creates repeatable standalone Git baselines without changing the template", () => {
    const before = inspectSwiftGreeterTemplate();
    const first = materializeSwiftGreeterFixture({ temporaryRoot: makeTemporaryRoot() });
    const second = materializeSwiftGreeterFixture({ temporaryRoot: makeTemporaryRoot() });
    const after = inspectSwiftGreeterTemplate();

    expect(first.repositoryPath).not.toBe(second.repositoryPath);
    expect(existsSync(join(first.repositoryPath, ".git"))).toBe(true);
    expect(first.baseCommit).toBe(second.baseCommit);
    expect(first.baseTree).toBe(second.baseTree);
    expect(first.policyDigest).toBe(second.policyDigest);
    expect(first.protectedPathDigests).toEqual(second.protectedPathDigests);
    expect(first.protectedPathDigests.map(({ path }) => path)).toEqual(
      SWIFT_GREETER_PROTECTED_PATHS,
    );
    expect(TaskSpecV1Schema.parse(first.taskSpec)).toEqual(first.taskSpec);
    expect(first.taskSpec.base.commit).toBe(first.baseCommit);
    expect(first.taskSpec.policyDigest).toBe(first.policyDigest);
    expect(first.taskSpec.requestedScope.paths).toEqual(SWIFT_GREETER_AUTHORIZED_WRITE_PATHS);

    writeFileSync(
      join(first.repositoryPath, "Sources/Greeter/GreetingFormatter.swift"),
      "candidate-only change\n",
    );
    expect(inspectSwiftGreeterTemplate()).toEqual(before);
    expect(after).toEqual(before);
  });

  it("provides invalid trust-boundary samples that the TaskSpec schema rejects", () => {
    const fixture = materializeSwiftGreeterFixture({ temporaryRoot: makeTemporaryRoot() });
    const invalidSamples = createInvalidFarewellTaskSpecSamples(fixture.taskSpec);

    expect(invalidSamples.map(({ name }) => name)).toEqual([
      "parent-path-scope",
      "absolute-path-scope",
      "unknown-policy-override",
    ]);
    for (const sample of invalidSamples) {
      expect(TaskSpecV1Schema.safeParse(sample.value).success, sample.name).toBe(false);
    }
  });

  it("runs the baseline Swift test only when explicitly requested", { timeout: 120_000 }, () => {
    const before = inspectSwiftGreeterTemplate();
    const fixture = materializeSwiftGreeterFixture({ temporaryRoot: makeTemporaryRoot() });

    expect(existsSync(join(fixture.repositoryPath, ".build"))).toBe(false);
    expect(
      readFileSync(join(fixture.repositoryPath, "Sources/Greeter/GreetingFormatter.swift"), "utf8"),
    ).not.toContain("farewell");

    const result = runSwiftGreeterTests(fixture.repositoryPath);

    expect(result.passed, `${result.stdout}\n${result.stderr}`).toBe(true);
    expect(result.args).toEqual(["test", "--package-path", fixture.repositoryPath]);
    expect(existsSync(join(fixture.repositoryPath, ".build"))).toBe(true);
    expect(inspectSwiftGreeterTemplate()).toEqual(before);
  });

  it("injects the trusted acceptance test from the canonical template and never overwrites it", () => {
    const fixture = materializeSwiftGreeterFixture({ temporaryRoot: makeTemporaryRoot() });
    const injected = injectTrustedFarewellAcceptanceTest(fixture.repositoryPath);

    expect(injected.path).toBe(SWIFT_GREETER_ACCEPTANCE_INJECTION_PATH);
    expect(existsSync(join(fixture.repositoryPath, injected.path))).toBe(true);
    expect(() => injectTrustedFarewellAcceptanceTest(fixture.repositoryPath)).toThrow(
      /Refusing to overwrite/,
    );
  });
});
