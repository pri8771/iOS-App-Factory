import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseSupervisorIdentityV1,
  readSupervisorStateFile,
  removeSupervisorStateFile,
  writeSupervisorStateFile,
  type SupervisorIdentityV1,
} from "../src/index.js";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000001";
const temporaryDirectories: string[] = [];

function makeDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-supervisor-state-"));
  temporaryDirectories.push(directory);
  return directory;
}

function identity(overrides: Partial<SupervisorIdentityV1> = {}): SupervisorIdentityV1 {
  return {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    fence: 7,
    pid: 1234,
    processStartIdentity: "ps-lstart:Mon Aug 10 12:00:00 2026",
    bootIdentity: "darwin-bootsession:boot-one",
    processGroupId: 1234,
    launchedAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("supervisor identity", () => {
  it("accepts the exact versioned persisted identity", () => {
    expect(parseSupervisorIdentityV1(identity())).toEqual(identity());
  });

  it("rejects unknown fields, malformed IDs, and unsafe process identifiers", () => {
    expect(() => parseSupervisorIdentityV1({ ...identity(), unexpected: true })).toThrow(
      /unknown or missing fields/,
    );
    expect(() => parseSupervisorIdentityV1({ ...identity(), attemptId: "attempt-1" })).toThrow(
      /UUID/,
    );
    expect(() =>
      parseSupervisorIdentityV1({
        ...identity(),
        attemptId: "00000000-0000-4000-8000-00000000000A",
      }),
    ).toThrow(/lowercase canonical UUID/);
    expect(() => parseSupervisorIdentityV1({ ...identity(), pid: 1 })).toThrow(/greater than one/);
  });
});

describe("atomic supervisor state file", () => {
  it("round-trips and atomically replaces a private state file", () => {
    const statePath = join(makeDirectory(), "private", "worker.json");
    writeSupervisorStateFile(statePath, identity());
    expect(readSupervisorStateFile(statePath)).toEqual(identity());
    expect(lstatSync(statePath).mode & 0o777).toBe(0o600);
    expect(lstatSync(dirname(statePath)).mode & 0o777).toBe(0o700);

    const replacement = identity({ fence: 8 });
    writeSupervisorStateFile(statePath, replacement);
    expect(readSupervisorStateFile(statePath)).toEqual(replacement);
    expect(readFileSync(statePath, "utf8")).toBe(`${JSON.stringify(replacement)}\n`);
    expect(removeSupervisorStateFile(statePath)).toBe(true);
    expect(removeSupervisorStateFile(statePath)).toBe(false);
  });

  it("rejects state exposed to other users", () => {
    const directory = makeDirectory();
    const statePath = join(directory, "worker.json");
    writeFileSync(statePath, JSON.stringify(identity()), { mode: 0o644 });
    expect(() => readSupervisorStateFile(statePath)).toThrow(/permissions/);
    chmodSync(statePath, 0o600);
    expect(readSupervisorStateFile(statePath)).toEqual(identity());
  });

  it("refuses to follow a symbolic-link state path", () => {
    const directory = makeDirectory();
    const targetPath = join(directory, "target.json");
    const statePath = join(directory, "worker.json");
    writeFileSync(targetPath, JSON.stringify(identity()), { mode: 0o600 });
    symlinkSync(targetPath, statePath);

    expect(() => readSupervisorStateFile(statePath)).toThrow(/real regular file/);
    expect(() => writeSupervisorStateFile(statePath, identity({ fence: 9 }))).toThrow(
      /real regular file/,
    );
    expect(readFileSync(targetPath, "utf8")).toBe(JSON.stringify(identity()));
  });

  it("rejects malformed or oversized persisted JSON", () => {
    const directory = makeDirectory();
    const malformedPath = join(directory, "malformed.json");
    writeFileSync(malformedPath, "not-json", { mode: 0o600 });
    expect(() => readSupervisorStateFile(malformedPath)).toThrow();

    const oversizedPath = join(directory, "oversized.json");
    writeFileSync(oversizedPath, "x".repeat(16_385), { mode: 0o600 });
    expect(() => readSupervisorStateFile(oversizedPath)).toThrow(/maximum size/);
  });
});
