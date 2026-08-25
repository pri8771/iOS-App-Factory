import { createHash } from "node:crypto";
import {
  createReadStream,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  ReleaseRunV1Schema,
  Sha256DigestSchema,
  type CommandRequestV1,
  type ExecutionAttemptV1,
  type IsoInstant,
  type ReleaseExportOptionsConfigV1,
  type ReleaseRunV1,
  type Sha256Digest,
} from "@app-factory/contracts";
import { sha256Digest } from "@app-factory/execution-engine";
import type { VerifiedExecutionEvidence } from "@app-factory/execution-engine";
import type { PromotedBrokerCommitV1 } from "@app-factory/git-workspace";
import type { FactoryRepositories } from "@app-factory/kernel";
import {
  launchPreparedSupervisedRun,
  openPreparedSupervisedRun,
  prepareSupervisedRun,
  reconcileSupervisedRun,
  waitForSupervisedRunRegistration,
  type CreateSupervisedRunIntentInput,
  type PreparedSupervisedRun,
  type SupervisedRunReceiptV1,
} from "@app-factory/process-supervisor";

import { readXcodegenProjectName } from "./planner-project-execution.js";
import {
  mapReleaseRunUpsertError,
  resolveVerifiedReleaseSourceV1,
  type ReleaseRunRuntimeRepositoriesPort,
} from "./release-run-runtime.js";
import type { RunExportMirrorPort } from "./run-export-command-runtime.js";
import { CommandHandlerError } from "./unix-command-server.js";
import {
  LocalExecutionProfileConfigurationError,
  readPrivateFile,
} from "./local-execution-profile.js";

/**
 * Release Rail Wave 4: `release.archive` -- allocates the build number, runs
 * `xcodegen generate` -> `xcodebuild archive` -> `xcodebuild -exportArchive` under
 * `@app-factory/process-supervisor` (the trusted, credential-shaped-value-capable release plane --
 * NOT `runTrustedVerification`, whose 8-name env allowlist rejects anything credential-shaped at
 * plan-build time and archiving needs the Keychain signing identity; see the release-rail plan's
 * architecture decision 2), and advances a `ReleaseRunV1` from `certified` to `archived`.
 *
 * This module is split into three pieces that `command-runtime.ts` composes exactly the way it
 * already composes `release.observe` (`release-command-runtime.ts`'s `observeRelease`):
 *
 * 1. `prepareReleaseArchive` -- fast, local-only work (DB reads, a CAS/stage check, re-verifying the
 *    source commit and its promotion, allocating the build number). Runs INSIDE the daemon's serial
 *    executor, exactly like `release.start`/`release.promote`.
 * 2. `ReleaseArchiverPort.archive` -- the actual `xcodebuild` work. Takes MINUTES (a real compiler
 *    and linker invocation) and must never stall every other command, so `command-runtime.ts` calls
 *    it OUTSIDE the serial executor -- the same `release.observe`/`signal.run-now` idiom this
 *    package already uses for "a real, slow, external round trip." Unlike those two, the round trip
 *    here is a local subprocess, not a network call, but the reason to exempt it is identical: the
 *    daemon must keep answering every other command while one release archives.
 * 3. `completeReleaseArchive` / `recordReleaseArchiveFailure` -- persists the outcome. Runs INSIDE
 *    the serial executor again, exactly like `release.observe`'s post-observation persist. A FAILED
 *    archive still writes a durable revision (architecture: a release run is resumable per stage,
 *    `ReleaseRunV1.stage` may legally hold across a CAS-incrementing write) carrying the captured
 *    failure detail in `run.notes` -- the plan's own risk note is that discarded failing-check
 *    output cost hours on 2026-08-21; this module never discards it.
 *
 * Version injection (architecture decision 3): `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION` are
 * passed to `xcodebuild archive` as build-setting arguments on its command line, never written into
 * `Info.plist` or `project.yml`. `Info.plist` is permanently protected (non-relaxable in
 * `classifyProtectedPath`, `packages/git-workspace/src/workspace.ts`) and the candidate tree this
 * run's source commit came from must stay immutable; this module never opens either file for
 * writing, and the promoted SOURCE repository's working tree it actually builds from is expected to
 * be `git status --porcelain` clean after every step except for the (gitignored) generated
 * `.xcodeproj` -- proven directly in this module's own tests.
 *
 * Argv arrays, never a shell: every step below is `spawn`ed by `process-supervisor` from a plain
 * `argv: readonly string[]`, with no `/bin/sh -c` layer in between. That sidesteps, by construction,
 * the exact class of bug the manual archive session hit today with the shell-scripted
 * `ios-xcodegen-v1` verification profile (`planner-project-execution.ts`): a scratch directory
 * containing a space silently truncated a `"$S/..."` shell-variable assignment and every check
 * failed with a bare "No such file or directory." An argv array has no such truncation point --
 * each element is passed to `execve` verbatim, spaces and all.
 */

