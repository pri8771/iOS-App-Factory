import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  NamespacedCodeSchema,
  RepositoryIdSchema,
  type NamespacedCode,
  type ProjectPlanV1,
  type RepositoryId,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";
import {
  VERIFICATION_SCRATCH_TOKEN,
  assertVerificationArgsTemplate,
} from "@app-factory/execution-engine";
import {
  GitWorkspaceError,
  type GitWorkspaceManager,
  type ProtectedPathPolicyExtensionV1,
} from "@app-factory/git-workspace";
import type { ProjectPlanRepository, ProjectRegistryRepository } from "@app-factory/kernel";

import { genericProjectReviewer, runBoundedGit } from "./enrolled-project-execution.js";
import {
  LocalExecutionProfileConfigurationError,
  buildCodexAgentForProject,
  exactKeys,
  parseCodexAgentIdentityFields,
  parseConfigurationObject,
  readPrivateFile,
  requireOwnerContainmentAttestation,
  type CodexAgentIdentityFieldsV1,
  type LocalExecutionProfileDependencies,
} from "./local-execution-profile.js";
import type {
  LocalAgentAdapter,
  LocalAgentRunContext,
  LocalAgentRunOutcome,
  TaskAuthorizationV1,
  VerifiedLocalExecutionProject,
} from "./verified-local-executor.js";
import { decodeReviewedPolicyPayload } from "./verified-local-executor.js";

/**
 * Planner execution (Studio Phase 4, the missing half): lets the verified executor run the CODING
 * task items of a human-approved plan against ANY registered project -- including one `project.seed`
 * created a minute ago -- instead of only the single task/base/repository a static
 * `APP_FACTORY_LOCAL_EXECUTION_CONFIG` pins.
 *
 * Trust anchors, in place of the enrolled profile's three pins:
 *
 * - repository: must be a Project Registry entry (`project.register` / `project.seed`), whose Factory
 *   mirror was sealed by the registry (`prepareImmutableMirror`) -- the resolver reads the sealed
 *   root binding for identity and the mirror's CURRENT binding tip
 *   (`readImmutableMirrorBindingTip`) for the allowed base, so `plan.tick`'s
 *   `advanceImmutableMirrorBase` is honoured without a daemon restart;
 * - task: must be a submitted task item of a plan for that repository the owner has approved
 *   (`plan.approve`, states `approved`/`executing`/`complete`) -- `authorizeTask`; anything else
 *   blocks with `plan.task-not-in-approved-plan`;
 * - policy: one deterministic reviewed policy payload rendered from the compiled iOS App Factory
 *   standard's ENFORCED rule statements plus the Factory invariants (agent never self-verifies, edits
 *   only its authorized paths, no network) -- its digest is what `plan.execute` stamps on every task
 *   it submits (`ProjectPlanExecutionDependencies.policyDigest`), so the executor's
 *   `policy.digest-mismatch` check binds plan tasks to exactly this text.
 *
 * Verification is the `ios-xcodegen-v1` profile: `xcodegen generate` (the seeded scaffold gitignores
 * the .xcodeproj) then `xcodebuild build` and `xcodebuild test` on the scheme named by the project's
 * own `project.yml`, with the executables, simulator destination, and tool versions stated by the
 * operator in the config -- exactly the shape the Hindsight enrolled config used, generalized.
 *
 * Two agent modes: `planner-codex-v1` (the real Codex CLI through the same `buildCodexAgentForProject`
 * the enrolled profile uses; owner containment attestation required) and `planner-fixture-v1` (a
 * scripted, network-free agent that writes one small artifact per task under its authorized paths --
 * for rehearsing the whole seed -> plan -> execute -> verify -> review -> commit -> advance chain with
 * the REAL toolchain and no model). This file never touches Hindsight or any other real app.
 */

const CONFIG_LABEL = "APP_FACTORY_PLANNER_EXECUTION_CONFIG";
const MAX_CONFIG_BYTES = 64 * 1024;
const PLANNER_MODES = ["planner-codex-v1", "planner-fixture-v1"] as const;
export type PlannerExecutionModeV1 = (typeof PLANNER_MODES)[number];

