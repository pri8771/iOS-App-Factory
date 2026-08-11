import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  PolicyLockV1Schema,
  RelativePathSchema,
  Sha256DigestSchema,
  type PolicyLockV1,
  type RelativePath,
  type Sha256Digest,
} from "@app-factory/contracts";
import { z } from "zod";

const RuleIdSchema = z.string().regex(/^rule\.[a-z0-9]+(?:[.-][a-z0-9]+)+$/);

export const CanonicalPolicySourceV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    policyId: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/),
    policyVersion: z.number().int().positive(),
    title: z.string().min(1).max(200),
    authority: z.literal("AGENTS.md"),
    principles: z.array(z.string().min(1).max(2_000)).min(1).max(100),
    rules: z
      .array(
        z.strictObject({
          ruleId: RuleIdSchema,
          statement: z.string().min(1).max(4_000),
          enforcement: z.enum(["trusted-check", "broker", "approval", "review"]),
          requiredCheck: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/),
        }),
      )
      .min(1)
      .max(500),
    protectedSurfaces: z
      .array(
        z.strictObject({
          path: RelativePathSchema,
          classification: z.enum([
            "policy",
            "ci",
            "test-harness",
            "baseline",
            "quality-threshold",
            "signing",
            "release",
          ]),
          changeApprovalAction: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/),
        }),
      )
      .min(1)
      .max(1_000),
  })
  .superRefine((source, context) => {
    for (const values of [
      source.rules.map((rule) => rule.ruleId),
      source.protectedSurfaces.map((surface) => surface.path),
    ]) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: "policy entries must be unique" });
      }
    }
  });
export type CanonicalPolicySourceV1 = z.infer<typeof CanonicalPolicySourceV1Schema>;

export type PolicyClient = "codex" | "claude" | "cursor" | "antigravity";

export type GeneratedPolicyFile = Readonly<{
  client: PolicyClient | "all";
  path: RelativePath;
  contents: string;
  digest: Sha256Digest;
}>;

export type PolicyBundleV1 = Readonly<{
  schemaVersion: 1;
  source: CanonicalPolicySourceV1;
  sourceDigest: Sha256Digest;
  files: readonly GeneratedPolicyFile[];
  lock: PolicyLockV1;
  bundleDigest: Sha256Digest;
}>;

export type ResolvedPolicyContextV1 = Readonly<{
  schemaVersion: 1;
  client: PolicyClient;
  policyId: string;
  policyVersion: number;
  policyDigest: Sha256Digest;
  sourceDigest: Sha256Digest;
  instructionFiles: readonly Readonly<{ path: RelativePath; digest: Sha256Digest }>[];
  requiredChecks: readonly string[];
}>;

export class PolicyEngineError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PolicyEngineError";
  }
}

function canonical(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function digest(value: Uint8Array | string): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(value).digest("hex")}`);
}

function renderAuthority(source: CanonicalPolicySourceV1): string {
  const principles = source.principles.map((item) => `- ${item}`).join("\n");
  const rules = source.rules
    .map(
      (rule) =>
        `- \`${rule.ruleId}\`: ${rule.statement} (enforced by \`${rule.enforcement}\`; check \`${rule.requiredCheck}\`)`,
    )
    .join("\n");
  const protectedSurfaces = source.protectedSurfaces
    .map(
      (surface) =>
        `- \`${surface.path}\` — ${surface.classification}; changes require \`${surface.changeApprovalAction}\`.`,
    )
    .join("\n");
  return `# ${source.title}\n\n## Authority\n\nThis AGENTS.md is the canonical instruction authority for every coding client.\nGenerated client files may point here but cannot weaken it.\n\n## Principles\n\n${principles}\n\n## Enforced rules\n\n${rules}\n\n## Protected surfaces\n\n${protectedSurfaces}\n\n## Completion\n\nAgent prose is never proof of completion. The broker, trusted checks, independent review, and approval records are authoritative.\n`;
}

function generatedFile(
  client: GeneratedPolicyFile["client"],
  path: string,
  contents: string,
): GeneratedPolicyFile {
  return { client, path: RelativePathSchema.parse(path), contents, digest: digest(contents) };
}

