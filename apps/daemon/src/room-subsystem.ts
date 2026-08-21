import type { RoomFactoryBridgeStatusV1, RoomId } from "@app-factory/contracts";
import {
  RoomFactoryEventBridge,
  RoomModerator,
  RoomModeratorLoop,
  type ContributorPort,
  type FactoryEventSourcePort,
  type QuotaGovernorPort,
  type RevalidatePort,
  type RoomBenchPolicy,
  type RoomClockPort,
  type RoomFactoryEventBridgeDrainReport,
  type RoomProcessPort,
  type RoomProviderCatalogPort,
  type RoomRandomPort,
  type RoomRepository,
  type RoomRoundOutcome,
  type RoomWaitPort,
  type ScorerPort,
} from "@app-factory/studio-rooms";

import type {
  InitializeRoomsContext,
  RoomParticipantsCatalogSourceV1,
  RoomsStatusPort,
} from "./command-runtime.js";

/**
 * Optional room moderator: `RoomModerator` + a per-room `RoomModeratorLoop`
 * over the kernel's room tables. Disabled (`enabled: false`, the default when
 * this whole option is omitted) leaves `room.*` commands working as a durable
 * transcript with no agent ever granted the floor. The three model-facing
 * ports (`scorer`, `contributor`, `revalidator`) are required when enabled:
 * this module never constructs an adapter itself -- real Codex/Claude/Ollama
 * participants, the Ollama-backed scorer, and the factory-aware quota
 * governor all live in `@app-factory/studio-room-adapters` and are composed
 * by `apps/daemon/src/room-participants-config.ts`, which builds this
 * configuration object.
 */
export type RoomSubsystemConfiguration = Readonly<{
  enabled: boolean;
  scorer?: ScorerPort;
  contributor?: ContributorPort;
  revalidator?: RevalidatePort;
  /**
   * Resolves a grant's room-provider key to the adapter family and configured model the honest
   * token ledger attributes every closed grant to (contracts Architecture decision 6). Required
   * whenever rooms are enabled, exactly like `scorer`/`contributor`/`revalidator`: this module
   * never invents a family or model, so a composition that enables rooms must supply one.
   * `room-participants-config.ts`'s `buildRoomSubsystemConfiguration` is the daemon's real
   * composition site for this (it already knows every configured provider's family and model);
   * threading it there is Wave 5 work (room-participants-config extensions), not this wave's --
   * this field exists now so the moderator's required dependency has somewhere to come from.
   */
  providerCatalog?: RoomProviderCatalogPort;
  quota?: QuotaGovernorPort;
  /**
   * Alternative to `quota` for a governor that needs the daemon's own kernel
   * database (e.g. to answer "does the factory have a running attempt").
   * Called once, inside `initializeRooms`, with the exact `FactoryDatabase`
   * handle the room repository itself was constructed from. Ignored when
   * `quota` is already set.
   */
  quotaFactory?: (database: InitializeRoomsContext["database"]) => QuotaGovernorPort;
  /**
   * The wire-safe view of the participants config this subsystem was composed from, served
   * verbatim by `room.participants.list` (see `RoomsStatusPort.participantsCatalog`). Built by
   * `room-participants-config.ts`; a hand-composed moderator with no config simply omits it and the
   * operation reports no providers and no roster.
   */
  participantsCatalog?: RoomParticipantsCatalogSourceV1;
  process?: RoomProcessPort;
  clock?: RoomClockPort;
  wait?: RoomWaitPort;
  random?: RoomRandomPort;
  dormancyMs?: number;
  leaseDurationMs?: number;
  scorerTimeoutMs?: number;
  revalidateTimeoutMs?: number;
  transcriptWindow?: number;
  benchPolicy?: RoomBenchPolicy;
  onError?: (error: unknown) => void;
  onRound?: (roomId: RoomId, outcome: RoomRoundOutcome) => void;
  /**
   * The kernel-ledger source the factory-event bridge scans (built by the
   * daemon over the same `FactoryDatabase` handle; see
   * `room-factory-event-source.ts`). Composed here whenever rooms are
   * enabled: the bridge is the only producer of `factory-event` lines, i.e.
   * of the unattended path's admissible trigger. A composition that omits it
   * (hand-built harnesses) gets no bridge and reports `enabled: false`.
   */
  factoryEventSource?: FactoryEventSourcePort;
}>;