export type PlannerVerificationConfigV1 = Readonly<{
  profile: "ios-xcodegen-v1";
  xcodegenExecutable: string;
  xcodebuildExecutable: string;
  /** e.g. `platform=iOS Simulator,name=iPhone 17 Pro,OS=latest` -- the operator's real simulator. */
  simulatorDestination: string;
  /** PATH the trusted verifier hands the toolchain; must contain the executables' directories. */
  path: string;
  /**
   * The USER name the verification environment carries (XcodeGen/Foundation refuse to run without
   * one). Defaults to the daemon process's own user at config load; stated in every plan explicitly.
   */
  user: string;
  toolVersions: readonly Readonly<{ name: string; version: string }>[];
  buildTimeoutMs: number;
  testTimeoutMs: number;
}>;

export type PlannerExecutionConfigV1 = Readonly<{
  schemaVersion: 1;
  mode: PlannerExecutionModeV1;
  /** Present exactly for `planner-codex-v1`. */
  codex?: CodexAgentIdentityFieldsV1;
  reviewer: Readonly<{ reviewerId: NamespacedCode; reviewerVersion: string }>;
  verification: PlannerVerificationConfigV1;
  candidatePolicyLimits?: Readonly<{ maxChangedFileBytes?: number; maxDiffBytes?: number }>;
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
      `${CONFIG_LABEL}: ${label} must be a string of 1..${String(maximum)} characters.`,
    );
  }
  if (value.includes("\0")) configurationError(`${CONFIG_LABEL}: ${label} must not contain NUL.`);
  return value;
}

function absolutePath(value: unknown, label: string): string {
  const text = boundedString(value, label, 1_024);
  if (!text.startsWith("/") || text.includes("/../") || text.endsWith("/..")) {
    configurationError(`${CONFIG_LABEL}: ${label} must be a normalized absolute path.`);
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
      `${CONFIG_LABEL}: ${label} must be an integer in ${String(minimum)}..${String(maximum)}.`,
    );
  }
  return value;
}

function parseVerification(value: unknown): PlannerVerificationConfigV1 {
  if (!isRecord(value)) configurationError(`${CONFIG_LABEL}: verification must be an object.`);
  exactKeys(
    value,
    [
      "profile",
      "xcodegenExecutable",
      "xcodebuildExecutable",
      "simulatorDestination",
      "toolVersions",
    ],
    `${CONFIG_LABEL}: verification has an unsupported or non-exact shape.`,
    ["path", "user", "buildTimeoutMs", "testTimeoutMs"],
  );
  if (value.profile !== "ios-xcodegen-v1") {
    configurationError(`${CONFIG_LABEL}: verification.profile must be "ios-xcodegen-v1".`);
  }
  if (!Array.isArray(value.toolVersions) || value.toolVersions.length < 1) {
    configurationError(`${CONFIG_LABEL}: verification.toolVersions must be a non-empty array.`);
  }
  const toolVersions = value.toolVersions.map((entry, index) => {
    if (!isRecord(entry)) {
      configurationError(
        `${CONFIG_LABEL}: verification.toolVersions[${String(index)}] must be an object.`,
      );
    }
    exactKeys(
      entry,
      ["name", "version"],
      `${CONFIG_LABEL}: verification.toolVersions entries are {name, version}.`,
    );
    return {
      name: boundedString(entry.name, `verification.toolVersions[${String(index)}].name`, 100),
      version: boundedString(
        entry.version,
        `verification.toolVersions[${String(index)}].version`,
        100,
      ),
    };
  });
  const path =
    value.path === undefined
      ? "/usr/bin:/bin:/opt/homebrew/bin"
      : boundedString(value.path, "verification.path", 4_096);
  const user =
    value.user === undefined
      ? (process.env.USER ?? process.env.LOGNAME ?? "")
      : boundedString(value.user, "verification.user", 64);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(user)) {
    configurationError(
      `${CONFIG_LABEL}: verification.user must be a portable user name (set it explicitly; the daemon's USER/LOGNAME is unset or unusable).`,
    );
  }
  return {
    profile: "ios-xcodegen-v1",
    user,
    xcodegenExecutable: absolutePath(value.xcodegenExecutable, "verification.xcodegenExecutable"),
    xcodebuildExecutable: absolutePath(
      value.xcodebuildExecutable,
      "verification.xcodebuildExecutable",
    ),
    simulatorDestination: boundedString(
      value.simulatorDestination,
      "verification.simulatorDestination",
      500,
    ),
    path,
    toolVersions,
    buildTimeoutMs: boundedInteger(
      value.buildTimeoutMs,
      "verification.buildTimeoutMs",
      10_000,
      3_600_000,
      600_000,
    ),
    testTimeoutMs: boundedInteger(
      value.testTimeoutMs,
      "verification.testTimeoutMs",
      10_000,
      3_600_000,
      900_000,
    ),
  };
}

