import {
  appendFileSync,
  chmodSync,
  closeSync,
  fstatSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readPrivateFile, readStablePrivateFileDescriptor } from "../src/secure-artifacts.js";

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
