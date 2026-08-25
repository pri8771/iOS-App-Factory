import type { CommandId } from "@app-factory/contracts";

/**
 * Shared with `studio-command-runtime.ts` (not just `command-runtime.ts`, which originally owned
 * this type) so the studio intent-dispatch path can mint its own deterministic derived IDs the same
 * way `task.retry`/`attempt.unblock` already do, without an import cycle between the two files.
 */
export type DaemonRuntimeIdPurpose =
  | "attempt"
  | "attempt-created-event"
  | "desired-state-event"
  | "retry-attempt"
  | "retry-created-event"
  | "unblock-fence-event"
  | "unblock-answered-event"
  | "unblock-step-event"
  | "unblock-attempt-event"
  | "room-message"
  | "assistant-intent"
  | "assistant-intent-dispatch"
  | "plan"
  | "phase-run"
  | "phase-run-room"
  | "asc-release-observation"
  | "release-run"
  | "signal"
  | "signal-insight";

export type DaemonRuntimeIdFactory = (
  purpose: DaemonRuntimeIdPurpose,
  commandId: CommandId,
) => string;
