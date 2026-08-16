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
  IsoInstantSchema,
  PolicyLockV1Schema,
  ProjectLifecycleStageV1Schema,
  RelativePathSchema,
  Sha256DigestSchema,
  StableKeySchema,
  type IsoInstant,
  type PolicyLockV1,
  type RelativePath,
  type Sha256Digest,
} from "@app-factory/contracts";
import { z } from "zod";

const NAMESPACED_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/;
const RuleIdSchema = z.string().regex(/^rule\.[a-z0-9]+(?:[.-][a-z0-9]+)+$/);
const WaiverIdSchema = z.string().regex(/^waiver\.[a-z0-9]+(?:[.-][a-z0-9]+)+$/);
const CheckIdSchema = z.string().regex(NAMESPACED_CODE_PATTERN);
const ApprovalActionSchema = z.string().regex(NAMESPACED_CODE_PATTERN);

/**
 * How a rule is enforced. `review` is the independent read-only review agent;
 * `human-approval` is a human gate and is deliberately distinct from it.
 */
export const PolicyEnforcementV1Schema = z.enum([
  "trusted-check",
  "broker",
  "approval",
  "review",
  "human-approval",
]);
export type PolicyEnforcementV1 = z.infer<typeof PolicyEnforcementV1Schema>;

/**
 * Enforcement vocabulary used by the separately versioned rules corpus, mapped
 * onto this engine's enforcement enum. `human_review_required` is a human gate,
 * never the independent-review agent.
 */
export const CORPUS_ENFORCEMENT_ALIASES_V1 = Object.freeze({
  human_review_required: "human-approval",
} as const) satisfies Readonly<Record<string, PolicyEnforcementV1>>;

/**
 * Escalation ladder used only to decide whether a refinement tightens or
 * loosens the rule it refines: who must be satisfied. Machine enforcement
 * (trusted check, broker) < independent-review agent < approval record <
 * human approval. A refinement may climb this ladder, never descend it.
 */
const ENFORCEMENT_ASSURANCE_RANK: Readonly<Record<PolicyEnforcementV1, number>> = {
  "trusted-check": 0,
  broker: 0,
  review: 1,
  approval: 2,
  "human-approval": 3,
};

export const PolicyOwnerV1Schema = z.enum(["human", "machine"]);
export type PolicyOwnerV1 = z.infer<typeof PolicyOwnerV1Schema>;

/** Authority layers, highest first. Lower layers may only tighten higher ones. */
export const POLICY_AUTHORITY_LAYERS_V1 = [
  "human",
  "studio-os",
  "domain-standard",
  "repo",
  "task",
  "inference",
] as const;
export const PolicyAuthorityLayerV1Schema = z.enum(POLICY_AUTHORITY_LAYERS_V1);
export type PolicyAuthorityLayerV1 = z.infer<typeof PolicyAuthorityLayerV1Schema>;
/** A rule that declares no layer belongs to the repository's own policy. */
export const DEFAULT_POLICY_AUTHORITY_LAYER_V1: PolicyAuthorityLayerV1 = "repo";

function authorityRank(layer: PolicyAuthorityLayerV1): number {
  return POLICY_AUTHORITY_LAYERS_V1.indexOf(layer);
}

/** Negative when `left` carries more authority than `right`. */
export function comparePolicyAuthority(
  left: PolicyAuthorityLayerV1,
  right: PolicyAuthorityLayerV1,
): number {
  return authorityRank(left) - authorityRank(right);
}

function uniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Where a rule (or waiver) applies. Every present dimension is a non-empty
 * allow-list; an absent dimension places no restriction. A rule with no
 * `appliesTo` at all is global.
 */