const RELEASE_ARCHIVE_CONFIG_LABEL = "APP_FACTORY_RELEASE_CONFIG";
const MAX_RELEASE_ARCHIVE_CONFIG_BYTES = 16 * 1024;
const MAX_SUPERVISED_STEP_OUTPUT_BYTES = 16 * 1024 * 1024;
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const STDERR_TAIL_CHARS = 1_500;

// ---------------------------------------------------------------------------
// APP_FACTORY_RELEASE_CONFIG
// ---------------------------------------------------------------------------

/**
 * Names/identifiers only -- NEVER secrets (the signing identity lives in the macOS Keychain and is
 * never represented here, exactly like `ReleaseExportOptionsConfigV1`). This is the REVIEWED,
 * operator-controlled allowlist: `teamId`/`method`/`destination`/`signingStyle` here are what a
 * `release.archive` request's wire-level `exportOptions` MUST exactly match (fail closed otherwise)
 * -- the wire request is untrusted caller input, this file is what the operator reviewed and put on
 * disk, mirroring `CodexLocalAgentConfigurationV1.environmentAllowlist`'s "config declares what is
 * ALLOWED, the per-call spec must match" shape.
 */
export type ReleaseArchiveConfigV1 = Readonly<{
  schemaVersion: 1;
  xcodegenExecutable: string;
  xcodebuildExecutable: string;
  /** PATH the supervised subprocesses receive; must contain both executables' directories. */
  path: string;
  /** USER the supervised subprocesses receive (XcodeGen/Xcode refuse to run without one). */
  user: string;
  /** Private, absolute root under which every archive run gets its own scratch subdirectory. */
  scratchRoot: string;
  teamId: string;
  method: "app-store-connect";
  destination: "export";
  signingStyle: "automatic";
  xcodegenTimeoutMs: number;
  archiveTimeoutMs: number;
  exportTimeoutMs: number;
}>;

