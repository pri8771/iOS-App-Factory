import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";
import {
  CanonicalPolicySourceV1Schema,
  compilePolicyBundle,
  verifyPolicyBundle,
  type CanonicalPolicySourceV1,
  type PolicyBundleV1,
} from "@app-factory/policy-engine";
import { scanExistingProject, type EnrollmentScanV1 } from "@app-factory/project-sdk";
import { z } from "zod";

import { PolicySourceSidecarV1Schema, type PolicySourceSidecarV1 } from "./sidecar.js";

export * from "./sidecar.js";

/** Largest policy source / sidecar file this package will read. */
const MAX_JSON_BYTES = 4 * 1024 * 1024;

export class PolicyCorpusError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PolicyCorpusError";
  }
}

function digestBytes(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

/** Reads a bounded JSON file. Symbolic links are not followed. */
export function readJsonFile(path: string): unknown {
  if (!isAbsolute(path)) throw new PolicyCorpusError("JSON path must be absolute");
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new PolicyCorpusError(`JSON file cannot be opened safely: ${path}`, { cause: error });
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) throw new PolicyCorpusError(`JSON path is not a regular file: ${path}`);
    if (stats.size > MAX_JSON_BYTES) {
      throw new PolicyCorpusError(`JSON file exceeds the ${String(MAX_JSON_BYTES)} byte limit`);
    }
    const text = readFileSync(descriptor, "utf8");
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new PolicyCorpusError(`JSON file is not valid JSON: ${path}`, { cause: error });
    }
  } finally {
    closeSync(descriptor);
  }
}

export function loadPolicySource(path: string): CanonicalPolicySourceV1 {
  return CanonicalPolicySourceV1Schema.parse(readJsonFile(path));
}

export function loadPolicySidecar(path: string): PolicySourceSidecarV1 {
  return PolicySourceSidecarV1Schema.parse(readJsonFile(path));
}

/**
 * Compiles a canonical policy source with the policy engine. `generatedAt` must be an explicit
 * ISO instant so the bundle digest is reproducible; this package never reads the clock.
 */
export function compilePolicySource(sourceInput: unknown, generatedAt: string): PolicyBundleV1 {
  return compilePolicyBundle(sourceInput, generatedAt);
}

/**
 * Cross-checks the sidecar against the compiled source. Returns a sorted list of mismatch
 * descriptions; an empty list means the two documents agree.
 */
export function crossCheckSidecar(
  source: CanonicalPolicySourceV1,
  sidecar: PolicySourceSidecarV1,
): readonly string[] {
  const mismatches: string[] = [];
  if (sidecar.policyId !== source.policyId) mismatches.push("policyId differs");
  if (sidecar.policyVersion !== source.policyVersion) mismatches.push("policyVersion differs");

  const principleIndexes = new Set(sidecar.principleSources.map((entry) => entry.index));
  source.principles.forEach((_, index) => {
    if (!principleIndexes.has(index)) mismatches.push(`principle ${String(index)} has no source`);
  });
  for (const index of principleIndexes) {
    if (index >= source.principles.length) {
      mismatches.push(`principle source ${String(index)} has no principle`);
    }
  }

  const ruleIds = new Set(source.rules.map((rule) => rule.ruleId));
  const sidecarRuleIds = new Set(sidecar.ruleSources.map((entry) => entry.ruleId));
  for (const ruleId of ruleIds) {
    if (!sidecarRuleIds.has(ruleId)) mismatches.push(`rule ${ruleId} has no source`);
  }
  for (const ruleId of sidecarRuleIds) {
    if (!ruleIds.has(ruleId)) mismatches.push(`rule source ${ruleId} has no rule`);
  }

  const requiredChecks = new Map<string, string>(
    source.rules.map((rule) => [rule.requiredCheck, rule.enforcement]),
  );
  const registered = new Map<string, string>(
    sidecar.checkRegistry.map((entry) => [entry.check, entry.kind]),
  );
  for (const [check, enforcement] of requiredChecks) {
    const kind = registered.get(check);
    if (kind === undefined) mismatches.push(`check ${check} is not registered`);
    else if (kind !== enforcement) {
      mismatches.push(`check ${check} is registered as ${kind} but enforced as ${enforcement}`);
    }
  }
  for (const check of registered.keys()) {
    if (!requiredChecks.has(check)) mismatches.push(`registered check ${check} is unused`);
  }
  for (const rule of source.rules) {
    const entry = sidecar.ruleSources.find((candidate) => candidate.ruleId === rule.ruleId);
    if (entry !== undefined && entry.humanOnly && rule.enforcement !== "approval") {
      mismatches.push(`rule ${rule.ruleId} is human-only but not approval-enforced`);
    }
  }
  return mismatches.sort((left, right) => left.localeCompare(right));
}

