import {
  appendFileSync,
  chmodSync,
  closeSync,
  fstatSync,
  linkSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createPrivateFileExclusive,
  readPrivateFile,
  readStablePrivateFileDescriptor,
} from "../src/secure-artifacts.js";

const temporaryDirectories: string[] = [];

function makeDirectory(): string {
  const directory = realpathSync(
    mkdtempSync(join(realpathSync(tmpdir()), "app-factory-private-artifact-")),
  );
  chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("bounded private artifact reads", () => {
  it("returns an exact stable snapshot at the configured byte limit", () => {
    const path = join(makeDirectory(), "artifact.bin");
    writeFileSync(path, "four", { mode: 0o600 });

    expect(readPrivateFile(path, 4)).toEqual(Buffer.from("four"));
    expect(() => readPrivateFile(path, 3)).toThrow(/exceeds its 3 byte limit/);
  });

  it("rejects same-inode growth between the path snapshot and descriptor read", () => {
    const path = join(makeDirectory(), "artifact.bin");
    writeFileSync(path, "four", { mode: 0o600 });
    const descriptor = openSync(path, "r");
    try {
      const beforeGrowth = fstatSync(descriptor);
      appendFileSync(path, "-grew");

      expect(() => readStablePrivateFileDescriptor(descriptor, beforeGrowth, 4)).toThrow(
        /identity or metadata changed|exceeds its 4 byte limit/,
      );
    } finally {
      closeSync(descriptor);
    }
  });
});

describe("atomic exclusive artifact publication", () => {
  it("round-trips exact content and leaves no temporary sibling behind", () => {
    const directory = makeDirectory();
    const path = join(directory, "artifact.json");
    const payload = Buffer.from('{"exact":true}\n', "utf8");

    createPrivateFileExclusive(path, payload);

    expect(readPrivateFile(path, 4_096)).toEqual(payload);
    expect(readdirSync(directory)).toEqual(["artifact.json"]);
  });

  it("rejects a conflicting publish and leaves the original content intact", () => {
    const directory = makeDirectory();
    const path = join(directory, "artifact.json");
    createPrivateFileExclusive(path, Buffer.from("first", "utf8"));

    expect(() => createPrivateFileExclusive(path, Buffer.from("second", "utf8"))).toThrow(/EEXIST/);
    expect(readPrivateFile(path, 4_096)).toEqual(Buffer.from("first", "utf8"));
    expect(readdirSync(directory)).toEqual(["artifact.json"]);
  });

  it(
    "never exposes a partially written artifact at its target path " +
      "(regression: a reader used to observe a stable-but-empty file mid-publish)",
    () => {
      const directory = makeDirectory();
      const path = join(directory, "artifact.json");
      // This mirrors the exact midpoint of createPrivateFileExclusive's publish: full content is
      // already fsynced to a private temporary sibling, but the target name has not been
      // published yet. Under the old create-at-target-then-write scheme, a concurrent reader's
      // before/after stability snapshot of the still-empty target file matched exactly (size 0
      // both times), so no race was detected and the reader received a "stable" empty buffer that
      // failed JSON parsing instead of either the complete content or a clean "does not exist".
      const temporaryPath = join(directory, ".artifact.json.999999.simulated-race.tmp");
      writeFileSync(temporaryPath, '{"exact":true}\n', { mode: 0o600 });

      expect(readPrivateFile(path, 4_096)).toBeNull();

      linkSync(temporaryPath, path);
      unlinkSync(temporaryPath);

      expect(readPrivateFile(path, 4_096)).toEqual(Buffer.from('{"exact":true}\n', "utf8"));
    },
  );
});