export type RoomSubsystem = Readonly<{
  moderator: RoomModerator;
  loop: RoomModeratorLoop;
  /** Null when no `factoryEventSource` was composed. */
  bridge: RoomFactoryEventBridge | null;
  statusPort: RoomsStatusPort;
  start(): void;
  /** One bridge pass; the daemon calls this after every scheduler tick. No-op without a bridge. */
  drainFactoryEvents(): RoomFactoryEventBridgeDrainReport | null;
  stop(): Promise<void>;
}>;

/** Real process facts for the lease sweep: this daemon's pid, and signal-0 liveness probes. */
export const nodeRoomProcessPort: RoomProcessPort = {
  pid: process.pid,
  isAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error instanceof Error && "code" in error && error.code === "EPERM";
    }
  },
  kill: (pid) => {
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  },
};

export function createRoomSubsystem(
  configuration: RoomSubsystemConfiguration,
  repository: RoomRepository,
): RoomSubsystem {
  if (
    configuration.scorer === undefined ||
    configuration.contributor === undefined ||
    configuration.revalidator === undefined ||
    configuration.providerCatalog === undefined
  ) {
    throw new TypeError(
      "rooms.scorer, rooms.contributor, rooms.revalidator, and rooms.providerCatalog are required when rooms are enabled",
    );
  }
  const moderator = new RoomModerator({
    repository,
    scorer: configuration.scorer,
    contributor: configuration.contributor,
    revalidator: configuration.revalidator,
    providerCatalog: configuration.providerCatalog,
    process: configuration.process ?? nodeRoomProcessPort,
    ...(configuration.quota === undefined ? {} : { quota: configuration.quota }),
    ...(configuration.clock === undefined ? {} : { clock: configuration.clock }),
    ...(configuration.wait === undefined ? {} : { wait: configuration.wait }),
    ...(configuration.random === undefined ? {} : { random: configuration.random }),
    ...(configuration.dormancyMs === undefined ? {} : { dormancyMs: configuration.dormancyMs }),
    ...(configuration.leaseDurationMs === undefined
      ? {}
      : { leaseDurationMs: configuration.leaseDurationMs }),
    ...(configuration.scorerTimeoutMs === undefined
      ? {}
      : { scorerTimeoutMs: configuration.scorerTimeoutMs }),
    ...(configuration.revalidateTimeoutMs === undefined
      ? {}
      : { revalidateTimeoutMs: configuration.revalidateTimeoutMs }),
    ...(configuration.transcriptWindow === undefined
      ? {}
      : { transcriptWindow: configuration.transcriptWindow }),
    ...(configuration.benchPolicy === undefined ? {} : { benchPolicy: configuration.benchPolicy }),
  });
  const loop = new RoomModeratorLoop({
    moderator,
    repository,
    ...(configuration.clock === undefined ? {} : { clock: configuration.clock }),
    ...(configuration.wait === undefined ? {} : { wait: configuration.wait }),
    ...(configuration.onError === undefined ? {} : { onError: configuration.onError }),
    ...(configuration.onRound === undefined ? {} : { onRound: configuration.onRound }),
  });
  const bridge =
    configuration.factoryEventSource === undefined
      ? null
      : new RoomFactoryEventBridge({
          repository,
          source: configuration.factoryEventSource,
          wake: loop,
          ...(configuration.clock === undefined ? {} : { clock: configuration.clock }),
          ...(configuration.onError === undefined ? {} : { onError: configuration.onError }),
        });
  const factoryBridge = (): RoomFactoryBridgeStatusV1 =>
    bridge === null ? { enabled: false, cursor: null } : { enabled: true, cursor: bridge.cursor };
  return {
    moderator,
    loop,
    bridge,
    statusPort: {
      enabled: true,
      dormancyMs: moderator.dormancyMs,
      wake: (roomId) => {
        loop.wake(roomId);
      },
      factoryBridge,
      ...(configuration.participantsCatalog === undefined
        ? {}
        : { participantsCatalog: configuration.participantsCatalog }),
    },
    start: () => {
      // The bridge anchors (or re-anchors) its durable cursor before the loop
      // resumes pending rooms, and drains once so transitions the previous
      // daemon never reached are bridged before the first tick.
      bridge?.start();
      loop.start();
      bridge?.drain();
    },
    drainFactoryEvents: () => bridge?.drain() ?? null,
    stop: () => loop.stop(),
  };
}