export const RuleScopeV1Schema = z
  .strictObject({
    phases: z.array(StableKeySchema).min(1).max(100).optional(),
    lifecycleStages: z.array(ProjectLifecycleStageV1Schema).min(1).max(20).optional(),
    taskKinds: z.array(StableKeySchema).min(1).max(100).optional(),
    paths: z.array(RelativePathSchema).min(1).max(1_000).optional(),
  })
  .superRefine((scope, context) => {
    for (const key of ["phases", "lifecycleStages", "taskKinds", "paths"] as const) {
      const values = scope[key];
      if (values !== undefined && !uniqueValues(values)) {
        context.addIssue({ code: "custom", path: [key], message: "scope values must be unique" });
      }
    }
  });
export type RuleScopeV1 = z.infer<typeof RuleScopeV1Schema>;

export const RuleV1Schema = z
  .strictObject({
    ruleId: RuleIdSchema,
    statement: z.string().min(1).max(4_000),
    enforcement: PolicyEnforcementV1Schema,
    requiredCheck: CheckIdSchema,
    /** Absent = global. */
    appliesTo: RuleScopeV1Schema.optional(),
    /** Absent = {@link DEFAULT_POLICY_AUTHORITY_LAYER_V1}. */
    layer: PolicyAuthorityLayerV1Schema.optional(),
    /** Absent = `human` for `human-approval` enforcement, otherwise `machine`. */
    owner: PolicyOwnerV1Schema.optional(),
    /**
     * A rule in a strictly lower authority layer may refine (tighten) a rule
     * above it. The refined rule stays in force; the refinement may only
     * escalate enforcement and never hands a human-owned rule to a machine.
     */
    refines: RuleIdSchema.optional(),
  })
  .superRefine((rule, context) => {
    if (rule.owner === "machine" && rule.enforcement === "human-approval") {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: "a human-approval rule cannot be machine-owned",
      });
    }
    if (rule.refines !== undefined && rule.refines === rule.ruleId) {
      context.addIssue({
        code: "custom",
        path: ["refines"],
        message: "a rule cannot refine itself",
      });
    }
  });
export type RuleV1 = z.infer<typeof RuleV1Schema>;

/** A registered check that a rule's `requiredCheck` must resolve to. */
export const RequiredCheckV1Schema = z
  .strictObject({
    checkId: CheckIdSchema,
    kind: PolicyEnforcementV1Schema,
    description: z.string().min(1).max(2_000),
    /** Absent = `human` for `human-approval` checks, otherwise `machine`. */
    owner: PolicyOwnerV1Schema.optional(),
  })
  .superRefine((check, context) => {
    if (check.owner === "machine" && check.kind === "human-approval") {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: "a human-approval check cannot be machine-owned",
      });
    }
  });
export type RequiredCheckV1 = z.infer<typeof RequiredCheckV1Schema>;

/**
 * A human-approved, time-bounded substitution of one rule's verification.
 * A waiver never deletes a rule: the rule stays in the effective set marked
 * `waived`, together with the replacement verification. Expired, unmatched,
 * or out-of-scope waivers have no effect (fail closed).
 */
export const WaiverV1Schema = z.strictObject({
  waiverId: WaiverIdSchema,
  ruleId: RuleIdSchema,
  scope: RuleScopeV1Schema,
  reason: z.string().min(1).max(2_000),
  replacementVerification: z.strictObject({
    statement: z.string().min(1).max(2_000),
    requiredCheck: CheckIdSchema.optional(),
  }),
  approver: z.strictObject({
    owner: z.literal("human"),
    principal: z.string().min(1).max(200),
  }),
  expiresAt: IsoInstantSchema,
  evidenceDigest: Sha256DigestSchema.optional(),
});
export type WaiverV1 = z.infer<typeof WaiverV1Schema>;

export const PolicyClientV1Schema = z.enum(["codex", "claude", "cursor", "antigravity", "copilot"]);
export type PolicyClientV1 = z.infer<typeof PolicyClientV1Schema>;
export type PolicyClient = PolicyClientV1;

/** Adapter clients generated when a source declares no `clients` (unchanged legacy set). */
export const DEFAULT_POLICY_ADAPTER_CLIENTS_V1: readonly PolicyClient[] = [
  "claude",
  "cursor",
  "antigravity",
];

