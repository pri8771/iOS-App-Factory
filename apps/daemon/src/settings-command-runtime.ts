import type { CommandRequestV1, CommandResultV1, IsoInstant } from "@app-factory/contracts";
import type { StudioSettingsRepository } from "@app-factory/kernel";

import { CommandHandlerError } from "./unix-command-server.js";

/**
 * `settings.*` (Architecture decision 4): a thin read/validate/write layer over the kernel-owned
 * `studio_settings` table (migration `0016-studio-settings`). Deliberately narrow -- one key today
 * (`default-provider`) -- and deliberately a Group-B command-dispatch module with no daemon-
 * composition dependency of its own: `settings.set`'s "does this value name a live provider
 * instance" check is passed in as a plain `readonly string[]` rather than the composed
 * `RoomsStatusPort` object itself, so this file never needs to know that type (or
 * `room-participants-config.ts`/`room-subsystem.ts`) exists at all -- `command-runtime.ts` is the
 * one place that already holds the live catalog and derives the key list from it.
 */

export function buildSettingsGetResultV1(
  settings: StudioSettingsRepository,
  request: Extract<CommandRequestV1, { operation: "settings.get" }>,
): CommandResultV1 {
  return { operation: "settings.get", entry: settings.get(request.payload.key) };
}

/**
 * Refuses a value that does not name a currently configured provider instance (Architecture
 * decision 4): `default-provider` is a preference over LIVE providers, never a dangling reference
 * to one that was removed or never existed. `liveProviderKeys` is the exact set
 * `room.participants.list`/`provider.list` would answer right now -- an empty roster (rooms
 * disabled, or nothing configured yet) means every value is honestly refused, never silently
 * accepted.
 */
export function executeSettingsSetCommand(
  settings: StudioSettingsRepository,
  request: Extract<CommandRequestV1, { operation: "settings.set" }>,
  observedAt: IsoInstant,
  liveProviderKeys: readonly string[],
): CommandResultV1 {
  if (!liveProviderKeys.includes(request.payload.value)) {
    throw new CommandHandlerError(
      "settings.unconfigured-provider",
      `"${request.payload.value}" does not name a currently configured provider instance; ${request.payload.key} must name a live catalog key.`,
      false,
    );
  }
  const entry = settings.set({
    key: request.payload.key,
    value: request.payload.value,
    updatedAt: observedAt,
  });
  return { operation: "settings.set", entry };
}
