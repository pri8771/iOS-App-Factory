import { z } from "zod";

export const Sha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/)
  .brand<"Sha256Digest">();
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;

export const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);

export const RelativeProjectPathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => !value.startsWith("/"), "path must be relative")
  .refine((value) => !value.includes("\\"), "path must use POSIX separators")
  .refine(
    (value) =>
      value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "path must be normalized and may not traverse",
  );
export type RelativeProjectPath = z.infer<typeof RelativeProjectPathSchema>;

export const GitAdminEntryV1Schema = z.strictObject({
  label: z.string().regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/),
  present: z.boolean(),
  digest: z.union([Sha256DigestSchema, z.null()]),
  sizeBytes: z.number().int().nonnegative(),
  mode: z.union([z.string().regex(/^[0-7]{3}$/), z.null()]),
  modifiedNanoseconds: z.union([z.string().regex(/^\d+$/), z.null()]),
  device: z.union([z.string().regex(/^\d+$/), z.null()]),
  inode: z.union([z.string().regex(/^\d+$/), z.null()]),
});
export type GitAdminEntryV1 = z.infer<typeof GitAdminEntryV1Schema>;

export const GitAdminSnapshotV1Schema = z.strictObject({
  kind: z.enum(["standard", "linked-worktree"]),
  objectFormat: z.enum(["sha1", "sha256"]),
  digest: Sha256DigestSchema,
  entries: z.array(GitAdminEntryV1Schema).min(1),
});
export type GitAdminSnapshotV1 = z.infer<typeof GitAdminSnapshotV1Schema>;

export const PreservationSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  headSha: GitObjectIdSchema,
  dirty: z.boolean(),
  statusDigest: Sha256DigestSchema,
  statusByteCount: z.number().int().nonnegative(),
  scanSurfaceDigest: Sha256DigestSchema,
  scannedEntryCount: z.number().int().nonnegative(),
  scannedFileBytes: z.number().int().nonnegative(),
  excludedPaths: z.array(RelativeProjectPathSchema),
  gitAdmin: GitAdminSnapshotV1Schema,
});
export type PreservationSnapshotV1 = z.infer<typeof PreservationSnapshotV1Schema>;

export const ArtifactValidationV1Schema = z.strictObject({
  status: z.enum(["verified", "invalid", "not-validated"]),
  code: z.union([z.string().regex(/^[a-z][a-z0-9.-]+$/), z.null()]),
});

export const XcodeContainerV1Schema = z.strictObject({
  kind: z.enum(["project", "workspace"]),
  path: RelativeProjectPathSchema,
  hasProjectDefinition: z.boolean(),
  applicationTargetIds: z.array(z.string().regex(/^[0-9A-F]{24}$/)),
  unitTestTargetIds: z.array(z.string().regex(/^[0-9A-F]{24}$/)),
  uiTestTargetIds: z.array(z.string().regex(/^[0-9A-F]{24}$/)),
  validation: ArtifactValidationV1Schema,
});

export const XcodeSchemeV1Schema = z.strictObject({
  name: z.string().min(1).max(512),
  path: RelativeProjectPathSchema,
  containerPath: RelativeProjectPathSchema,
  containerKind: z.enum(["project", "workspace"]),
  shared: z.literal(true),
  digest: Sha256DigestSchema,
  applicationTargetIds: z.array(z.string().regex(/^[0-9A-F]{24}$/)),
  unitTestTargetIds: z.array(z.string().regex(/^[0-9A-F]{24}$/)),
  uiTestTargetIds: z.array(z.string().regex(/^[0-9A-F]{24}$/)),
  validation: ArtifactValidationV1Schema,
});

export const SwiftInventoryV1Schema = z.strictObject({
  sourcePaths: z.array(RelativeProjectPathSchema),
  verifiedSourcePaths: z.array(RelativeProjectPathSchema),
  testSourcePaths: z.array(RelativeProjectPathSchema),
  verifiedTestSourcePaths: z.array(RelativeProjectPathSchema),
  uiTestSourcePaths: z.array(RelativeProjectPathSchema),
  verifiedUiTestSourcePaths: z.array(RelativeProjectPathSchema),
  packageManifestPaths: z.array(RelativeProjectPathSchema),
});

