import { z } from "zod";

/**
 * Configuration for one `factory-gc` run. Every root is explicit and
 * operator-supplied rather than auto-derived from a single runtime
 * directory: the daemon's OCI/supervised-run roots and per-project git
 * runtime roots are configured per adapter/project and are not a fixed,
 * guessable layout, so guessing them would risk silently missing (or
 * mis-scoping) a root. `databasePath` must point at the daemon's live
 * `control-plane.sqlite`; it is only ever opened read-only (see
 * `terminal-index.ts`).
 */
export const GcRunDirectoryRootV1Schema = z.strictObject({
  path: z.string().min(1),
  kind: z.enum(["oci", "supervised"]),
});
export type GcRunDirectoryRootV1 = z.infer<typeof GcRunDirectoryRootV1Schema>;

export const GcVerificationRootV1Schema = z.strictObject({
  gitRuntimeRoot: z.string().min(1),
});
export type GcVerificationRootV1 = z.infer<typeof GcVerificationRootV1Schema>;

export const GcConfigurationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  databasePath: z.string().min(1),
  evidenceRoots: z.array(z.string().min(1)).max(1_000),
  checkpointRoots: z.array(z.string().min(1)).max(1_000),
  runDirectoryRoots: z.array(GcRunDirectoryRootV1Schema).max(1_000),
  verificationRoots: z.array(GcVerificationRootV1Schema).max(1_000),
  /** Minimum age, from the best available completion timestamp, before a
   *  terminal-attempt item becomes eligible. Zero is legal (no grace
   *  period) but every item still requires proof of terminality. */
  retentionWindowMs: z
    .number()
    .int()
    .min(0)
    .max(3_650 * 24 * 60 * 60 * 1_000),
  /** How many of the most recent checkpoint revisions to keep per
   *  terminal attempt; older revisions are pruned. Must be at least 1: a
   *  terminal attempt's checkpoint directory is never fully emptied. */
  keepLatestCheckpointRevisions: z.number().int().min(1).max(10_000),
});
export type GcConfigurationV1 = z.infer<typeof GcConfigurationV1Schema>;

export function parseGcConfiguration(value: unknown): GcConfigurationV1 {
  return GcConfigurationV1Schema.parse(value);
}

export const GC_CATEGORIES = [
  "evidence-blob",
  "checkpoint-revision",
  "run-directory",
  "verification-checkout",
] as const;
export type GcCategory = (typeof GC_CATEGORIES)[number];

/** One reclaimable item found by a selector. `path` is the exact
 *  filesystem path `--apply` will remove (a file for evidence blobs and
 *  checkpoint revisions; a directory for run directories and verification
 *  checkouts). */
export type GcSelectedItemV1 = Readonly<{
  category: GcCategory;
  id: string;
  path: string;
  attemptId: string | null;
  reason: string;
}>;

export type GcSelectionV1 = Readonly<{
  schemaVersion: 1;
  generatedAt: string;
  items: readonly GcSelectedItemV1[];
}>;

export type GcApplyOutcomeV1 = Readonly<{
  item: GcSelectedItemV1;
  reclaimed: boolean;
  skippedReason: string | null;
}>;

export type GcRunResultV1 = Readonly<{
  schemaVersion: 1;
  mode: "dry-run" | "apply";
  generatedAt: string;
  selection: GcSelectionV1;
  applied: readonly GcApplyOutcomeV1[] | null;
}>;

export class RetentionManagerError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetentionManagerError";
  }
}
