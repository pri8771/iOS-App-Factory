import { NamespacedCodeSchema, Sha256DigestSchema } from "@app-factory/contracts";
import { z } from "zod";

/**
 * Sidecar for fields the current `CanonicalPolicySourceV1` schema does not carry.
 *
 * Everything here is provenance and forward-looking metadata: where each principle and rule
 * came from in the rules corpus, which executor a `requiredCheck` code is expected to bind to,
 * and the per-rule scoping / human-only fields that `studio/policy-engine-scoping` is expected
 * to add to the engine schema itself. Nothing in the sidecar is read by the compiler; it is
 * cross-checked against the compiled source by tests so the two files cannot drift apart.
 */

const RuleIdSchema = z.string().regex(/^rule\.[a-z0-9]+(?:[.-][a-z0-9]+)+$/);
const SourceReferenceSchema = z.string().min(1).max(300);
const ShortCommitSchema = z.string().regex(/^[0-9a-f]{7,64}$/);

export const CorpusFileProvenanceV1Schema = z.strictObject({
  path: z.string().min(1).max(500),
  sha256: Sha256DigestSchema,
});

export const PolicySourceSidecarV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    policyId: NamespacedCodeSchema,
    policyVersion: z.number().int().positive(),
    corpus: z.strictObject({
      repository: z.string().min(1).max(200),
      localPath: z.string().min(1).max(1_000),
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      commit: ShortCommitSchema,
      files: z.array(CorpusFileProvenanceV1Schema).min(1).max(100),
      additionalSources: z
        .array(
          z.strictObject({
            repository: z.string().min(1).max(200),
            localPath: z.string().min(1).max(1_000),
            commit: ShortCommitSchema,
            files: z.array(CorpusFileProvenanceV1Schema).min(1).max(100),
          }),
        )
        .max(20),
      /** Versions reported elsewhere but not compiled from; see RULES_CORPUS_RECONCILIATION.md. */
      otherObservedVersions: z
        .array(
          z.strictObject({
            version: z.string().regex(/^\d+\.\d+\.\d+$/),
            observedAt: z.string().min(1).max(500),
            fetched: z.literal(false),
          }),
        )
        .max(20),
    }),
    principleSources: z
      .array(
        z.strictObject({
          index: z.number().int().nonnegative(),
          sources: z.array(SourceReferenceSchema).min(1).max(20),
        }),
      )
      .min(1)
      .max(100),
    ruleSources: z
      .array(
        z.strictObject({
          ruleId: RuleIdSchema,
          sources: z.array(SourceReferenceSchema).min(1).max(20),
          /** TODO(studio/policy-engine-scoping): move onto the engine rule schema as `humanOnly`. */
          humanOnly: z.boolean(),
          /** TODO(studio/policy-engine-scoping): move onto the engine rule schema as `appliesTo`. */
          appliesTo: z.array(z.string().min(1).max(100)).min(1).max(20),
        }),
      )
      .min(1)
      .max(500),
    /** TODO(studio/policy-engine-scoping): becomes the engine's check registry. */
    checkRegistry: z
      .array(
        z.strictObject({
          check: NamespacedCodeSchema,
          kind: z.enum(["trusted-check", "broker", "approval", "review"]),
          executor: z.string().min(1).max(500),
          status: z.enum(["exists", "planned"]),
        }),
      )
      .min(1)
      .max(200),
    protectedSurfaceNotes: z
      .array(
        z.strictObject({
          path: z.string().min(1).max(1_024),
          note: z.string().min(1).max(2_000),
        }),
      )
      .max(100),
    todos: z
      .array(
        z.strictObject({
          field: z.string().min(1).max(200),
          branch: z.string().min(1).max(200),
          note: z.string().min(1).max(2_000),
        }),
      )
      .max(100),
  })
  .superRefine((sidecar, context) => {
    const unique = (values: readonly string[], label: string): void => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: `${label} must be unique` });
      }
    };
    unique(
      sidecar.principleSources.map((entry) => String(entry.index)),
      "principleSources.index",
    );
    unique(
      sidecar.ruleSources.map((entry) => entry.ruleId),
      "ruleSources.ruleId",
    );
    unique(
      sidecar.checkRegistry.map((entry) => entry.check),
      "checkRegistry.check",
    );
  });
export type PolicySourceSidecarV1 = z.infer<typeof PolicySourceSidecarV1Schema>;
