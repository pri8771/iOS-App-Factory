import { z } from "zod";

import {
  ExternalEffectStateV1Schema,
  ExternalEffectV1Schema,
  ExternalProviderV1Schema,
} from "./external-effect.js";
import {
  EffectIdSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  SchemaVersionV1Schema,
} from "./primitives.js";

export const MAX_EFFECT_LIST_ITEMS_V1 = 100 as const;

export const EffectListCursorV1Schema = z.strictObject({
  updatedAt: IsoInstantSchema,
  effectId: EffectIdSchema,
});
export type EffectListCursorV1 = z.infer<typeof EffectListCursorV1Schema>;

export const EffectListQueryV1Schema = z.strictObject({
  state: ExternalEffectStateV1Schema.nullable(),
  provider: ExternalProviderV1Schema.nullable(),
  after: EffectListCursorV1Schema.nullable(),
  limit: z.number().int().min(1).max(MAX_EFFECT_LIST_ITEMS_V1),
});
export type EffectListQueryV1 = z.infer<typeof EffectListQueryV1Schema>;

/**
 * A bounded navigation row. The canonical effect remains nested (mirroring
 * `AttemptListItemV1`) so a client never mistakes a flattened projection for
 * authoritative effect state; the state/marker/provider fields an operator
 * wants are already on `ExternalEffectV1` (`state`, `operationMarker`,
 * `target.provider`).
 */
export const EffectListItemV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  effect: ExternalEffectV1Schema,
});
export type EffectListItemV1 = z.infer<typeof EffectListItemV1Schema>;

export const EffectListPageV1Schema = z
  .strictObject({
    effects: z.array(EffectListItemV1Schema).max(MAX_EFFECT_LIST_ITEMS_V1),
    nextAfter: EffectListCursorV1Schema.nullable(),
    hasMore: z.boolean(),
  })
  .superRefine((page, context) => {
    if (page.hasMore !== (page.nextAfter !== null)) {
      context.addIssue({
        code: "custom",
        path: ["nextAfter"],
        message: "nextAfter must be present exactly when hasMore is true",
      });
    }
    if (page.hasMore && page.effects.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["effects"],
        message: "a page with more results must contain a cursor source row",
      });
    }
    const identities = page.effects.map(({ effect }) => effect.effectId);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        path: ["effects"],
        message: "effect IDs must be unique within a page",
      });
    }
    for (let index = 1; index < page.effects.length; index += 1) {
      const previous = page.effects[index - 1]?.effect;
      const current = page.effects[index]?.effect;
      if (
        previous !== undefined &&
        current !== undefined &&
        (previous.updatedAt < current.updatedAt ||
          (previous.updatedAt === current.updatedAt && previous.effectId <= current.effectId))
      ) {
        context.addIssue({
          code: "custom",
          path: ["effects", index],
          message: "effects must be ordered by updatedAt and effectId descending",
        });
        break;
      }
    }
    if (page.nextAfter !== null) {
      const finalEffect = page.effects.at(-1)?.effect;
      if (
        finalEffect === undefined ||
        finalEffect.updatedAt !== page.nextAfter.updatedAt ||
        finalEffect.effectId !== page.nextAfter.effectId
      ) {
        context.addIssue({
          code: "custom",
          path: ["nextAfter"],
          message: "nextAfter must identify the final returned effect",
        });
      }
    }
  });
export type EffectListPageV1 = z.infer<typeof EffectListPageV1Schema>;

/** Total count of effects in each durable state, always fully populated (zero-filled). */
export const EffectStateCountsV1Schema = z.strictObject({
  planned: NonNegativeSafeIntegerSchema,
  sent: NonNegativeSafeIntegerSchema,
  observed: NonNegativeSafeIntegerSchema,
  confirmed: NonNegativeSafeIntegerSchema,
  unknown: NonNegativeSafeIntegerSchema,
  "manual-intervention": NonNegativeSafeIntegerSchema,
  rejected: NonNegativeSafeIntegerSchema,
});
export type EffectStateCountsV1 = z.infer<typeof EffectStateCountsV1Schema>;

/**
 * Live activity of the daemon's own effect pump loop, independent of what
 * the kernel's durable state says. `enabled: false` means the daemon has no
 * pump running at all (feature flag off); the kernel counts above remain
 * meaningful either way since they reflect durable state, not the pump.
 */
export const EffectPumpStatusV1Schema = z.strictObject({
  enabled: z.boolean(),
  lastActivityAt: IsoInstantSchema.nullable(),
  lastErrorMessage: z.string().min(1).max(2_000).nullable(),
});
export type EffectPumpStatusV1 = z.infer<typeof EffectPumpStatusV1Schema>;

export const EffectStatusV1Schema = z.strictObject({
  counts: EffectStateCountsV1Schema,
  pendingOutbox: NonNegativeSafeIntegerSchema,
  pump: EffectPumpStatusV1Schema,
});
export type EffectStatusV1 = z.infer<typeof EffectStatusV1Schema>;
