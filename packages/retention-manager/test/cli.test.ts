import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openMigratedFactoryDatabase } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { GcCliUsageError, parseGcCliArguments, runGcCli } from "../src/cli.js";

const temporaryDirectories: string[] = [];
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-retention-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function collectingIo(): {
  stdout: string[];
  stderr: string[];
  io: { stdout: (v: string) => void; stderr: (v: string) => void };
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
  };
}

describe("parseGcCliArguments", () => {
  it("defaults to a dry run in human output mode", () => {
    expect(parseGcCliArguments(["--config", "gc.json"])).toEqual({
      outputMode: "human",
      configFile: "gc.json",
      apply: false,
    });
  });

  it("accepts --apply and --json in any order", () => {
    expect(parseGcCliArguments(["--apply", "--json", "--config", "gc.json"])).toEqual({
      outputMode: "json",
      configFile: "gc.json",
      apply: true,
    });
    expect(parseGcCliArguments(["--config", "gc.json", "--json", "--apply"])).toEqual({
      outputMode: "json",
      configFile: "gc.json",
      apply: true,
    });
  });

  it("requires --config", () => {
    expect(() => parseGcCliArguments([])).toThrow(GcCliUsageError);
    expect(() => parseGcCliArguments(["--apply"])).toThrow("--config is required");
  });

  it("rejects unexpected arguments and duplicate flags", () => {
    expect(() => parseGcCliArguments(["--config", "gc.json", "extra"])).toThrow(
      "Unexpected argument",
    );
    expect(() => parseGcCliArguments(["--config", "gc.json", "--apply", "--apply"])).toThrow(
      "may only be provided once",
    );
  });
});

/** A configuration that is valid and fully self-consistent but has nothing
 * to reclaim, so CLI-level tests can focus on argument parsing, config
 * loading, and output rendering without re-exercising the selection logic
 * (covered exhaustively elsewhere in this package's test suite). */
function emptyConfigurationFile(): string {
  const root = temporaryDirectory();
  const databasePath = join(root, "control-plane.sqlite");
  openMigratedFactoryDatabase(databasePath).close();
  const configFile = join(root, "gc.json");
  writeFileSync(
    configFile,
    JSON.stringify({
      schemaVersion: 1,
      databasePath,
      evidenceRoots: [],
      checkpointRoots: [],
      runDirectoryRoots: [],
      verificationRoots: [],
      retentionWindowMs: 0,
      keepLatestCheckpointRevisions: 1,
    }),
  );
  return configFile;
}

describe("runGcCli", () => {
  it("dry-runs by default, reporting zero items and exiting 0", async () => {
    const { stdout, stderr, io } = collectingIo();
    const code = await runGcCli(["--config", emptyConfigurationFile()], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("dry-run");
    expect(stdout.join("")).toContain("0 item(s) selected");
    expect(stdout.join("")).toContain("Pass --apply");
  });

  it("emits machine-readable JSON with --json", async () => {
    const { stdout, io } = collectingIo();
    const code = await runGcCli(["--config", emptyConfigurationFile(), "--json"], io);

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.join("")) as { ok: boolean; result: { mode: string } };
    expect(parsed).toMatchObject({ ok: true, result: { mode: "dry-run" } });
  });

  it("applies when --apply is passed, reporting the reclaimed count", async () => {
    const { stdout, io } = collectingIo();
    const code = await runGcCli(["--config", emptyConfigurationFile(), "--apply"], io);

    expect(code).toBe(0);
    expect(stdout.join("")).toContain("reclaimed 0/0 item(s)");
  });

  it("exits 2 on a usage error without touching the filesystem", async () => {
    const { stdout, stderr, io } = collectingIo();
    const code = await runGcCli([], io);

    expect(code).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("factory-gc.usage");
  });

  it("exits nonzero with a clear error when the config file is missing", async () => {
    const { stderr, io } = collectingIo();
    const code = await runGcCli(["--config", join(temporaryDirectory(), "missing.json")], io);

    expect(code).toBe(2);
    expect(stderr.join("")).toContain("Could not read the gc configuration file");
  });

  it("exits nonzero with a clear error when the config file is not valid JSON", async () => {
    const root = temporaryDirectory();
    const configFile = join(root, "gc.json");
    writeFileSync(configFile, "{not json");
    const { stderr, io } = collectingIo();

    const code = await runGcCli(["--config", configFile], io);

    expect(code).toBe(2);
    expect(stderr.join("")).toContain("not valid JSON");
  });

  it("exits nonzero when the configuration does not match the expected shape", async () => {
    const root = temporaryDirectory();
    const configFile = join(root, "gc.json");
    writeFileSync(configFile, JSON.stringify({ schemaVersion: 1 }));
    const { stderr, io } = collectingIo();

    const code = await runGcCli(["--config", configFile], io);

    expect(code).toBe(1);
    expect(stderr.join("")).toContain("factory-gc.failed");
  });

  it("refuses (with a refused-not-usage error) when the control-plane database is missing", async () => {
    const root = temporaryDirectory();
    const configFile = join(root, "gc.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        schemaVersion: 1,
        databasePath: join(root, "does-not-exist.sqlite"),
        evidenceRoots: [],
        checkpointRoots: [],
        runDirectoryRoots: [],
        verificationRoots: [],
        retentionWindowMs: 0,
        keepLatestCheckpointRevisions: 1,
      }),
    );
    const { stderr, io } = collectingIo();

    const code = await runGcCli(["--config", configFile], io);

    expect(code).toBe(1);
    expect(stderr.join("")).toContain("factory-gc.refused");
  });
});