export const RuleKindV1Schema = z.enum([
  "agents",
  "claude",
  "cursor",
  "codex",
  "copilot",
  "factory",
  "gemini",
]);

export const RuleDeclarationV1Schema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/),
  value: z.string().min(1).max(1_000),
  line: z.number().int().positive(),
});

export const RuleAuthorityV1Schema = z.strictObject({
  status: z.enum(["canonical", "conforming", "nonconforming", "missing-authority"]),
  canonicalPath: z.union([RelativeProjectPathSchema, z.null()]),
  canonicalDigest: z.union([Sha256DigestSchema, z.null()]),
});

export const RuleFileV1Schema = z.strictObject({
  kind: RuleKindV1Schema,
  path: RelativeProjectPathSchema,
  scopePath: z.union([z.literal("."), RelativeProjectPathSchema]),
  digest: Sha256DigestSchema,
  byteCount: z.number().int().nonnegative(),
  declarations: z.array(RuleDeclarationV1Schema),
  authority: RuleAuthorityV1Schema,
});

export const EffectiveRuleV1Schema = z.strictObject({
  scopePath: z.union([z.literal("."), RelativeProjectPathSchema]),
  key: z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/),
  value: z.union([z.string().min(1).max(1_000), z.null()]),
  sourcePaths: z.array(RelativeProjectPathSchema).min(1),
  conflict: z.boolean(),
});

export const ArtifactV1Schema = z.strictObject({
  kind: z.enum([
    "project-manifest",
    "experience-manifest",
    "swift-package",
    "dependency-manifest",
    "xcodegen",
    "tuist",
    "plist",
    "entitlements",
    "test-plan",
    "ci-workflow",
  ]),
  path: RelativeProjectPathSchema,
  digest: Sha256DigestSchema,
  validation: ArtifactValidationV1Schema,
});

export const LegacyFactoryArtifactV1Schema = z.strictObject({
  kind: z.enum([
    "project-context",
    "standard-lock",
    "rule-authority",
    "quality-manifest",
    "quality-contract",
    "quality-evidence",
  ]),
  path: RelativeProjectPathSchema,
  digest: Sha256DigestSchema,
  validation: ArtifactValidationV1Schema,
});

export const LegacyAuthorityEntryPointV1Schema = z.strictObject({
  role: z.enum(["generic", "claude", "gemini", "cursor", "github-copilot"]),
  path: RelativeProjectPathSchema,
  digest: z.union([Sha256DigestSchema, z.null()]),
  present: z.boolean(),
});

export const LegacyAuthorityReadingV1Schema = z.strictObject({
  path: RelativeProjectPathSchema,
  digest: z.union([Sha256DigestSchema, z.null()]),
  present: z.boolean(),
});

export const LegacyAuthorityGraphV1Schema = z.strictObject({
  projectContextPath: RelativeProjectPathSchema,
  projectContextDigest: Sha256DigestSchema,
  canonicalPath: RelativeProjectPathSchema,
  canonicalDigest: z.union([Sha256DigestSchema, z.null()]),
  entryPoints: z.array(LegacyAuthorityEntryPointV1Schema),
  requiredReading: z.array(LegacyAuthorityReadingV1Schema),
  validation: ArtifactValidationV1Schema,
});

export const ProjectInventoryV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  xcodeContainers: z.array(XcodeContainerV1Schema),
  xcodeSchemes: z.array(XcodeSchemeV1Schema),
  swift: SwiftInventoryV1Schema,
  ruleFiles: z.array(RuleFileV1Schema),
  effectiveRules: z.array(EffectiveRuleV1Schema),
  manifests: z.array(ArtifactV1Schema),
  tests: z.array(ArtifactV1Schema),
  ci: z.array(ArtifactV1Schema),
  legacyFactoryArtifacts: z.array(LegacyFactoryArtifactV1Schema),
  legacyAuthority: z.union([LegacyAuthorityGraphV1Schema, z.null()]),
  symbolicLinkPaths: z.array(RelativeProjectPathSchema),
});
export type ProjectInventoryV1 = z.infer<typeof ProjectInventoryV1Schema>;