export function compilePolicyBundle(sourceInput: unknown, generatedAt: unknown): PolicyBundleV1 {
  const source = CanonicalPolicySourceV1Schema.parse(sourceInput);
  const generatedAtValue = z.iso.datetime({ offset: false, precision: 3 }).parse(generatedAt);
  const authority = generatedFile("all", "AGENTS.md", renderAuthority(source));
  const files: GeneratedPolicyFile[] = [
    authority,
    generatedFile(
      "claude",
      "CLAUDE.md",
      "# Generated App Factory client adapter\n\n@AGENTS.md\n\nAGENTS.md is authoritative. This file may not override or weaken it.\n",
    ),
    generatedFile(
      "cursor",
      ".cursor/rules/app-factory.mdc",
      "---\ndescription: App Factory canonical engineering policy\nalwaysApply: true\n---\n\nRead and follow AGENTS.md at the repository root. It is authoritative; this adapter adds no exceptions.\n",
    ),
    generatedFile(
      "antigravity",
      "GEMINI.md",
      "# Generated App Factory client adapter\n\nRead and follow AGENTS.md at the repository root. It is authoritative; this adapter adds no exceptions.\n",
    ),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const sourceDigest = digest(canonical(source));
  const requiredChecks = [...new Set(source.rules.map((rule) => rule.requiredCheck))].sort();
  const lock = PolicyLockV1Schema.parse({
    schemaVersion: 1,
    policyId: source.policyId,
    policyVersion: source.policyVersion,
    policyDigest: sourceDigest,
    authorityFiles: files.map((file) => ({ path: file.path, digest: file.digest })),
    protectedSurfaces: [
      ...files.map((file) => ({
        path: file.path,
        classification: "policy" as const,
        changeApprovalAction: "policy.generated-file-change",
      })),
      ...source.protectedSurfaces,
    ],
    requiredChecks,
    generatedAt: generatedAtValue,
  });
  const core = { schemaVersion: 1 as const, source, sourceDigest, files, lock };
  return { ...core, bundleDigest: digest(canonical(core)) };
}

function canonicalRoot(root: string): string {
  if (!isAbsolute(root) || resolve(root) !== root) {
    throw new PolicyEngineError("policy root must be a normalized absolute path");
  }
  const stats = lstatSync(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new PolicyEngineError("policy root must be a real directory");
  }
  const real = realpathSync(root);
  if (real !== root) throw new PolicyEngineError("policy root traverses a symbolic link");
  return real;
}

function readExact(root: string, file: GeneratedPolicyFile): void {
  const path = join(root, ...file.path.split("/"));
  const child = relative(root, path);
  if (child.startsWith(`..${sep}`) || child === ".." || isAbsolute(child)) {
    throw new PolicyEngineError(`policy path escaped the root: ${file.path}`);
  }
  const parent = dirname(path);
  let realParent: string;
  try {
    realParent = realpathSync(parent);
  } catch (error) {
    throw new PolicyEngineError(`policy parent cannot be resolved safely: ${file.path}`, {
      cause: error,
    });
  }
  if (realParent !== parent) {
    throw new PolicyEngineError(`policy path traverses a symbolic link: ${file.path}`);
  }
  let currentParent = root;
  for (const segment of relative(root, parent).split(sep).filter(Boolean)) {
    currentParent = join(currentParent, segment);
    const stats = lstatSync(currentParent);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new PolicyEngineError(`policy parent is not a real directory: ${file.path}`);
    }
  }
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new PolicyEngineError(`policy file cannot be opened safely: ${file.path}`, {
      cause: error,
    });
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new PolicyEngineError(`policy file is not a real file: ${file.path}`);
    }
    const bytes = readFileSync(descriptor);
    if (digest(bytes) !== file.digest || bytes.toString("utf8") !== file.contents) {
      throw new PolicyEngineError(`generated policy drift: ${file.path}`);
    }
  } finally {
    closeSync(descriptor);
  }
}

export function verifyPolicyBundle(rootInput: string, bundle: PolicyBundleV1): void {
  const root = canonicalRoot(rootInput);
  const expected = compilePolicyBundle(bundle.source, bundle.lock.generatedAt);
  if (canonical(expected) !== canonical(bundle)) {
    throw new PolicyEngineError("policy bundle does not match canonical compiler output");
  }
  for (const file of expected.files) readExact(root, file);
}

export function resolvePolicyContext(
  root: string,
  bundle: PolicyBundleV1,
  client: PolicyClient,
): ResolvedPolicyContextV1 {
  verifyPolicyBundle(root, bundle);
  const authority = bundle.files.find((file) => file.path === "AGENTS.md");
  const adapter = bundle.files.find((file) => file.client === client);
  if (authority === undefined) throw new PolicyEngineError("AGENTS.md authority is missing");
  const instructionFiles = [authority, ...(adapter === undefined ? [] : [adapter])]
    .map((file) => ({ path: file.path, digest: file.digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: 1,
    client,
    policyId: bundle.lock.policyId,
    policyVersion: bundle.lock.policyVersion,
    policyDigest: bundle.lock.policyDigest,
    sourceDigest: bundle.sourceDigest,
    instructionFiles,
    requiredChecks: bundle.lock.requiredChecks,
  };
}
