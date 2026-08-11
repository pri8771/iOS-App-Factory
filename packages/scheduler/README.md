# Restart-safe scheduler

This package is the single-attempt Week 2 scheduler. It owns orchestration, not
storage or child processes. `SchedulerPersistencePort` is implemented by the
daemon's kernel adapter; `SchedulerStepExecutorPort` is implemented by the
process-supervisor adapter.

The scheduler drives the fixed `prepare -> execute -> verify` plan. Every
durable mutation is preceded by an active-lease check and must also be guarded
atomically inside the persistence adapter. Every executor invocation receives:

- the current fence;
- an `assertActive` callback to invoke immediately before external effects;
- a stable effect key (`attempt + step + runCount`) for provider idempotency;
- a `heartbeat` callback for work longer than one lease interval; and
- a cooperative abort signal.

The scheduler wraps its wall clock in `MonotonicSchedulerClock`. Discovery
returns the attempt's durable `updatedAt`, and a lease carries `heartbeatAt`, so
the next claim or heartbeat is at least one millisecond later even across a
restart with a frozen or backward wall clock. Adapters must still perform the
timestamp and fence checks atomically with each write.

A process restart may replay a `running` step, but it cannot replay a completed
step. The executor must deduplicate the stable effect key, including the case
where an effect completed just before the process stopped and before its step
checkpoint committed. An intentional retry increments `runCount`, producing a
new effect key.

`tick()` admits at most one attempt. A concurrent call returns `busy`. `stop()`
aborts the active executor, waits for the tick to reach a safe boundary, and
releases only the caller's still-active fenced lease. A fresh scheduler
instance resumes the durable checkpoint.

The optional lifecycle observer is only for in-process diagnostics and
deterministic interruption tests. It must not perform durable or external
effects; those belong behind a fenced persistence or executor port.
