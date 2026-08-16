import type { RoomId } from "@app-factory/contracts";
import {
  RoomModerator,
  RoomModeratorLoop,
  type ContributorPort,
  type QuotaGovernorPort,
  type RevalidatePort,
  type RoomBenchPolicy,
  type RoomClockPort,
  type RoomProcessPort,
  type RoomRandomPort,
  type RoomRepository,
  type RoomRoundOutcome,
  type RoomWaitPort,
  type ScorerPort,
} from "@app-factory/studio-rooms";

import type { RoomsStatusPort } from "./command-runtime.js";

/**
 * Optional room moderator: `RoomModerator` + a per-room `RoomModeratorLoop`
 * over the kernel's room tables. Disabled (`enabled: false`, the default when
 * this whole option is omitted) leaves `room.*` commands working as a durable
 * transcript with no agent ever granted the floor. The three model-facing
 * ports (`scorer`, `contributor`, `revalidator`) are required when enabled:
 * no adapter is registered here by default, and none exists in this
 * repository yet — the Ollama adapter is a separate task.
 */
export type RoomSubsystemConfiguration = Readonly<{
  enabled: boolean;
  scorer?: ScorerPort;
  contributor?: ContributorPort;
  revalidator?: RevalidatePort;
  quota?: QuotaGovernorPort;
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
}>;

export type RoomSubsystem = Readonly<{
  moderator: RoomModerator;
  loop: RoomModeratorLoop;
  statusPort: RoomsStatusPort;
  start(): void;
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
    configuration.revalidator === undefined
  ) {
    throw new TypeError(
      "rooms.scorer, rooms.contributor, and rooms.revalidator are required when rooms are enabled",
    );
  }
  const moderator = new RoomModerator({
    repository,
    scorer: configuration.scorer,
    contributor: configuration.contributor,
    revalidator: configuration.revalidator,
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
  return {
    moderator,
    loop,
    statusPort: {
      enabled: true,
      dormancyMs: moderator.dormancyMs,
      wake: (roomId) => {
        loop.wake(roomId);
      },
    },
    start: () => {
      loop.start();
    },
    stop: () => loop.stop(),
  };
}