function effectiveLayer(rule: RuleV1): PolicyAuthorityLayerV1 {
  return rule.layer ?? DEFAULT_POLICY_AUTHORITY_LAYER_V1;
}

function effectiveOwner(
  enforcement: PolicyEnforcementV1,
  owner: PolicyOwnerV1 | undefined,
): PolicyOwnerV1 {
  return owner ?? (enforcement === "human-approval" ? "human" : "machine");
}

export const CanonicalPolicySourceV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    policyId: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/),
    policyVersion: z.number().int().positive(),
    title: z.string().min(1).max(200),
    authority: z.literal("AGENTS.md"),
    principles: z.array(z.string().min(1).max(2_000)).min(1).max(100),
    rules: z.array(RuleV1Schema).min(1).max(500),
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
          changeApprovalAction: ApprovalActionSchema,
        }),
      )
      .min(1)
      .max(1_000),
    /**
     * Clients whose adapter files are generated. Absent =
     * {@link DEFAULT_POLICY_ADAPTER_CLIENTS_V1}; `codex` reads AGENTS.md
     * directly and never gets an adapter file.
     */
    clients: z.array(PolicyClientV1Schema).min(1).max(10).optional(),
    /** Check registry. When present, every `requiredCheck` must resolve into it. */
    checks: z.array(RequiredCheckV1Schema).max(500).optional(),
    waivers: z.array(WaiverV1Schema).max(500).optional(),
  })
  .superRefine((source, context) => {
    for (const values of [
      source.rules.map((rule) => rule.ruleId),
      source.protectedSurfaces.map((surface) => surface.path),
      source.clients ?? [],
      (source.checks ?? []).map((check) => check.checkId),
      (source.waivers ?? []).map((waiver) => waiver.waiverId),
    ]) {
      if (!uniqueValues(values)) {
        context.addIssue({ code: "custom", message: "policy entries must be unique" });
      }
    }

    const rulesById = new Map(source.rules.map((rule) => [rule.ruleId, rule] as const));
    source.rules.forEach((rule, index) => {
      if (rule.refines === undefined) return;
      const parent = rulesById.get(rule.refines);
      const path = ["rules", index, "refines"];
      if (parent === undefined) {
        context.addIssue({ code: "custom", path, message: "refined rule does not exist" });
        return;
      }
      if (comparePolicyAuthority(effectiveLayer(rule), effectiveLayer(parent)) <= 0) {
        context.addIssue({
          code: "custom",
          path,
          message: "a rule may only refine a rule in a strictly higher authority layer",
        });
      }
      if (
        ENFORCEMENT_ASSURANCE_RANK[rule.enforcement] <
        ENFORCEMENT_ASSURANCE_RANK[parent.enforcement]
      ) {
        context.addIssue({
          code: "custom",
          path,
          message: "a refinement may not weaken the enforcement of the rule it refines",
        });
      }
      if (
        effectiveOwner(parent.enforcement, parent.owner) === "human" &&
        effectiveOwner(rule.enforcement, rule.owner) === "machine"
      ) {
        context.addIssue({
          code: "custom",
          path,
          message: "a refinement may not hand a human-owned rule to a machine",
        });
      }
    });

    if (source.checks !== undefined) {
      const checksById = new Map(source.checks.map((check) => [check.checkId, check] as const));
      source.rules.forEach((rule, index) => {
        const check = checksById.get(rule.requiredCheck);
        const path = ["rules", index, "requiredCheck"];
        if (check === undefined) {
          context.addIssue({ code: "custom", path, message: "requiredCheck is not registered" });
        } else if (check.kind !== rule.enforcement) {
          context.addIssue({
            code: "custom",
            path,
            message: "requiredCheck kind does not match the rule enforcement",
          });
        }
      });
      (source.waivers ?? []).forEach((waiver, index) => {
        const replacement = waiver.replacementVerification.requiredCheck;
        if (replacement !== undefined && !checksById.has(replacement)) {
          context.addIssue({
            code: "custom",
            path: ["waivers", index, "replacementVerification", "requiredCheck"],
            message: "replacement requiredCheck is not registered",
          });
        }
      });
    }

    (source.waivers ?? []).forEach((waiver, index) => {
      if (!rulesById.has(waiver.ruleId)) {
        context.addIssue({
          code: "custom",
          path: ["waivers", index, "ruleId"],
          message: "waived rule does not exist",
        });
      }
    });
  });