function configurationError(message: string, cause?: unknown): never {
  throw new LocalExecutionProfileConfigurationError(message, {
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    configurationError(
      `${RELEASE_ARCHIVE_CONFIG_LABEL}: ${label} must be a string of 1..${String(maximum)} characters.`,
    );
  }
  if (value.includes("\0")) {
    configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL}: ${label} must not contain NUL.`);
  }
  return value;
}

function absolutePathValue(value: unknown, label: string): string {
  const text = boundedString(value, label, 1_024);
  if (!isAbsolute(text) || resolve(text) !== text) {
    configurationError(
      `${RELEASE_ARCHIVE_CONFIG_LABEL}: ${label} must be a normalized absolute path.`,
    );
  }
  return text;
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    configurationError(
      `${RELEASE_ARCHIVE_CONFIG_LABEL}: ${label} must be an integer in ${String(minimum)}..${String(maximum)}.`,
    );
  }
  return value;
}

export function parseReleaseArchiveConfigV1(input: unknown): ReleaseArchiveConfigV1 {
  if (!isRecord(input)) {
    configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL} must be a JSON object.`);
  }
  const allowed = new Set([
    "schemaVersion",
    "xcodegenExecutable",
    "xcodebuildExecutable",
    "path",
    "user",
    "scratchRoot",
    "teamId",
    "method",
    "destination",
    "signingStyle",
    "xcodegenTimeoutMs",
    "archiveTimeoutMs",
    "exportTimeoutMs",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL}: unknown key ${key}.`);
    }
  }
  if (input.schemaVersion !== 1) {
    configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL}: schemaVersion must be 1.`);
  }
  const teamId = boundedString(input.teamId, "teamId", 10);
  if (!APPLE_TEAM_ID_PATTERN.test(teamId)) {
    configurationError(
      `${RELEASE_ARCHIVE_CONFIG_LABEL}: teamId must be a 10-character Apple Team ID.`,
    );
  }
  if (input.method !== "app-store-connect") {
    configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL}: method must be "app-store-connect".`);
  }
  if (input.destination !== "export") {
    configurationError(
      `${RELEASE_ARCHIVE_CONFIG_LABEL}: destination must be "export" -- uploading to App Store Connect is Wave 5, gated on the "upload-approved" owner approval, and this daemon build never performs it.`,
    );
  }
  if (input.signingStyle !== "automatic") {
    configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL}: signingStyle must be "automatic".`);
  }
  return {
    schemaVersion: 1,
    xcodegenExecutable: absolutePathValue(input.xcodegenExecutable, "xcodegenExecutable"),
    xcodebuildExecutable: absolutePathValue(input.xcodebuildExecutable, "xcodebuildExecutable"),
    path: boundedString(input.path, "path", 4_096),
    user: (() => {
      const user = boundedString(input.user, "user", 64);
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(user)) {
        configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL}: user must be a portable user name.`);
      }
      return user;
    })(),
    scratchRoot: absolutePathValue(input.scratchRoot, "scratchRoot"),
    teamId,
    method: "app-store-connect",
    destination: "export",
    signingStyle: "automatic",
    xcodegenTimeoutMs: boundedInteger(
      input.xcodegenTimeoutMs,
      "xcodegenTimeoutMs",
      10_000,
      1_800_000,
      300_000,
    ),
    archiveTimeoutMs: boundedInteger(
      input.archiveTimeoutMs,
      "archiveTimeoutMs",
      10_000,
      7_200_000,
      1_800_000,
    ),
    exportTimeoutMs: boundedInteger(
      input.exportTimeoutMs,
      "exportTimeoutMs",
      10_000,
      3_600_000,
      900_000,
    ),
  };
}

/** Reads `APP_FACTORY_RELEASE_CONFIG` through the same private-file discipline as every other
 *  daemon config file (`local-execution-profile.ts`'s `readPrivateFile`). */
export function loadReleaseArchiveConfigFile(path: string): ReleaseArchiveConfigV1 {
  const bytes = readPrivateFile(
    path,
    MAX_RELEASE_ARCHIVE_CONFIG_BYTES,
    RELEASE_ARCHIVE_CONFIG_LABEL,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    configurationError(`${RELEASE_ARCHIVE_CONFIG_LABEL} must contain valid JSON.`, error);
  }
  return parseReleaseArchiveConfigV1(parsed);
}

// ---------------------------------------------------------------------------
// Directory / file digests
// ---------------------------------------------------------------------------

/**
 * Content digest of a directory tree (relative path, permission bits, and file content, in
 * deterministic sorted-traversal order) -- used to durably record what `xcodebuild archive`
 * actually produced. A small, module-local twin of `codex-independent-reviewer.ts`'s
 * `digestDirectoryTree` rather than a shared import: that function's errors are reviewer-specific
 * (`reviewerError`), and coupling this module's archive-integrity check to the reviewer's error
 * taxonomy would be the wrong kind of reuse.
 */
export function digestArchiveDirectoryTreeV1(root: string): Sha256Digest {
  const entries: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    const names = readdirSync(directory).sort();
    for (const name of names) {
      const absolute = join(directory, name);
      const relativeName = prefix.length === 0 ? name : `${prefix}/${name}`;
      const stats = lstatSync(absolute);
      if (stats.isSymbolicLink()) {
        throw new Error(`Archive contains an unexpected symbolic link: ${relativeName}`);
      } else if (stats.isDirectory()) {
        entries.push(`D\0${relativeName}\0${(stats.mode & 0o777).toString(8)}`);
        walk(absolute, relativeName);
      } else if (stats.isFile()) {
        const contentDigest = createHash("sha256").update(readFileSync(absolute)).digest("hex");
        entries.push(`F\0${relativeName}\0${(stats.mode & 0o777).toString(8)}\0${contentDigest}`);
      } else {
        throw new Error(`Archive contains an unsupported file type: ${relativeName}`);
      }
    }
  };
  walk(root, "");
  return sha256Digest(Buffer.from(entries.join("\n"), "utf8"));
}

/** Streaming digest for the exported `.ipa` -- possibly tens to hundreds of MB (the release-rail
 *  plan's own reason the binary is never routed through the bounded 8 MiB provider transport). */
async function sha256FileStreamed(path: string): Promise<Sha256Digest> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk as Buffer));
    stream.on("end", () => resolvePromise());
    stream.on("error", reject);
  });
  return Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`);
}

// ---------------------------------------------------------------------------
// ExportOptions.plist
// ---------------------------------------------------------------------------

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The owner's proven ExportOptions.plist shape (memory, six apps): `method: app-store-connect`,
 *  `signingStyle: automatic`, plus `uploadSymbols: true` -- Wave 5 will set `destination: upload`;
 *  this wave always writes `destination: export`. */
function renderExportOptionsPlistV1(config: ReleaseArchiveConfigV1): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>method</key>",
    `\t<string>${xmlEscape(config.method)}</string>`,
    "\t<key>teamID</key>",
    `\t<string>${xmlEscape(config.teamId)}</string>`,
    "\t<key>signingStyle</key>",
    `\t<string>${xmlEscape(config.signingStyle)}</string>`,
    "\t<key>destination</key>",
    `\t<string>${xmlEscape(config.destination)}</string>`,
    "\t<key>uploadSymbols</key>",
    "\t<true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Supervised step execution
// ---------------------------------------------------------------------------

export type ReleaseArchiveStepName =
  "xcodegen-generate" | "xcodebuild-archive" | "xcodebuild-export";

export class ReleaseArchiveStepFailedError extends Error {
  public readonly step: ReleaseArchiveStepName;
  public constructor(step: ReleaseArchiveStepName, detail: string) {
    super(detail);
    this.name = "ReleaseArchiveStepFailedError";
    this.step = step;
  }
}