function parseReviewer(value: unknown): PlannerExecutionConfigV1["reviewer"] {
  if (!isRecord(value)) configurationError(`${CONFIG_LABEL}: reviewer must be an object.`);
  exactKeys(
    value,
    ["reviewerId", "reviewerVersion"],
    `${CONFIG_LABEL}: reviewer is {reviewerId, reviewerVersion}.`,
  );
  const reviewerId = NamespacedCodeSchema.safeParse(value.reviewerId);
  if (!reviewerId.success) {
    configurationError(
      `${CONFIG_LABEL}: reviewer.reviewerId must be a namespaced code (e.g. planner.generic-review).`,
    );
  }
  return {
    reviewerId: reviewerId.data,
    reviewerVersion: boundedString(value.reviewerVersion, "reviewer.reviewerVersion", 100),
  };
}

function parseCandidatePolicyLimits(
  value: unknown,
): PlannerExecutionConfigV1["candidatePolicyLimits"] {
  if (value === undefined) return undefined;
  if (!isRecord(value))
    configurationError(`${CONFIG_LABEL}: candidatePolicyLimits must be an object.`);
  exactKeys(value, [], `${CONFIG_LABEL}: candidatePolicyLimits has an unsupported shape.`, [
    "maxChangedFileBytes",
    "maxDiffBytes",
  ]);
  const limits: { maxChangedFileBytes?: number; maxDiffBytes?: number } = {};
  if (value.maxChangedFileBytes !== undefined) {
    limits.maxChangedFileBytes = boundedInteger(
      value.maxChangedFileBytes,
      "candidatePolicyLimits.maxChangedFileBytes",
      1,
      1_073_741_824,
      0,
    );
  }
  if (value.maxDiffBytes !== undefined) {
    limits.maxDiffBytes = boundedInteger(
      value.maxDiffBytes,
      "candidatePolicyLimits.maxDiffBytes",
      1,
      1_073_741_824,
      0,
    );
  }
  return limits;
}

export function parsePlannerExecutionConfigV1(input: unknown): PlannerExecutionConfigV1 {
  if (!isRecord(input)) configurationError(`${CONFIG_LABEL} must be a JSON object.`);
  if (input.schemaVersion !== 1) configurationError(`${CONFIG_LABEL}: schemaVersion must be 1.`);
  const mode = input.mode;
  if (typeof mode !== "string" || !(PLANNER_MODES as readonly string[]).includes(mode)) {
    configurationError(`${CONFIG_LABEL}: mode must be one of ${PLANNER_MODES.join(", ")}.`);
  }
  const common = ["schemaVersion", "mode", "reviewer", "verification"];
  if (mode === "planner-codex-v1") {
    exactKeys(
      input,
      [...common, "codexHome", "executable", "executableDigest", "expectedCliVersion", "model"],
      `${CONFIG_LABEL} (planner-codex-v1) has an unsupported or non-exact shape.`,
      ["agentLimits", "siblingExecutables", "candidatePolicyLimits"],
    );
  } else {
    exactKeys(
      input,
      common,
      `${CONFIG_LABEL} (planner-fixture-v1) has an unsupported or non-exact shape.`,
      ["candidatePolicyLimits"],
    );
  }
  const candidatePolicyLimits = parseCandidatePolicyLimits(input.candidatePolicyLimits);
  return {
    schemaVersion: 1,
    mode: mode as PlannerExecutionModeV1,
    ...(mode === "planner-codex-v1" ? { codex: parseCodexAgentIdentityFields(input) } : {}),
    reviewer: parseReviewer(input.reviewer),
    verification: parseVerification(input.verification),
    ...(candidatePolicyLimits === undefined ? {} : { candidatePolicyLimits }),
  };
}