export type CanonicalPolicySourceV1 = z.infer<typeof CanonicalPolicySourceV1Schema>;

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

function renderScope(scope: RuleScopeV1): string {
  const parts: string[] = [];
  const list = (values: readonly string[]): string =>
    values.map((value) => `\`${value}\``).join(", ");
  if (scope.phases !== undefined) parts.push(`phases ${list(scope.phases)}`);
  if (scope.lifecycleStages !== undefined) {
    parts.push(`lifecycle stages ${list(scope.lifecycleStages)}`);
  }
  if (scope.taskKinds !== undefined) parts.push(`task kinds ${list(scope.taskKinds)}`);
  if (scope.paths !== undefined) parts.push(`paths ${list(scope.paths)}`);
  return parts.length === 0 ? "all contexts" : parts.join("; ");
}

function renderRule(rule: RuleV1): string {
  const parts = [`enforced by \`${rule.enforcement}\``, `check \`${rule.requiredCheck}\``];
  if (rule.layer !== undefined) parts.push(`layer \`${rule.layer}\``);
  if (rule.owner !== undefined) parts.push(`owner \`${rule.owner}\``);
  if (rule.refines !== undefined) parts.push(`tightens \`${rule.refines}\``);
  const scope = rule.appliesTo === undefined ? "" : ` Applies to ${renderScope(rule.appliesTo)}.`;
  return `- \`${rule.ruleId}\`: ${rule.statement} (${parts.join("; ")})${scope}`;
}

function renderCheck(check: RequiredCheckV1): string {
  const owner = check.owner === undefined ? "" : `; owner \`${check.owner}\``;
  return `- \`${check.checkId}\` (kind \`${check.kind}\`${owner}): ${check.description}`;
}

function renderWaiver(waiver: WaiverV1): string {
  const replacementCheck =
    waiver.replacementVerification.requiredCheck === undefined
      ? ""
      : ` (check \`${waiver.replacementVerification.requiredCheck}\`)`;
  const evidence =
    waiver.evidenceDigest === undefined ? "" : ` Evidence \`${waiver.evidenceDigest}\`.`;
  return `- \`${waiver.waiverId}\` waives \`${waiver.ruleId}\` until ${waiver.expiresAt} within ${renderScope(waiver.scope)}; approved by ${waiver.approver.owner} \`${waiver.approver.principal}\`. Reason: ${waiver.reason} Replacement verification: ${waiver.replacementVerification.statement}${replacementCheck}.${evidence}`;
}

function renderAuthority(source: CanonicalPolicySourceV1): string {
  const principles = source.principles.map((item) => `- ${item}`).join("\n");
  const rules = source.rules.map(renderRule).join("\n");
  const checks =
    source.checks === undefined
      ? ""
      : `## Required checks\n\n${source.checks.map(renderCheck).join("\n")}\n\n`;
  const waivers =
    source.waivers === undefined
      ? ""
      : `## Waivers\n\nA waiver substitutes verification for one rule inside its scope until it expires. It never removes the rule; expired or out-of-scope waivers have no effect.\n\n${source.waivers.map(renderWaiver).join("\n")}\n\n`;
  const protectedSurfaces = source.protectedSurfaces
    .map(
      (surface) =>
        `- \`${surface.path}\` — ${surface.classification}; changes require \`${surface.changeApprovalAction}\`.`,
    )
    .join("\n");
  return `# ${source.title}\n\n## Authority\n\nThis AGENTS.md is the canonical instruction authority for every coding client.\nGenerated client files may point here but cannot weaken it.\n\n## Principles\n\n${principles}\n\n## Enforced rules\n\n${rules}\n\n${checks}${waivers}## Protected surfaces\n\n${protectedSurfaces}\n\n## Completion\n\nAgent prose is never proof of completion. The broker, trusted checks, independent review, and approval records are authoritative.\n`;
}

