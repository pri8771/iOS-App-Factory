import { z } from "zod";

import { IsoInstantSchema } from "./primitives.js";
import { RoomProviderSchema } from "./room.js";

/**
 * Studio settings: a small, cross-client preference table the kernel owns (migration
 * `0016-studio-settings`, `studio_settings(key PK, value, updated_at)`) -- deliberately separate
 * from the machine-local provider config JSON (`provider.ts`), because "which configured instance
 * is the default" is a preference a human sets once and expects to follow them across every
 * client, not a fact about one daemon's filesystem. See "Architecture decisions" item 4 in the
 * Studio chat-first shell plan.
 */

export const StudioSettingKeyV1Schema = z.enum(["default-provider"]);
export type StudioSettingKeyV1 = z.infer<typeof StudioSettingKeyV1Schema>;

/**
 * `value` is `null` exactly when the key has never been set; `updatedAt` mirrors that (`null`
 * until the first `settings.set`) -- the same "answer honestly, never fabricate" discipline
 * `RoomParticipantsCatalogV1Schema` already applies to `unavailableReason`. The only key today,
 * `default-provider`, takes a live provider instance key as its value; the daemon validates at
 * `settings.set` time that the key names a catalog instance that actually exists (Architecture
 * decision 4) -- this schema only enforces the wire shape.
 */
export const StudioSettingEntryV1Schema = z.strictObject({
  key: StudioSettingKeyV1Schema,
  value: RoomProviderSchema.nullable(),
  updatedAt: IsoInstantSchema.nullable(),
});
export type StudioSettingEntryV1 = z.infer<typeof StudioSettingEntryV1Schema>;