export type MaterializedPolicyFileV1 = Readonly<{
  path: string;
  digest: Sha256Digest;
  byteCount: number;
}>;

export type MaterializePolicyBundleOptions = Readonly<{
  bundle: PolicyBundleV1;
  /** Normalized absolute path to an existing real directory (not a symlink). */
  root: string;
  /** Replace files that already exist. Default: refuse. */
  overwrite?: boolean;
}>;

function canonicalRoot(root: string): string {
  if (!isAbsolute(root) || resolve(root) !== root) {
    throw new PolicyCorpusError("materialize root must be a normalized absolute path");
  }
  let stats;
  try {
    stats = lstatSync(root);
  } catch (error) {
    throw new PolicyCorpusError(`materialize root cannot be inspected: ${root}`, { cause: error });
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new PolicyCorpusError("materialize root must be a real directory");
  }
  if (realpathSync(root) !== root) {
    throw new PolicyCorpusError("materialize root traverses a symbolic link");
  }
  return root;
}

function ensureRealParent(root: string, target: string): void {
  const parent = dirname(target);
  let current = root;
  for (const segment of relative(root, parent).split(sep).filter(Boolean)) {
    current = join(current, segment);
    let stats;
    try {
      stats = lstatSync(current);
    } catch {
      mkdirSync(current);
      continue;
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new PolicyCorpusError(`materialize parent is not a real directory: ${current}`);
    }
  }
}

/**
 * Writes every generated file of a compiled bundle beneath `root`, refusing to follow symbolic
 * links or escape the root, then re-verifies the materialized tree byte-for-byte with the policy
 * engine. Any failure leaves the caller to inspect the partial state; nothing is silently kept.
 */
export function materializePolicyBundle(
  options: MaterializePolicyBundleOptions,
): readonly MaterializedPolicyFileV1[] {
  const root = canonicalRoot(options.root);
  const overwrite = options.overwrite ?? false;
  const written: MaterializedPolicyFileV1[] = [];
  for (const file of options.bundle.files) {
    const target = join(root, ...file.path.split("/"));
    const child = relative(root, target);
    if (child.startsWith(`..${sep}`) || child === ".." || isAbsolute(child)) {
      throw new PolicyCorpusError(`generated path escapes the root: ${file.path}`);
    }
    ensureRealParent(root, target);
    let existing;
    try {
      existing = lstatSync(target);
    } catch {
      existing = null;
    }
    if (existing !== null) {
      if (existing.isSymbolicLink() || !existing.isFile()) {
        throw new PolicyCorpusError(`refusing to replace a non-regular file: ${file.path}`);
      }
      if (!overwrite) {
        throw new PolicyCorpusError(`file already exists (pass overwrite): ${file.path}`);
      }
    }
    const flags =
      constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      (overwrite ? constants.O_TRUNC : constants.O_EXCL);
    const descriptor = openSync(target, flags, 0o644);
    try {
      const bytes = Buffer.from(file.contents, "utf8");
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
      written.push({ path: file.path, digest: file.digest, byteCount: bytes.length });
    } finally {
      closeSync(descriptor);
    }
  }
  verifyPolicyBundle(root, options.bundle);
  return written;
}