function generatedFile(
  client: GeneratedPolicyFile["client"],
  path: string,
  contents: string,
): GeneratedPolicyFile {
  return { client, path: RelativePathSchema.parse(path), contents, digest: digest(contents) };
}

const ADAPTER_BODY =
  "Read and follow AGENTS.md at the repository root. It is authoritative; this adapter adds no exceptions.\n";

const CLIENT_ADAPTERS: Readonly<
  Record<Exclude<PolicyClient, "codex">, Readonly<{ path: string; contents: string }>>
> = {
  claude: {
    path: "CLAUDE.md",
    contents:
      "# Generated App Factory client adapter\n\n@AGENTS.md\n\nAGENTS.md is authoritative. This file may not override or weaken it.\n",
  },
  cursor: {
    path: ".cursor/rules/app-factory.mdc",
    contents: `---\ndescription: App Factory canonical engineering policy\nalwaysApply: true\n---\n\n${ADAPTER_BODY}`,
  },
  antigravity: {
    path: "GEMINI.md",
    contents: `# Generated App Factory client adapter\n\n${ADAPTER_BODY}`,
  },
  copilot: {
    path: ".github/copilot-instructions.md",
    contents: `# Generated App Factory client adapter\n\n${ADAPTER_BODY}`,
  },
};

function requiredChecksOf(source: CanonicalPolicySourceV1): string[] {
  return [
    ...new Set([
      ...source.rules.map((rule) => rule.requiredCheck),
      ...(source.waivers ?? []).flatMap((waiver) =>
        waiver.replacementVerification.requiredCheck === undefined
          ? []
          : [waiver.replacementVerification.requiredCheck],
      ),
    ]),
  ].sort();
}