/**
 * A bounded, best-effort read of one of `process-supervisor`'s own spool files (`stdout.bin`/
 * `stderr.bin`), for DIAGNOSTIC use only (a stderr tail on failure, byte counts in success notes) --
 * every digest this module actually PERSISTS and trusts comes from the verified terminal
 * `SupervisedRunReceiptV1.stdout.sha256`/`.stderr.sha256`, never from this raw read. Unlike
 * `local-execution-profile.ts`'s exported `readPrivateFile` (which rejects an EMPTY file -- correct
 * for a config file that must never be blank, wrong here: a silent, successful `xcodegen generate`
 * legitimately produces zero bytes on either stream), and unlike `process-supervisor`'s own internal
 * `secure-artifacts.ts` reader (not part of its package's public exports), this is a small,
 * module-local variant that allows size 0. `path` is always derived from this module's own
 * `runKeyFor(...)` under its own private `supervisorRoot`, never from unvalidated external input.
 */
function readBoundedSpoolFile(path: string, maximumBytes: number): Buffer {
  let stats: Stats;
  try {
    stats = statSync(path);
  } catch {
    return Buffer.alloc(0);
  }
  if (!stats.isFile() || stats.size > maximumBytes) {
    throw new Error(`Supervised run spool file is missing or exceeds its bound: ${path}`);
  }
  return readFileSync(path);
}

