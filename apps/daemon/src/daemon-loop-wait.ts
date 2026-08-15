/**
 * Injectable loop timing shared by every background daemon loop
 * (`BackgroundSchedulerLoop` in factory-daemon-service.ts, `EffectPumpLoop`
 * in effect-pump.ts). Kept in its own module so those two loops can share it
 * without either importing the other (they otherwise would: the effect pump
 * is composed from inside factory-daemon-service.ts).
 */
export type DaemonLoopWait = (delayMs: number, signal: AbortSignal) => Promise<void>;

export async function defaultWait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, delayMs);
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function interruptibleWait(
  wait: DaemonLoopWait,
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  let resolveAborted: (() => void) | undefined;
  const aborted = new Promise<Readonly<{ kind: "aborted" }>>((resolve) => {
    resolveAborted = () => resolve({ kind: "aborted" });
  });
  const onAbort = () => resolveAborted?.();
  signal.addEventListener("abort", onAbort, { once: true });
  const waited: Promise<
    Readonly<{ kind: "completed" }> | Readonly<{ kind: "failed"; error: unknown }>
  > = Promise.resolve()
    .then(async () => await wait(delayMs, signal))
    .then(() => ({ kind: "completed" as const }))
    .catch((error: unknown) => ({ kind: "failed" as const, error }));
  const result = await Promise.race([aborted, waited]).finally(() => {
    signal.removeEventListener("abort", onAbort);
  });
  if (result.kind === "failed") throw result.error;
}
