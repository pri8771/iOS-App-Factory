import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseSupervisorIdentity,
  parseSupervisorIdentityV1,
  parseSupervisorIdentityV2,
  readSupervisorStateFile,
  removeSupervisorStateFile,
  withSupervisorPrimaryChild,
  writeSupervisorStateFile,
  type SupervisorIdentityV1,
} from "../src/index.js";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000001";
const temporaryDirectories: string[] = [];

function makeDirectory(): string {
  const directory = realpathSync(
    mkdtempSync(join(realpathSync(tmpdir()), "app-factory-supervisor-state-")),
  );
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

  it("requires a primary-child witness to be distinct and in the persisted process group", () => {
    expect(
      parseSupervisorIdentityV2({
        ...identity(),
        schemaVersion: 2,
        primaryChild: {
          pid: 2345,
          processStartIdentity: "child-start-one",
          processGroupId: 1234,
        },
      }).primaryChild,
    ).toEqual({
      pid: 2345,
      processStartIdentity: "child-start-one",
      processGroupId: 1234,
    });
    expect(() =>
      parseSupervisorIdentityV2({
        ...identity(),
        schemaVersion: 2,
        primaryChild: {
          pid: 1234,
          processStartIdentity: "child-start-one",
          processGroupId: 1234,
        },
      }),
    ).toThrow(/differ/);
    expect(() =>
      parseSupervisorIdentityV2({
        ...identity(),
        schemaVersion: 2,
        primaryChild: {
          pid: 2345,
          processStartIdentity: "child-start-one",
          processGroupId: 9999,
        },
      }),
    ).toThrow(/process group/);
  });

  it("keeps exact legacy V1 records readable while requiring V2 for witness fields", () => {
    expect(parseSupervisorIdentity(identity())).toEqual(identity());
    expect(() => parseSupervisorIdentityV1({ ...identity(), primaryChild: null })).toThrow(
      /unknown or missing fields/,
    );
  });
});

describe("atomic supervisor state file", () => {
  it("round-trips and atomically replaces a private state file", () => {
    const statePath = join(makeDirectory(), "private", "worker.json");
    const initial = identity();
    writeSupervisorStateFile(statePath, initial, null);
    expect(readSupervisorStateFile(statePath)).toEqual(identity());
    expect(lstatSync(statePath).mode & 0o777).toBe(0o600);
    expect(lstatSync(dirname(statePath)).mode & 0o777).toBe(0o700);

    const replacement = identity({ fence: 8 });
    writeSupervisorStateFile(statePath, replacement, initial);
    expect(readSupervisorStateFile(statePath)).toEqual(replacement);
    expect(readFileSync(statePath, "utf8")).toBe(`${JSON.stringify(replacement)}\n`);
    expect(removeSupervisorStateFile(statePath, replacement)).toBe(true);
    expect(removeSupervisorStateFile(statePath, replacement)).toBe(false);
  });

  it("round-trips a V2 primary-child witness behind an exact-record replacement", () => {
    const statePath = join(makeDirectory(), "worker.json");
    const initial = identity();
    const witnessed = withSupervisorPrimaryChild(initial, {
      pid: 2345,
      processGroupId: initial.processGroupId,
      processStartIdentity: "child-start-one",
    });

    writeSupervisorStateFile(statePath, initial, null);
    writeSupervisorStateFile(statePath, witnessed, initial);

    expect(readSupervisorStateFile(statePath)).toEqual(witnessed);
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
    expect(() => writeSupervisorStateFile(statePath, identity({ fence: 9 }), null)).toThrow(
      /real regular file/,
    );
    expect(readFileSync(targetPath, "utf8")).toBe(JSON.stringify(identity()));
  });

  it("refuses to traverse a symbolic-link state-directory ancestor", () => {
    const directory = makeDirectory();
    const targetDirectory = join(directory, "target");
    const linkedDirectory = join(directory, "linked");
    mkdirSync(targetDirectory, { mode: 0o700 });
    symlinkSync(targetDirectory, linkedDirectory);
    const statePath = join(linkedDirectory, "private", "worker.json");

    expect(() => readSupervisorStateFile(statePath)).toThrow(/symbolic-link ancestor/);
    expect(() => writeSupervisorStateFile(statePath, identity(), null)).toThrow(
      /symbolic-link ancestor/,
    );
    expect(() => removeSupervisorStateFile(statePath, identity())).toThrow(
      /symbolic-link ancestor/,
    );
    expect(existsSync(join(targetDirectory, "private"))).toBe(false);
  });

  it("does not let stale replacement or cleanup erase a successor record", () => {
    const statePath = join(makeDirectory(), "worker.json");
    const initial = identity({ fence: 7 });
    const successor = identity({ fence: 8 });
    writeSupervisorStateFile(statePath, initial, null);
    writeSupervisorStateFile(statePath, successor, initial);

    expect(() => writeSupervisorStateFile(statePath, identity({ fence: 9 }), initial)).toThrow(
      /expected record/,
    );
    expect(() => removeSupervisorStateFile(statePath, initial)).toThrow(/expected removal record/);
    expect(readSupervisorStateFile(statePath)).toEqual(successor);
  });

  it("fails closed while another process holds the state mutation lock", () => {
    const directory = makeDirectory();
    const statePath = join(directory, "worker.json");
    const initial = identity();
    writeSupervisorStateFile(statePath, initial, null);
    writeFileSync(join(directory, ".worker.json.mutation-lock"), "other-writer\n", {
      mode: 0o600,
    });

    expect(() => writeSupervisorStateFile(statePath, identity({ fence: 8 }), initial)).toThrow(
      /locked by another mutation/,
    );
    expect(() => removeSupervisorStateFile(statePath, initial)).toThrow(
      /locked by another mutation/,
    );
    expect(readSupervisorStateFile(statePath)).toEqual(initial);
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