const RULE_ISSUE_PREFIXES = ["rules.", "compatibility."] as const;

export const RuleAuthorityReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  repositoryRoot: z.string().min(1),
  headSha: z.string().min(1),
  sourceFingerprint: Sha256DigestSchema,
  ruleFiles: z.array(
    z.strictObject({
      path: z.string().min(1),
      kind: z.string().min(1),
      status: z.enum(["canonical", "conforming", "nonconforming", "missing-authority"]),
      declarationCount: z.number().int().nonnegative(),
      digest: Sha256DigestSchema,
    }),
  ),
  ruleIssues: z.array(
    z.strictObject({
      code: z.string().min(1),
      severity: z.enum(["blocker", "warning", "gap"]),
      paths: z.array(z.string()),
    }),
  ),
  declarationConflicts: z.array(z.string().min(1)),
  otherBlockerCodes: z.array(z.string().min(1)),
  /** True when the named enrollment blocker is absent from the scan. */
  cleared: z.strictObject({
    "rules.canonical-unverifiable": z.boolean(),
    "rules.adapter-nonconforming": z.boolean(),
    "compatibility.legacy-factory-layout": z.boolean(),
    "rules.conflicting-declaration": z.boolean(),
  }),
});
export type RuleAuthorityReportV1 = z.infer<typeof RuleAuthorityReportV1Schema>;

/** Projects an enrollment scan onto the rule-authority findings this package cares about. */
export function reportRuleAuthority(
  scan: EnrollmentScanV1,
  repositoryRoot: string,
): RuleAuthorityReportV1 {
  const ruleIssues = scan.issues.filter((issue) =>
    RULE_ISSUE_PREFIXES.some((prefix) => issue.code.startsWith(prefix)),
  );
  const codes = new Set(ruleIssues.map((issue) => issue.code));
  return RuleAuthorityReportV1Schema.parse({
    schemaVersion: 1,
    repositoryRoot,
    headSha: scan.after.headSha,
    sourceFingerprint: scan.plan.sourceFingerprint,
    ruleFiles: scan.inventory.ruleFiles.map((file) => ({
      path: file.path,
      kind: file.kind,
      status: file.authority.status,
      declarationCount: file.declarations.length,
      digest: file.digest,
    })),
    ruleIssues: ruleIssues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      paths: [...issue.paths],
    })),
    declarationConflicts: scan.inventory.effectiveRules
      .filter((rule) => rule.conflict)
      .map((rule) => rule.key)
      .sort((left, right) => left.localeCompare(right)),
    otherBlockerCodes: [
      ...new Set(
        scan.issues
          .filter((issue) => issue.severity === "blocker" && !ruleIssues.includes(issue))
          .map((issue) => issue.code),
      ),
    ].sort((left, right) => left.localeCompare(right)),
    cleared: {
      "rules.canonical-unverifiable": !codes.has("rules.canonical-unverifiable"),
      "rules.adapter-nonconforming": !codes.has("rules.adapter-nonconforming"),
      "compatibility.legacy-factory-layout": !codes.has("compatibility.legacy-factory-layout"),
      "rules.conflicting-declaration": !codes.has("rules.conflicting-declaration"),
    },
  });
}

/** Runs the read-only project scanner and reports the rule-authority findings. */
export function scanRuleAuthority(repositoryRoot: string): RuleAuthorityReportV1 {
  if (!isAbsolute(repositoryRoot) || !statSync(repositoryRoot).isDirectory()) {
    throw new PolicyCorpusError("repositoryRoot must be an absolute directory path");
  }
  return reportRuleAuthority(scanExistingProject({ repositoryRoot }), repositoryRoot);
}

export function digestOf(text: string): Sha256Digest {
  return digestBytes(Buffer.from(text, "utf8"));
}