export function compilePolicyBundle(sourceInput: unknown, generatedAt: unknown): PolicyBundleV1 {
  const source = CanonicalPolicySourceV1Schema.parse(sourceInput);
  const generatedAtValue = z.iso.datetime({ offset: false, precision: 3 }).parse(generatedAt);
  const authority = generatedFile("all", "AGENTS.md", renderAuthority(source));
  const clients = source.clients ?? DEFAULT_POLICY_ADAPTER_CLIENTS_V1;
  const files: GeneratedPolicyFile[] = [
    authority,
    ...clients.flatMap((client) =>
      client === "codex"
        ? []
        : [generatedFile(client, CLIENT_ADAPTERS[client].path, CLIENT_ADAPTERS[client].contents)],
    ),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const sourceDigest = digest(canonical(source));
  const requiredChecks = requiredChecksOf(source);
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

/**
 * The context an effective rule set is resolved for. Every dimension is
 * optional and unknown context fails closed in both directions: a scoped rule
 * still applies when the selector cannot rule it out, and a waiver only takes
 * effect when the selector positively satisfies its whole scope and `now`.
 */
export const PolicyScopeSelectorV1Schema = z.strictObject({
  phase: StableKeySchema.optional(),
  lifecycleStage: ProjectLifecycleStageV1Schema.optional(),
  taskKind: StableKeySchema.optional(),
  paths: z.array(RelativePathSchema).min(1).max(1_000).optional(),
  now: IsoInstantSchema.optional(),
});
export type PolicyScopeSelectorV1 = z.infer<typeof PolicyScopeSelectorV1Schema>;

export type EffectiveWaiverV1 = Readonly<{
  waiverId: string;
  reason: string;
  replacementVerification: WaiverV1["replacementVerification"];
  approver: WaiverV1["approver"];
  expiresAt: IsoInstant;
  evidenceDigest: Sha256Digest | null;
}>;

export type EffectiveRuleV1 = Readonly<{
  ruleId: string;
  statement: string;
  enforcement: PolicyEnforcementV1;
  requiredCheck: string;
  layer: PolicyAuthorityLayerV1;
  owner: PolicyOwnerV1;
  appliesTo: RuleScopeV1 | null;
  refines: string | null;
  /** The registry entry behind `requiredCheck`, or `null` when the source has no registry. */
  check: RequiredCheckV1 | null;
  status: "enforced" | "waived";
  waiver: EffectiveWaiverV1 | null;
}>;

export type EffectivePolicyV1 = Readonly<{
  schemaVersion: 1;
  policyId: string;
  policyVersion: number;
  policyDigest: Sha256Digest;
  selector: PolicyScopeSelectorV1;
  /** Highest authority first, then by rule ID. */
  rules: readonly EffectiveRuleV1[];
  /** Checks the resolved context must be able to run: enforced rules plus waiver replacements. */
  requiredChecks: readonly string[];
}>;

function pathWithin(candidate: RelativePath, ancestor: RelativePath): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

/** A rule applies unless the selector positively excludes it on some declared dimension. */
function ruleApplies(rule: RuleV1, selector: PolicyScopeSelectorV1): boolean {
  const scope = rule.appliesTo;
  if (scope === undefined) return true;
  const excluded = <T extends string>(
    allowed: readonly T[] | undefined,
    actual: T | undefined,
  ): boolean => allowed !== undefined && actual !== undefined && !allowed.includes(actual);
  if (excluded(scope.phases, selector.phase)) return false;
  if (excluded(scope.lifecycleStages, selector.lifecycleStage)) return false;
  if (excluded(scope.taskKinds, selector.taskKind)) return false;
  const allowedPaths = scope.paths;
  const actualPaths = selector.paths;
  if (
    allowedPaths !== undefined &&
    actualPaths !== undefined &&
    !actualPaths.some((path) => allowedPaths.some((allowed) => pathWithin(path, allowed)))
  ) {
    return false;
  }
  return true;
}

/** A waiver applies only when the selector positively satisfies its entire scope and is not expired. */
function waiverApplies(waiver: WaiverV1, selector: PolicyScopeSelectorV1): boolean {
  if (selector.now === undefined || Date.parse(selector.now) >= Date.parse(waiver.expiresAt)) {
    return false;
  }
  const scope = waiver.scope;
  const satisfied = <T extends string>(
    allowed: readonly T[] | undefined,
    actual: T | undefined,
  ): boolean => allowed === undefined || (actual !== undefined && allowed.includes(actual));
  if (!satisfied(scope.phases, selector.phase)) return false;
  if (!satisfied(scope.lifecycleStages, selector.lifecycleStage)) return false;
  if (!satisfied(scope.taskKinds, selector.taskKind)) return false;
  const allowedPaths = scope.paths;
  const actualPaths = selector.paths;
  if (allowedPaths !== undefined) {
    if (actualPaths === undefined) return false;
    if (!actualPaths.every((path) => allowedPaths.some((allowed) => pathWithin(path, allowed)))) {
      return false;
    }
  }
  return true;
}

/**
 * Resolves the effective rule set of one policy source for a phase, lifecycle
 * stage, task kind, and path set. Rules are ordered by authority
 * (human > studio-os > domain standard > repo > task > inference); refinements
 * never remove the rules they tighten, and waivers never remove a rule from
 * the set — they mark it `waived` and carry the replacement verification.
 */
export function resolveEffectivePolicy(
  sourceInput: unknown,
  selectorInput: unknown,
): EffectivePolicyV1 {
  const source = CanonicalPolicySourceV1Schema.parse(sourceInput);
  const selector = PolicyScopeSelectorV1Schema.parse(selectorInput);
  const checksById = new Map((source.checks ?? []).map((check) => [check.checkId, check] as const));
  const waiversByRule = new Map<string, WaiverV1[]>();
  for (const waiver of [...(source.waivers ?? [])].sort((left, right) =>
    left.waiverId.localeCompare(right.waiverId),
  )) {
    if (!waiverApplies(waiver, selector)) continue;
    const bucket = waiversByRule.get(waiver.ruleId) ?? [];
    bucket.push(waiver);
    waiversByRule.set(waiver.ruleId, bucket);
  }
  const rules: EffectiveRuleV1[] = source.rules
    .filter((rule) => ruleApplies(rule, selector))
    .map((rule): EffectiveRuleV1 => {
      const waiver = waiversByRule.get(rule.ruleId)?.[0];
      return {
        ruleId: rule.ruleId,
        statement: rule.statement,
        enforcement: rule.enforcement,
        requiredCheck: rule.requiredCheck,
        layer: effectiveLayer(rule),
        owner: effectiveOwner(rule.enforcement, rule.owner),
        appliesTo: rule.appliesTo ?? null,
        refines: rule.refines ?? null,
        check: checksById.get(rule.requiredCheck) ?? null,
        status: waiver === undefined ? "enforced" : "waived",
        waiver:
          waiver === undefined
            ? null
            : {
                waiverId: waiver.waiverId,
                reason: waiver.reason,
                replacementVerification: waiver.replacementVerification,
                approver: waiver.approver,
                expiresAt: waiver.expiresAt,
                evidenceDigest: waiver.evidenceDigest ?? null,
              },
      };
    })
    .sort(
      (left, right) =>
        comparePolicyAuthority(left.layer, right.layer) || left.ruleId.localeCompare(right.ruleId),
    );
  const requiredChecks = [
    ...new Set(
      rules.flatMap((rule) => {
        if (rule.status === "enforced") return [rule.requiredCheck];
        const replacement = rule.waiver?.replacementVerification.requiredCheck;
        return replacement === undefined ? [] : [replacement];
      }),
    ),
  ].sort();
  return {
    schemaVersion: 1,
    policyId: source.policyId,
    policyVersion: source.policyVersion,
    policyDigest: digest(canonical(source)),
    selector,
    rules,
    requiredChecks,
  };
}

export type TaskPolicyBindingDecisionV1 =
  | Readonly<{
      schemaVersion: 1;
      verdict: "accepted";
      policyId: string;
      policyVersion: number;
      policyDigest: Sha256Digest;
    }>
  | Readonly<{
      schemaVersion: 1;
      verdict: "rejected";
      code: "policy.lock-unavailable" | "policy.lock-invalid" | "policy.digest-mismatch";
      message: string;
    }>;

/**
 * Decides whether a task may be bound to an enrolled project's policy lock.
 * Fails closed: no lock, an invalid lock, or any digest disagreement rejects.
 * The daemon's task intake gate is the first consumer.
 */
export function decideTaskPolicyBinding(
  lockInput: unknown,
  taskPolicyDigestInput: unknown,
): TaskPolicyBindingDecisionV1 {
  if (lockInput === null || lockInput === undefined) {
    return {
      schemaVersion: 1,
      verdict: "rejected",
      code: "policy.lock-unavailable",
      message: "No enrolled policy lock could be resolved for the task's project.",
    };
  }
  const lock = PolicyLockV1Schema.safeParse(lockInput);
  if (!lock.success) {
    return {
      schemaVersion: 1,
      verdict: "rejected",
      code: "policy.lock-invalid",
      message: "The enrolled policy lock is not a valid PolicyLockV1.",
    };
  }
  const taskPolicyDigest = Sha256DigestSchema.safeParse(taskPolicyDigestInput);
  if (!taskPolicyDigest.success || taskPolicyDigest.data !== lock.data.policyDigest) {
    return {
      schemaVersion: 1,
      verdict: "rejected",
      code: "policy.digest-mismatch",
      message: `The TaskSpec policy digest does not match the enrolled policy lock ${lock.data.policyId}@${String(lock.data.policyVersion)}.`,
    };
  }
  return {
    schemaVersion: 1,
    verdict: "accepted",
    policyId: lock.data.policyId,
    policyVersion: lock.data.policyVersion,
    policyDigest: lock.data.policyDigest,
  };
}