/**
 * Reads the config through the same private-file discipline as every other daemon config file. A
 * real-identity mode refuses to load without a valid owner containment attestation, exactly like
 * `enrolled-codex-v1`.
 */
export function loadPlannerExecutionConfigFile(
  path: string,
  options: Readonly<{ containmentAttestationPath?: string }> = {},
): PlannerExecutionConfigV1 {
  const bytes = readPrivateFile(path, MAX_CONFIG_BYTES, CONFIG_LABEL);
  const config = parsePlannerExecutionConfigV1(parseConfigurationObject(bytes));
  if (config.mode === "planner-codex-v1") {
    requireOwnerContainmentAttestation(options.containmentAttestationPath, config.mode);
  }
  return config;
}

// ---------------------------------------------------------------------------
// Reviewed policy payload for plan-submitted tasks
// ---------------------------------------------------------------------------

/**
 * The one reviewed policy text every plan-submitted task is bound to. Deterministic in its inputs
 * (the compiled standard's rule statements, sorted by ruleId) so `plan.execute` and the executor
 * agree on its digest by construction; the Factory invariants come first and never vary.
 */
export function renderPlannerAgentPolicyV1(
  standardRuleStatements: ReadonlyMap<string, string>,
): Buffer {
  const rules = [...standardRuleStatements.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const lines = [
    "App Factory reviewed policy v1 (planner execution).",
    "",
    "Factory invariants (always enforced by the daemon, not by you):",
    "1. Edit only the files under your authorized write paths; touch nothing else in the worktree.",
    "2. Do not verify your own work: the trusted plane builds and tests your candidate after you finish. Do not run xcodebuild, simulators, or tests yourself; do not claim they passed.",
    "3. Do not use the network, credentials, package managers, or any tool outside the worktree.",
    "4. Do not modify Git state (no commits, branches, tags, stashes, or hooks) and never edit CI workflow files.",
    "5. Keep the change minimal and complete for the task's stated objective and acceptance criteria; leave a one-paragraph summary of what you changed and why.",
    "",
    rules.length === 0
      ? "Standard rules: (none compiled)"
      : "Standard rules (iOS App Factory, ENFORCED):",
    ...rules.map(([ruleId, statement], index) => `${String(index + 1)}. [${ruleId}] ${statement}`),
    "",
  ];
  const bytes = Buffer.from(`${lines.join("\n")}\n`, "utf8");
  // Fail closed on the same bounds the executor enforces, at composition time rather than at the
  // first attempt.
  decodeReviewedPolicyPayload(bytes);
  return bytes;
}

// ---------------------------------------------------------------------------
// ios-xcodegen-v1 verification plans
// ---------------------------------------------------------------------------

export function iosXcodegenVerificationPlansV1(
  moduleName: string,
  verification: PlannerVerificationConfigV1,
): VerifiedLocalExecutionProject["verificationPlans"] {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(moduleName)) {
    throw new TypeError(
      `ios-xcodegen-v1: unsupported XcodeGen project name ${JSON.stringify(moduleName)}`,
    );
  }
  const shared = {
    environment: {
      LANG: "C",
      LC_ALL: "C",
      PATH: verification.path,
      TZ: "UTC",
      USER: verification.user,
    },
    protectedFiles: {},
    terminationGraceMs: 10_000,
    maxStdoutBytes: 32 * 1024 * 1024,
    maxStderrBytes: 32 * 1024 * 1024,
    toolVersions: verification.toolVersions.map((tool) => ({ ...tool })),
  } as const;
  // The scratch token may appear at most ONCE per argument (`materializeVerificationArgs`), so
  // each script binds it to a shell variable first and derives every path from that.
  // The trusted verification checkout is READ-ONLY (a fresh, detached checkout of the candidate
  // tree), so the .xcodeproj is generated INTO the scratch directory (`--project`) and xcodebuild is
  // pointed at it (`-project`); the checkout is never written to and stays clean by construction.
  // The scratch token may appear at most ONCE per argument (`materializeVerificationArgs`), so
  // each script binds it to a shell variable first and derives every path from that.
  // The token is substituted verbatim, so the assignment MUST be quoted: a runtime directory
  // containing a space (the runbook's own `~/Library/Application Support/AppFactory/...` does)
  // otherwise ends the assignment at the space, and the shell tries to execute the remainder as a
  // command -- every check then fails with a bare "No such file or directory" and exit 1.
  const bind = `S="${VERIFICATION_SCRATCH_TOKEN}"; mkdir -p "$S/gen" "$S/derived-data"`;
  const generate = `"${verification.xcodegenExecutable}" generate --quiet --spec project.yml --project "$S/gen"`;
  const project = `-project "$S/gen/${moduleName}.xcodeproj"`;
  const build = `"${verification.xcodebuildExecutable}" build ${project} -scheme "${moduleName}" -destination "generic/platform=iOS Simulator" CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES -derivedDataPath "$S/derived-data"`;
  const test = `"${verification.xcodebuildExecutable}" test ${project} -scheme "${moduleName}" -destination "${verification.simulatorDestination}" CODE_SIGNING_ALLOWED=NO -derivedDataPath "$S/derived-data" -resultBundlePath "$S/result.xcresult"`;
  const plans = [
    {
      ...shared,
      checkId: "build.xcodegen-app",
      executable: "/bin/sh",
      args: ["-c", `set -e; ${bind}; ${generate}; ${build}`],
      timeoutMs: verification.buildTimeoutMs,
    },
    {
      ...shared,
      checkId: "test.xcodegen-unit",
      executable: "/bin/sh",
      args: ["-c", `set -e; ${bind}; ${generate}; ${test}`],
      timeoutMs: verification.testTimeoutMs,
    },
  ];
  // Fail at composition time, not at the first attempt, if a template ever violates the
  // coordinator's one-token-per-argument rule.
  for (const plan of plans) assertVerificationArgsTemplate(plan.args);
  return plans;
}

