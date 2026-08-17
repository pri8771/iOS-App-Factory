import { defineConfig } from "vitest/config";

/**
 * Workspace-wide test timeout.
 *
 * Vitest's implicit default is 5000ms per test. This repository's integration tests
 * routinely drive real `git` subprocesses, real SQLite databases, and multi-step
 * attempt chains (for example, the planner's "2 tasks + 1 gate" chain performs two full
 * fake-executor attempts plus an immutable-mirror base advance). Measured on
 * 2026-08-17 (Apple M5 Pro, 18 cores, `--maxWorkers=4`, suite of 2110 tests) the
 * slowest legitimately-passing tests took 5.2s–7.8s and were tripping the implicit
 * 5000ms bound only under 4-way parallelism — the same tests complete in 1–3s in
 * isolation. Raising the floor to 30s keeps genuine hangs loud (a real hang observed
 * the same day ran to the 300s wall) while stopping healthy integration tests from
 * being misreported as failures purely because of parallel-worker contention.
 *
 * This is a test-harness change (a protected surface per AGENTS.md); no assertion,
 * threshold, or product behavior is altered by it.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