function tailText(bytes: Buffer, maximumChars: number): string {
  const text = bytes.toString("utf8");
  return text.length > maximumChars ? `…${text.slice(text.length - maximumChars)}` : text;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

/**
 * Transient `reconcileSupervisedRun` "blocked" reasons that mean "keep polling," never "give up" --
 * the exact same allowlist `CodexLocalAgent`'s own `#waitForTerminal` (`codex-local-agent.ts`) and
 * `waitForSupervisedRunRegistration` (`process-supervisor`) already poll through: a real, narrow
 * race window between the target process exiting and its terminal receipt becoming visible to this
 * process (fsync ordering, not a bug), and the controller/target process group taking a moment to
 * fully exit after the receipt itself is already written.
 */
const TRANSIENT_RECONCILE_BLOCKED_REASONS: ReadonlySet<string> = new Set([
  "target-exited-without-terminal-receipt",
  "terminal-receipt-exists-but-controller-process-group-is-still-live",
  "terminal-receipt-exists-but-target-process-group-is-still-live",
]);

async function waitForSupervisedTerminalV1(
  prepared: PreparedSupervisedRun,
  waitBudgetMs: number,
): Promise<SupervisedRunReceiptV1> {
  const deadline = performance.now() + waitBudgetMs;
  for (;;) {
    const reconciled = reconcileSupervisedRun(prepared);
    if (reconciled.outcome === "terminal") return reconciled.receipt;
    if (
      reconciled.outcome === "blocked" &&
      !TRANSIENT_RECONCILE_BLOCKED_REASONS.has(reconciled.reason)
    ) {
      throw new Error(`supervised step ${prepared.intent.runKey} is blocked: ${reconciled.reason}`);
    }
    if (reconciled.outcome === "prepared") {
      throw new Error(
        `supervised step ${prepared.intent.runKey}: launch disappeared after being requested`,
      );
    }
    if (performance.now() > deadline) {
      throw new Error(
        `supervised step ${prepared.intent.runKey} did not reach a terminal receipt before its wait budget elapsed`,
      );
    }
    await sleep(200);
  }
}

/**
 * Runs one fixed-argv command to completion through `process-supervisor`'s intent -> claim -> gate
 * -> receipt protocol (the release plane, architecture decision 2), returning the verified terminal
 * receipt plus its captured stdout/stderr. Idempotent by `runKey`: a crash-and-retry that finds an
 * already-prepared or already-terminal run resumes it rather than relaunching, exactly like
 * `CodexLocalAgent.run`'s own use of this same package.
 */
async function runSupervisedStepV1(
  supervisorRoot: string,
  step: ReleaseArchiveStepName,
  intentInput: CreateSupervisedRunIntentInput,
): Promise<Readonly<{ receipt: SupervisedRunReceiptV1; stdout: Buffer; stderr: Buffer }>> {
  let prepared = openPreparedSupervisedRun(supervisorRoot, intentInput.runKey);
  prepared ??= prepareSupervisedRun(supervisorRoot, intentInput);

  const timeoutMs = prepared.intent.limits.timeoutMs;
  const waitBudgetMs =
    timeoutMs + prepared.intent.limits.graceMs + prepared.intent.limits.forceWaitMs + 10_000;

  let receipt: SupervisedRunReceiptV1;
  const launched = launchPreparedSupervisedRun(prepared);
  if (launched.outcome === "already-terminal") {
    receipt = launched.receipt;
  } else if (launched.outcome === "blocked") {
    throw new Error(`supervised step ${step} could not be launched: ${launched.reason}`);
  } else if (launched.outcome === "already-live") {
    receipt = await waitForSupervisedTerminalV1(prepared, waitBudgetMs);
  } else {
    const registered = await waitForSupervisedRunRegistration(prepared, launched.registration, {
      timeoutMs: 5_000,
      pollMs: 25,
    });
    if (registered.outcome === "terminal") {
      receipt = registered.receipt;
    } else if (registered.outcome === "blocked") {
      throw new Error(`supervised step ${step} could not be registered: ${registered.reason}`);
    } else {
      receipt = await waitForSupervisedTerminalV1(prepared, waitBudgetMs);
    }
  }

  const stdout = readBoundedSpoolFile(prepared.paths.stdoutPath, MAX_SUPERVISED_STEP_OUTPUT_BYTES);
  const stderr = readBoundedSpoolFile(prepared.paths.stderrPath, MAX_SUPERVISED_STEP_OUTPUT_BYTES);

  if (receipt.outcome !== "succeeded") {
    const exitDescription =
      receipt.process.exitCode !== null
        ? `exit ${String(receipt.process.exitCode)}`
        : `signal ${String(receipt.process.signal)}`;
    throw new ReleaseArchiveStepFailedError(
      step,
      `${step} ${receipt.outcome} (${exitDescription}, termination ${receipt.terminationOrigin}). stderr tail:\n${tailText(stderr, STDERR_TAIL_CHARS)}`,
    );
  }
  return { receipt, stdout, stderr };
}

// ---------------------------------------------------------------------------
// ReleaseArchiverPort
// ---------------------------------------------------------------------------

export type ReleaseArchiveStepInputV1 = Readonly<{
  releaseRunId: string;
  fence: number;
  sourceRepositoryPath: string;
  moduleName: string;
  buildNumber: string;
  marketingVersion: string;
  exportOptions: ReleaseExportOptionsConfigV1;
}>;

export type ReleaseArchiveOutcomeV1 = Readonly<{
  archivePath: string;
  archiveDigest: Sha256Digest;
  exportedArtifactPath: string;
  exportedArtifactDigest: Sha256Digest;
  receiptDigest: Sha256Digest;
  stepNotes: readonly string[];
}>;

export type ReleaseArchiverPort = Readonly<{
  configured: boolean;
  archive(input: ReleaseArchiveStepInputV1, signal: AbortSignal): Promise<ReleaseArchiveOutcomeV1>;
}>;

export class ReleaseArchiverNotConfiguredError extends Error {
  public constructor() {
    super(
      "release.archive requires APP_FACTORY_RELEASE_CONFIG to be configured on this daemon build.",
    );
    this.name = "ReleaseArchiverNotConfiguredError";
  }
}

export const INERT_RELEASE_ARCHIVER_PORT: ReleaseArchiverPort = {
  configured: false,
  archive: () => Promise.reject(new ReleaseArchiverNotConfiguredError()),
};

function runKeyFor(step: ReleaseArchiveStepName, releaseRunId: string, fence: number): string {
  return `release-archive-${releaseRunId}-f${String(fence)}-${step}`;
}

/**
 * `HOME` is passed through from the daemon's OWN process environment (never from
 * `APP_FACTORY_RELEASE_CONFIG` -- it is an operational fact of where the daemon runs, not a
 * reviewed identifier the operator chooses) because `process-supervisor` REPLACES the child's
 * environment wholesale rather than inheriting it: without `HOME`, Xcode/`xcodebuild` cannot resolve
 * `~/Library/Developer`, `~/Library/MobileDevice/Provisioning Profiles`, or Keychain search list
 * defaults, and automatic signing fails closed in confusing ways that have nothing to do with the
 * actual archive. Every other value here stays the reviewed, config-controlled set.
 */
function sharedEnvironment(config: ReleaseArchiveConfigV1): Readonly<Record<string, string>> {
  return {
    LANG: "C",
    LC_ALL: "C",
    PATH: config.path,
    USER: config.user,
    ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
  };
}

/** Composes the real, `process-supervisor`-backed archiver from a reviewed
 *  `APP_FACTORY_RELEASE_CONFIG`. Supervised-run bookkeeping (intent/receipt/spool files) lives
 *  under `config.scratchRoot/supervisor`, separate from each run's own build scratch area
 *  (`config.scratchRoot/runs/<releaseRunId>/f<fence>`) where the actual `.xcarchive`/`.ipa` land. */
export function createReleaseArchiverPort(
  options: Readonly<{ config: ReleaseArchiveConfigV1 }>,
): ReleaseArchiverPort {
  const { config } = options;
  const supervisorRoot = join(config.scratchRoot, "supervisor");
  return {
    configured: true,
    async archive(input, signal) {
      const assertActive = (): void => {
        // Process-supervisor's own per-step `timeoutMs` is what actually bounds a LIVE child
        // process; this is only checked between steps (never mid-launch) so an already-running
        // `xcodebuild` is never abandoned without its own durable terminal receipt -- a half-killed
        // archive would leave an ambiguous supervised-run state exactly like `CodexLocalAgent`'s own
        // `context.assertActive()` refuses to do.
        if (signal.aborted) throw new Error("release.archive: cancelled before this step started");
      };
      assertActive();
      if (
        input.exportOptions.teamId !== config.teamId ||
        input.exportOptions.method !== config.method ||
        input.exportOptions.destination !== config.destination ||
        input.exportOptions.signingStyle !== config.signingStyle
      ) {
        throw new Error(
          "release.archive: exportOptions does not match this daemon's reviewed APP_FACTORY_RELEASE_CONFIG allowlist",
        );
      }
      const runDirectory = join(
        config.scratchRoot,
        "runs",
        input.releaseRunId,
        `f${String(input.fence)}`,
      );
      mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
      const archivePath = join(runDirectory, `${input.moduleName}.xcarchive`);
      const exportDirectory = join(runDirectory, "export");
      const derivedDataPath = join(runDirectory, "derived-data");
      const exportOptionsPlistPath = join(runDirectory, "ExportOptions.plist");

      const sharedIntent = {
        cwd: input.sourceRepositoryPath,
        environment: sharedEnvironment(config),
        limits: { maxOutputBytesPerStream: MAX_SUPERVISED_STEP_OUTPUT_BYTES },
      } as const;
      const createdAt = new Date().toISOString();

      const generateStep = await runSupervisedStepV1(supervisorRoot, "xcodegen-generate", {
        ...sharedIntent,
        runKey: runKeyFor("xcodegen-generate", input.releaseRunId, input.fence),
        attemptId: input.releaseRunId,
        fence: input.fence,
        createdAt,
        executable: config.xcodegenExecutable,
        argv: ["generate", "--spec", "project.yml"],
        limits: { ...sharedIntent.limits, timeoutMs: config.xcodegenTimeoutMs },
      });

      assertActive();
      const archiveStep = await runSupervisedStepV1(supervisorRoot, "xcodebuild-archive", {
        ...sharedIntent,
        runKey: runKeyFor("xcodebuild-archive", input.releaseRunId, input.fence),
        attemptId: input.releaseRunId,
        fence: input.fence,
        createdAt,
        executable: config.xcodebuildExecutable,
        argv: [
          "archive",
          "-project",
          `${input.moduleName}.xcodeproj`,
          "-scheme",
          input.moduleName,
          "-destination",
          "generic/platform=iOS",
          "-archivePath",
          archivePath,
          "-derivedDataPath",
          derivedDataPath,
          "-allowProvisioningUpdates",
          "CODE_SIGN_STYLE=Automatic",
          `DEVELOPMENT_TEAM=${config.teamId}`,
          `CURRENT_PROJECT_VERSION=${input.buildNumber}`,
          `MARKETING_VERSION=${input.marketingVersion}`,
        ],
        limits: { ...sharedIntent.limits, timeoutMs: config.archiveTimeoutMs },
      });

      let archiveStats: Stats;
      try {
        archiveStats = lstatSync(archivePath);
      } catch (error) {
        throw new ReleaseArchiveStepFailedError(
          "xcodebuild-archive",
          `xcodebuild archive reported success but ${archivePath} does not exist${
            error instanceof Error ? `: ${error.message}` : ""
          }`,
        );
      }
      if (!archiveStats.isDirectory()) {
        throw new ReleaseArchiveStepFailedError(
          "xcodebuild-archive",
          `${archivePath} exists but is not an .xcarchive directory`,
        );
      }
      const archiveDigest = digestArchiveDirectoryTreeV1(archivePath);

      writeFileSync(exportOptionsPlistPath, renderExportOptionsPlistV1(config), { mode: 0o600 });

      assertActive();
      const exportStep = await runSupervisedStepV1(supervisorRoot, "xcodebuild-export", {
        ...sharedIntent,
        runKey: runKeyFor("xcodebuild-export", input.releaseRunId, input.fence),
        attemptId: input.releaseRunId,
        fence: input.fence,
        createdAt,
        executable: config.xcodebuildExecutable,
        argv: [
          "-exportArchive",
          "-archivePath",
          archivePath,
          "-exportOptionsPlist",
          exportOptionsPlistPath,
          "-exportPath",
          exportDirectory,
          "-allowProvisioningUpdates",
        ],
        limits: { ...sharedIntent.limits, timeoutMs: config.exportTimeoutMs },
      });

      let exportedNames: readonly string[];
      try {
        exportedNames = readdirSync(exportDirectory).filter((name) => name.endsWith(".ipa"));
      } catch (error) {
        throw new ReleaseArchiveStepFailedError(
          "xcodebuild-export",
          `xcodebuild -exportArchive reported success but ${exportDirectory} could not be read${
            error instanceof Error ? `: ${error.message}` : ""
          }`,
        );
      }
      if (exportedNames.length !== 1) {
        throw new ReleaseArchiveStepFailedError(
          "xcodebuild-export",
          `Expected exactly one .ipa in ${exportDirectory}; found ${String(exportedNames.length)}`,
        );
      }
      const exportedArtifactPath = join(exportDirectory, exportedNames[0] ?? "");
      const exportedArtifactDigest = await sha256FileStreamed(exportedArtifactPath);

      const receiptDigest = sha256Digest(
        Buffer.from(
          JSON.stringify(
            [
              { step: "xcodegen-generate", receipt: generateStep.receipt },
              { step: "xcodebuild-archive", receipt: archiveStep.receipt },
              { step: "xcodebuild-export", receipt: exportStep.receipt },
            ],
            null,
            0,
          ),
          "utf8",
        ),
      );

      return {
        archivePath,
        archiveDigest,
        exportedArtifactPath,
        exportedArtifactDigest,
        receiptDigest,
        stepNotes: [
          `release.archive: xcodegen generate succeeded (stdout ${String(generateStep.stdout.byteLength)}B, stderr ${String(generateStep.stderr.byteLength)}B).`,
          `release.archive: xcodebuild archive succeeded -> ${archivePath} (digest ${archiveDigest}).`,
          `release.archive: xcodebuild -exportArchive succeeded -> ${exportedArtifactPath} (digest ${exportedArtifactDigest}).`,
        ],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Phase A / C: repository-backed orchestration (runs inside the serial executor)
// ---------------------------------------------------------------------------

export type ReleaseArchiveRuntimeRepositoriesPort = ReleaseRunRuntimeRepositoriesPort &
  Readonly<{
    releaseBuildNumbers: Pick<FactoryRepositories["releaseBuildNumbers"], "allocateNext">;
  }>;

export type ReleaseArchiveRuntimeDependencies = Readonly<{
  repositories: ReleaseArchiveRuntimeRepositoriesPort;
  mirrors: RunExportMirrorPort;
  resolveVerifiedExecutionEvidence: (attempt: ExecutionAttemptV1) => VerifiedExecutionEvidence;
}>;

export type ReleaseArchiveCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "release.archive" }
>;

export type ReleaseArchivePreparationV1 = Readonly<{
  request: ReleaseArchiveCommandRequestV1;
  head: ReleaseRunV1;
  sourceRepositoryPath: string;
  moduleName: string;
  buildNumber: string;
  promotion: Readonly<{ promotedCommit: string; branch: string }>;
  stepInput: ReleaseArchiveStepInputV1;
}>;

/**
 * Phase A: validates the CAS/stage precondition, re-verifies the source commit's execution
 * evidence AND its promotion onto the source repository (architecture: promotion must land before
 * archiving -- `xcodebuild archive` runs against the source repository's promoted tree), resolves
 * the XcodeGen module name from the sealed mirror, and allocates the build number. Every step here
 * is local (SQLite + local `git`), so it stays inside the serial executor -- see the module doc
 * comment.
 */
export function prepareReleaseArchive(
  dependencies: ReleaseArchiveRuntimeDependencies,
  request: ReleaseArchiveCommandRequestV1,
  observedAt: IsoInstant,
): ReleaseArchivePreparationV1 {
  const { releaseRunId, expectedRevision, exportOptions, marketingVersion } = request.payload;
  const head = dependencies.repositories.releaseRuns.get(releaseRunId);
  if (head === null) {
    throw new CommandHandlerError(
      "release-run.not-found",
      `No release run exists for ID ${releaseRunId}.`,
      false,
    );
  }
  if (head.revision !== expectedRevision) {
    throw new CommandHandlerError(
      "release-run.revision-conflict",
      `Release run ${releaseRunId} is at revision ${String(head.revision)}, not ${String(expectedRevision)}.`,
      true,
    );
  }
  if (head.stage !== "certified") {
    throw new CommandHandlerError(
      "release-run.not-certified",
      `Release run ${releaseRunId} is at stage "${head.stage}"; only a certified run can be archived.`,
      false,
    );
  }
  if (exportOptions.destination !== "export") {
    throw new CommandHandlerError(
      "release.archive-destination-not-supported",
      'release.archive only supports exportOptions.destination "export" in this daemon build; uploading to App Store Connect is Wave 5 and requires the "upload-approved" owner approval.',
      false,
    );
  }
  const bundleId = exportOptions.bundleIdOverride;
  if (bundleId === null) {
    throw new CommandHandlerError(
      "release.archive-bundle-id-required",
      "release.archive requires exportOptions.bundleIdOverride naming the bundle ID to allocate a build number for.",
      false,
    );
  }

  const { gitWorkspace, mirror, verified } = resolveVerifiedReleaseSourceV1(
    // Same narrow dependency shape `release-run-runtime.ts` itself needs; `ReleaseArchiveRuntimeDependencies`
    // is a superset (adds `releaseBuildNumbers`), so it satisfies this call directly.
    dependencies,
    head.repositoryId,
    head.sourceCommit,
  );

  const moduleName = readXcodegenProjectName(mirror.mirrorPath, head.sourceCommit);
  if (moduleName === null) {
    throw new CommandHandlerError(
      "release.archive-no-xcodegen-project",
      `Release run ${releaseRunId}'s source commit has no XcodeGen project.yml with a "name:" field; release.archive cannot determine the module to build.`,
      false,
    );
  }

  let promoted: PromotedBrokerCommitV1;
  try {
    promoted = gitWorkspace.promoteBrokerCommitToBranch(
      mirror,
      {
        attemptId: verified.brokerCommit.attemptId,
        baseSha: verified.brokerCommit.baseSha,
        candidateTreeId: verified.brokerCommit.candidateTreeId,
        diffDigest: verified.brokerCommit.diffDigest,
      },
      { targetRepositoryPath: mirror.sourceRepositoryPath, branch: head.branch },
    );
  } catch (error) {
    throw new CommandHandlerError(
      "release.archive-promotion-not-current",
      `release.archive could not re-verify the promotion of release run ${releaseRunId} onto "${head.branch}"${
        error instanceof Error ? `: ${error.message}` : ""
      }.`,
      false,
    );
  }

  const buildNumber = dependencies.repositories.releaseBuildNumbers.allocateNext(
    bundleId,
    releaseRunId,
    observedAt,
  ).buildNumber;

  return {
    request,
    head,
    sourceRepositoryPath: mirror.sourceRepositoryPath,
    moduleName,
    buildNumber,
    promotion: { promotedCommit: promoted.toCommit, branch: promoted.branch },
    stepInput: {
      releaseRunId,
      fence: expectedRevision,
      sourceRepositoryPath: mirror.sourceRepositoryPath,
      moduleName,
      buildNumber,
      marketingVersion,
      exportOptions,
    },
  };
}

function persistNextRevision(
  dependencies: ReleaseArchiveRuntimeDependencies,
  preparation: ReleaseArchivePreparationV1,
  // Deliberately loose (not `Partial<ReleaseRunV1>`): `ReleaseRunV1Schema.parse` below accepts
  // `unknown` and is the single source of truth for field shape, INCLUDING the branded string types
  // (`GitObjectId`, `Sha256Digest`, ...) a freshly constructed `promotion`/`archive` patch cannot
  // otherwise satisfy at the TYPE level without re-parsing each field individually first.
  patch: Readonly<Record<string, unknown>>,
  observedAt: IsoInstant,
  notes: readonly string[],
): ReleaseRunV1 {
  const { head, request } = preparation;
  const next = ReleaseRunV1Schema.parse({
    ...head,
    ...patch,
    revision: head.revision + 1,
    updatedAt: observedAt,
    notes: [...head.notes, ...notes].slice(-50),
  });
  try {
    const upserted = dependencies.repositories.releaseRuns.upsert({
      commandId: request.commandId,
      origin: request.origin,
      issuedAt: request.issuedAt,
      run: next,
      recordedAt: observedAt,
    });
    return upserted.run;
  } catch (error) {
    mapReleaseRunUpsertError(error);
  }
}

/** Phase C (success): advances `certified -> archived`, populating BOTH `promotion` and `archive`
 *  together -- `ReleaseRunV1Schema`'s own `superRefine` requires exactly that combination the moment
 *  `stage` reaches `"archived"` (Wave 3 deliberately left `promotion` unset for this wave to do). */
export function completeReleaseArchive(
  dependencies: ReleaseArchiveRuntimeDependencies,
  preparation: ReleaseArchivePreparationV1,
  outcome: ReleaseArchiveOutcomeV1,
  observedAt: IsoInstant,
): ReleaseRunV1 {
  return persistNextRevision(
    dependencies,
    preparation,
    {
      stage: "archived",
      promotion: { ...preparation.promotion, at: observedAt },
      archive: {
        buildNumber: preparation.buildNumber,
        marketingVersion: preparation.stepInput.marketingVersion,
        archiveDigest: outcome.archiveDigest,
        exportedArtifactDigest: outcome.exportedArtifactDigest,
        receiptDigest: outcome.receiptDigest,
        at: observedAt,
      },
    },
    observedAt,
    outcome.stepNotes,
  );
}

/** Phase C (failure): holds `stage` at `"certified"` (a legal, resumable-per-stage revision per
 *  `assertReleaseRunAdvancement`'s own doc comment) and durably records what failed -- never a
 *  thrown-away error message, per the plan's own risk note. */
export function recordReleaseArchiveFailure(
  dependencies: ReleaseArchiveRuntimeDependencies,
  preparation: ReleaseArchivePreparationV1,
  failureDetail: string,
  observedAt: IsoInstant,
): ReleaseRunV1 {
  return persistNextRevision(dependencies, preparation, {}, observedAt, [
    `release.archive: FAILED (build ${preparation.buildNumber}) -- ${failureDetail}`.slice(
      0,
      2_000,
    ),
  ]);
}