/** `name:` from the project's own `project.yml` at a commit, read from the sealed mirror. */
export function readXcodegenProjectName(mirrorPath: string, commit: string): string | null {
  let manifest: string;
  try {
    manifest = runBoundedGit(mirrorPath, [
      "--git-dir",
      mirrorPath,
      "show",
      `${commit}:project.yml`,
    ]).toString("utf8");
  } catch {
    return null;
  }
  const match = /^name:\s*["']?([A-Za-z][A-Za-z0-9_]*)["']?\s*$/m.exec(manifest);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// planner-fixture-v1 agent
// ---------------------------------------------------------------------------

function shortDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

/**
 * The rehearsal agent: writes exactly one small, compilable artifact per task under the FIRST
 * authorized write path that is a directory in the worktree -- an XCTest under `Tests/<Module>Tests`,
 * a Swift enum under `Sources/<Module>`, a note under `docs/`, else a note in that directory. Never
 * reads or writes anything else, never touches the network, never verifies. Its purpose is to prove
 * the CHAIN (seed -> plan -> execute -> verify with the real toolchain -> review -> broker commit ->
 * advance -> next item) end to end without a model; it is not a coding agent.
 */
export function createPlannerFixtureAgent(): LocalAgentAdapter {
  return {
    adapterId: "planner.fixture-agent",
    adapterVersion: "1.0.0",
    async run(context: LocalAgentRunContext): Promise<LocalAgentRunOutcome> {
      await context.assertActive();
      const root = context.spec.workingDirectory;
      const stamp = shortDigest(context.spec.taskSpecDigest);
      const title = context.spec.instruction.split("\n")[0]?.slice(0, 120) ?? "planner task";
      let target: string | null = null;
      // Prefer the paths a coding agent may actually change (Sources, Tests, docs), and never a
      // dot-directory: `.github/workflows` is a protected CI path the Factory refuses on sight.
      const rank = (path: string): number =>
        path === "Sources" || path.startsWith("Sources/")
          ? 0
          : path === "Tests" || path.startsWith("Tests/")
            ? 1
            : path === "docs" || path.startsWith("docs/")
              ? 2
              : 3;
      const candidates = [...context.spec.authorizedWritePaths]
        .filter((path) => !path.split("/").some((segment) => segment.startsWith(".")))
        .sort((left, right) => rank(left) - rank(right));
      for (const authorized of candidates) {
        const candidate = join(root, authorized);
        if (!existsSync(candidate) || !statSync(candidate).isDirectory()) continue;
        if (authorized === "Sources" || authorized.startsWith("Sources/")) {
          const module = firstChildDirectory(join(root, "Sources"));
          if (module === null) continue;
          target = join(root, "Sources", module, `PlannerRehearsal_${stamp}.swift`);
          writeFileSync(
            target,
            `// Planner rehearsal artifact (${stamp}) -- task: ${title}\nenum PlannerRehearsal_${stamp} {\n    static let task = ${JSON.stringify(title)}\n}\n`,
            "utf8",
          );
          break;
        }
        if (authorized === "Tests" || authorized.startsWith("Tests/")) {
          const module = firstChildDirectory(join(root, "Tests"));
          if (module === null) continue;
          target = join(root, "Tests", module, `PlannerRehearsal_${stamp}Tests.swift`);
          writeFileSync(
            target,
            `import XCTest\n\n// Planner rehearsal artifact (${stamp}) -- task: ${title}\nfinal class PlannerRehearsal_${stamp}Tests: XCTestCase {\n    func testRehearsalArtifactIsPresent() {\n        XCTAssertEqual(${JSON.stringify(stamp)}, ${JSON.stringify(stamp)})\n    }\n}\n`,
            "utf8",
          );
          break;
        }
        const directory = join(root, authorized);
        mkdirSync(directory, { recursive: true });
        target = join(directory, `PLANNER_REHEARSAL_${stamp}.md`);
        writeFileSync(target, `# Planner rehearsal artifact ${stamp}\n\nTask: ${title}\n`, "utf8");
        break;
      }
      if (target === null) {
        return {
          kind: "needs-input",
          blocker: {
            kind: "environment",
            code: NamespacedCodeSchema.parse("planner.fixture-no-writable-scope"),
            summary:
              "None of the task's authorized write paths is an existing directory in the worktree.",
            requiredAction: "Give the task a scope path that exists (Sources, Tests, or docs).",
          },
        };
      }
      const changed = target.slice(root.length + 1);
      return {
        kind: "succeeded",
        summary: `planner-fixture-v1 wrote ${changed} for: ${title}`,
        changedPaths: [changed],
      };
    },
  };
}

function firstChildDirectory(path: string): string | null {
  if (!existsSync(path)) return null;
  const children = readdirSync(path)
    .filter((name) => !name.startsWith(".") && statSync(join(path, name)).isDirectory())
    .sort();
  return children[0] ?? null;
}

// ---------------------------------------------------------------------------
// The registry-backed project resolver
// ---------------------------------------------------------------------------

export type PlannerProjectResolverDependencies = Readonly<{
  config: PlannerExecutionConfigV1;
  runtimeDirectory: string;
  gitRuntimeRoot: string;
  gitWorkspace: GitWorkspaceManager;
  projectRegistry: ProjectRegistryRepository;
  projectPlans: ProjectPlanRepository;
  policyBytes: Uint8Array;
  /** Test seam for the Codex agent factory (never consulted in fixture mode). */
  profileDependencies?: LocalExecutionProfileDependencies;
  /** Diagnostics for a registered repository the resolver could not enroll (never secrets). */
  onDiagnostic?: (message: string) => void;
  /**
   * Test seam: replaces `iosXcodegenVerificationPlansV1` so the chain can be exercised without the
   * Xcode toolchain. Production callers omit it; the daemon entrypoint never sets it.
   */
  verificationPlansFor?: (moduleName: string) => VerifiedLocalExecutionProject["verificationPlans"];
}>;

/**
 * The reviewed protected-path allowance planner execution grants every resolved project: new test
 * files under the test target may be ADDED (never modified or removed) -- `test-file-addition`, the
 * same allowance the Hindsight pilot's reviewed extension carried. Everything else the default
 * classifier protects (CI, project.yml, policy, signing, trust-boundary paths, existing tests) stays
 * protected: the seeded scaffold's `project.yml`/CI never move under an agent's hands.
 */
export const IOS_XCODEGEN_PROTECTED_PATH_EXTENSION_V1: ProtectedPathPolicyExtensionV1 = {
  schemaVersion: 1,
  additionalTrustBoundaryPathPrefixes: [],
  additionalTrustBoundarySegments: [],
  additionalPolicyMarkers: [],
  allowances: ["test-file-addition"],
};

/**
 * The Codex sandbox's read-only paths for planner execution -- deliberately NOT
 * `buildCodexAgentForProject`'s enrolled-profile default (see that function's doc in
 * local-execution-profile.ts for the full containment-boundary rationale). A from-scratch app has no
 * tests until the agent writes them: `BUILD_TEMPLATES_V1` above authorizes every build item to write
 * under `Tests` (and `Sources`), so those two must NOT be sandbox-read-only here, or every build item
 * fails closed with "Authorized write path Tests overlaps read-only path Tests" before the agent ever
 * runs.
 *
 * What stays read-only mirrors what `IOS_XCODEGEN_PROTECTED_PATH_EXTENSION_V1` still protects, so the
 * two containment layers agree: it grants `test-file-addition` only, never `xcode-project-membership`,
 * so `project.yml` stays protected (classifyProtectedPath's default, unrelaxed here) -- and CI
 * configuration is always protected with no relaxable class at all. No planner task template ever
 * authorizes writing to either, so this is belt-and-suspenders: it stops a misbehaving or
 * future-mistemplated task from even attempting the write at the sandbox level, instead of relying
 * solely on post-hoc candidate-policy rejection. `Package.swift` is kept for the same reason
 * (`buildCodexAgentForProject`'s enrolled default carries it, no planner template ever needs it, and
 * classifyProtectedPath protects it unconditionally with no relaxable class either).
 */
export const PLANNER_CODEX_READ_ONLY_PATHS_V1 = [
  "Package.swift",
  "project.yml",
  ".github",
] as const;

export type PlannerProjectResolver = Readonly<{
  resolveProject: (repositoryId: string) => Promise<VerifiedLocalExecutionProject | null>;
  /** sha256 of `policyBytes` -- what `plan.execute` must stamp on every submitted task. */
  policyDigest: Sha256Digest;
}>;

function planAuthorizes(
  plans: readonly ProjectPlanV1[],
  repositoryId: RepositoryId,
  taskSpec: TaskSpecV1,
): boolean {
  return plans.some(
    (plan) =>
      plan.repositoryId === repositoryId &&
      (plan.state === "approved" || plan.state === "executing" || plan.state === "complete") &&
      plan.items.some((item) => item.kind === "task" && item.taskId === taskSpec.taskId),
  );
}

export function createPlannerProjectResolver(
  dependencies: PlannerProjectResolverDependencies,
): PlannerProjectResolver {
  const policy = decodeReviewedPolicyPayload(dependencies.policyBytes);
  const agents = new Map<RepositoryId, Promise<AgentFields>>();
  const diagnostic = dependencies.onDiagnostic ?? (() => undefined);

  type AgentFields = Pick<
    VerifiedLocalExecutionProject,
    | "agent"
    | "environmentAllowlist"
    | "requireAgentProtocolEvidence"
    | "agentInvocationEnvironmentNames"
    | "agentInvocationIdentity"
    | "agentLimits"
  >;

  function agentFor(
    repositoryId: RepositoryId,
    sourceRepositoryPath: string,
  ): Promise<AgentFields> {
    const existing = agents.get(repositoryId);
    if (existing !== undefined) return existing;
    const created = (async (): Promise<AgentFields> => {
      if (
        dependencies.config.mode === "planner-fixture-v1" ||
        dependencies.config.codex === undefined
      ) {
        return { agent: createPlannerFixtureAgent() };
      }
      const built = await buildCodexAgentForProject(
        dependencies.config.codex,
        sourceRepositoryPath,
        dependencies.runtimeDirectory,
        dependencies.profileDependencies ?? {},
        PLANNER_CODEX_READ_ONLY_PATHS_V1,
      );
      return {
        agent: built.agent,
        environmentAllowlist: built.environmentAllowlist,
        requireAgentProtocolEvidence: built.requireAgentProtocolEvidence,
        agentInvocationEnvironmentNames: built.agentInvocationEnvironmentNames,
        agentInvocationIdentity: built.agentInvocationIdentity,
        agentLimits: built.agentLimits,
      };
    })();
    agents.set(repositoryId, created);
    created.catch(() => agents.delete(repositoryId));
    return created;
  }

  return {
    policyDigest: policy.digest,
    async resolveProject(repositoryIdInput) {
      const parsed = RepositoryIdSchema.safeParse(repositoryIdInput);
      if (!parsed.success) return null;
      const repositoryId = parsed.data;
      const registered = dependencies.projectRegistry.findByRepositoryId(repositoryId);
      if (registered === null) return null;

      let mirror;
      try {
        mirror = dependencies.gitWorkspace.openExistingMirror({
          runtimeRoot: dependencies.gitRuntimeRoot,
          repositoryId,
        });
      } catch (error) {
        diagnostic(
          `planner execution: registered project ${registered.slug} has no openable Factory mirror${
            error instanceof GitWorkspaceError ? `: ${error.message}` : ""
          }`,
        );
        return null;
      }
      const root = dependencies.gitWorkspace.readSealedRootBinding(mirror);
      const tip = dependencies.gitWorkspace.readImmutableMirrorBindingTip(mirror);
      if (root.sourceRepositoryPath !== registered.sourceRepositoryPath) {
        diagnostic(
          `planner execution: registered project ${registered.slug}'s mirror was sealed for a different source path`,
        );
        return null;
      }
      const moduleName = readXcodegenProjectName(mirror.mirrorPath, tip.baseCommit);
      if (moduleName === null) {
        diagnostic(
          `planner execution: registered project ${registered.slug} has no XcodeGen project.yml at ${tip.baseCommit}; ios-xcodegen-v1 cannot verify it`,
        );
        return null;
      }
      const agentFields = await agentFor(repositoryId, registered.sourceRepositoryPath);
      const authorizeTask = (taskSpec: TaskSpecV1): TaskAuthorizationV1 => {
        const plans = dependencies.projectPlans.listByProject(taskSpec.projectId);
        if (planAuthorizes(plans, repositoryId, taskSpec)) return { authorized: true };
        return {
          authorized: false,
          code: "plan.task-not-in-approved-plan",
          message:
            "Planner execution runs only the task items of a plan the owner approved for this repository; this task is not one of them.",
          suggestion:
            "Propose and approve a plan (plan.propose / plan.approve) that contains this task, then execute it through plan.execute.",
        };
      };
      const project: VerifiedLocalExecutionProject = {
        repositoryId,
        sourceRepositoryPath: registered.sourceRepositoryPath,
        mirrorMode: "prepared-immutable",
        sourceIdentityDigest: root.sourceIdentityDigest as Sha256Digest,
        enrollmentBase: { commit: root.baseCommit, tree: root.baseTree },
        allowedBaseCommit: tip.baseCommit,
        allowedBaseTree: tip.baseTree,
        authorizeTask,
        policyBytes: policy.bytes,
        reviewerForRun: (reviewerRunId) =>
          genericProjectReviewer(mirror.mirrorPath, dependencies.config.reviewer, reviewerRunId),
        verificationPlans:
          dependencies.verificationPlansFor === undefined
            ? iosXcodegenVerificationPlansV1(moduleName, dependencies.config.verification)
            : dependencies.verificationPlansFor(moduleName),
        ...(dependencies.config.candidatePolicyLimits === undefined
          ? {}
          : { candidatePolicyLimits: dependencies.config.candidatePolicyLimits }),
        protectedPathPolicyExtension: IOS_XCODEGEN_PROTECTED_PATH_EXTENSION_V1,
        ...agentFields,
      };
      return project;
    },
  };
}

/** Where a project's mirror lives, for operator diagnostics only. */
export function plannerMirrorPathFor(gitRuntimeRoot: string, repositoryId: string): string {
  return join(gitRuntimeRoot, "mirrors", `${repositoryId}.git`);
}