export const EnrollmentIssueCodeV1Schema = z.enum([
  "safety.symlink-excluded",
  "safety.symlink-path-escape",
  "safety.symlink-chain-unsafe",
  "safety.symlink-through-exclusion",
  "rules.no-canonical-authority",
  "rules.canonical-unverifiable",
  "rules.adapter-nonconforming",
  "rules.conflicting-declaration",
  "rules.oversized-file",
  "ios.no-xcode-container",
  "ios.no-shared-scheme",
  "swift.no-source",
  "quality.no-tests",
  "quality.no-ui-tests",
  "automation.no-ci",
  "factory.no-project-manifest",
  "factory.invalid-project-manifest",
  "factory.no-experience-manifest",
  "factory.invalid-experience-manifest",
  "compatibility.legacy-factory-layout",
]);
export type EnrollmentIssueCodeV1 = z.infer<typeof EnrollmentIssueCodeV1Schema>;

export const EnrollmentIssueV1Schema = z.strictObject({
  issueId: z.string().regex(/^esi-[0-9a-f]{24}$/),
  code: EnrollmentIssueCodeV1Schema,
  severity: z.enum(["blocker", "warning", "gap"]),
  paths: z.array(RelativeProjectPathSchema),
  summary: z.string().min(1).max(2_000),
});
export type EnrollmentIssueV1 = z.infer<typeof EnrollmentIssueV1Schema>;

export const EnrollmentActionKindV1Schema = z.enum([
  "resolve-path-safety",
  "establish-rule-authority",
  "repair-rule-adapter",
  "resolve-rule-conflict",
  "adopt-or-migrate-legacy-layout",
  "declare-project",
  "repair-project-manifest",
  "declare-experience",
  "repair-experience-manifest",
  "create-xcode-container",
  "share-xcode-scheme",
  "add-swift-source",
  "add-test-target",
  "add-ui-test-target",
  "add-ci-verification",
]);

export const EnrollmentPlanActionV1Schema = z.strictObject({
  actionId: z.string().regex(/^epa-[0-9a-f]{24}$/),
  phase: z.enum(["safety", "compatibility", "authority", "project", "quality", "automation"]),
  kind: EnrollmentActionKindV1Schema,
  targetPath: z.union([RelativeProjectPathSchema, z.null()]),
  reason: z.string().min(1).max(2_000),
  resolvesIssueIds: z.array(z.string().regex(/^esi-[0-9a-f]{24}$/)).min(1),
});

export const EnrollmentPlanV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("proposal-only"),
  requiresSourceRevalidation: z.literal(true),
  sourceFingerprint: Sha256DigestSchema,
  inventoryDigest: Sha256DigestSchema,
  blocked: z.boolean(),
  blockerIssueIds: z.array(z.string().regex(/^esi-[0-9a-f]{24}$/)),
  actions: z.array(EnrollmentPlanActionV1Schema),
});
export type EnrollmentPlanV1 = z.infer<typeof EnrollmentPlanV1Schema>;

export const EnrollmentReadinessV1Schema = z.strictObject({
  ready: z.boolean(),
  blockingIssueIds: z.array(z.string().regex(/^esi-[0-9a-f]{24}$/)),
  gapIssueIds: z.array(z.string().regex(/^esi-[0-9a-f]{24}$/)),
  verifiedXcodeContainerCount: z.number().int().nonnegative(),
  verifiedSharedSchemeCount: z.number().int().nonnegative(),
  verifiedSwiftSourceCount: z.number().int().nonnegative(),
  verifiedTestSourceCount: z.number().int().nonnegative(),
  verifiedUiTestSourceCount: z.number().int().nonnegative(),
});

export const EnrollmentScanV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  repositoryRoot: z.string().min(1),
  before: PreservationSnapshotV1Schema,
  inventory: ProjectInventoryV1Schema,
  inventoryDigest: Sha256DigestSchema,
  issues: z.array(EnrollmentIssueV1Schema),
  readiness: EnrollmentReadinessV1Schema,
  plan: EnrollmentPlanV1Schema,
  planDigest: Sha256DigestSchema,
  after: PreservationSnapshotV1Schema,
  preservation: z.strictObject({
    headUnchanged: z.literal(true),
    statusUnchanged: z.literal(true),
    scanSurfaceUnchanged: z.literal(true),
    gitAdminUnchanged: z.literal(true),
  }),
});
export type EnrollmentScanV1 = z.infer<typeof EnrollmentScanV1Schema>;
