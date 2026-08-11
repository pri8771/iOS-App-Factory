import { describe, expect, it } from "vitest";

import { parseOciRunIntent, parseOciRunReceipt } from "../src/index.js";

const DIGEST = `sha256:${"1".repeat(64)}`;
const CONTAINER_ID = "a".repeat(64);

function intentInput(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    runKey: "codex-11111111-f0",
    attemptId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    fence: 0,
    createdAt: "2026-08-11T16:00:00.000Z",
    taskSpecDigest: DIGEST,
    policyDigest: `sha256:${"2".repeat(64)}`,
    baseCommit: "3".repeat(40),
    baseTree: "4".repeat(40),
    containerName: "app-factory-codex-11111111-f0",
    image: {
      reference: `factory/codex@sha256:${"5".repeat(64)}`,
      imageId: `sha256:${"6".repeat(64)}`,
    },
    worktreeHostPath: "/private/tmp/factory-oci-worktree",
    worktreeContainerPath: "/workspace",
    privateTmpfsPath: "/run/app-factory",
    networkMode: "none",
    readOnlyRootFilesystem: true,
    agentExecutable: "/usr/local/bin/codex",
    agentArguments: ["exec", "--json", "-"],
    environment: [
      { name: "LANG", value: "C" },
      { name: "PATH", value: "/usr/local/bin:/usr/bin:/bin" },
      { name: "TZ", value: "UTC" },
    ],
    limits: {
      cpuCount: 2,
      memoryBytes: 1_073_741_824,
      pidLimit: 128,
      outputBytesPerStream: 1_048_576,
      wallTimeMs: 60_000,
      stopGraceMs: 5_000,
      privateTmpfsBytes: 67_108_864,
    },
  };
}

function capturedOutput(truncated = false): Record<string, unknown> {
  return {
    digest: DIGEST,
    capturedByteLength: truncated ? 1_024 : 0,
    observedByteLength: truncated ? 1_025 : 0,
    truncated,
  };
}

function receiptInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    runKey: "codex-11111111-f0",
    attemptId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    fence: 0,
    intentDigest: DIGEST,
    containerId: CONTAINER_ID,
    imageId: `sha256:${"2".repeat(64)}`,
    createdAt: "2026-08-11T16:00:01.000Z",
    startedAt: "2026-08-11T16:00:02.000Z",
    finishedAt: "2026-08-11T16:00:03.000Z",
    removedAt: "2026-08-11T16:00:04.000Z",
    terminalInspectionDigest: `sha256:${"3".repeat(64)}`,
    removalEvidenceDigest: `sha256:${"4".repeat(64)}`,
    outcome: "succeeded",
    terminationOrigin: "natural",
    exitCode: 0,
    oomKilled: false,
    stdout: capturedOutput(),
    stderr: capturedOutput(),
    ...overrides,
  };
}

describe("OCI environment trust boundary", () => {
  it("accepts only the locked nonsecret runtime variable names and values", () => {
    const input = intentInput();
    input.environment = [
      { name: "LANG", value: "C.UTF-8" },
      { name: "LC_ALL", value: "C" },
      { name: "NODE_VERSION", value: "22.23.1" },
      {
        name: "PATH",
        value: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      { name: "TZ", value: "UTC" },
      { name: "YARN_VERSION", value: "1.22.22" },
    ];
    expect(parseOciRunIntent(input).environment).toEqual(input.environment);
  });

  for (const name of [
    "OPENAI_SESSION",
    "GITHUB_PAT",
    "COOKIE",
    "DATA",
    "OPENAI_API_KEY",
    "UNKNOWN_RUNTIME_FLAG",
  ]) {
    it(`rejects non-allowlisted environment name ${name}`, () => {
      const input = intentInput();
      input.environment = [{ name, value: "canary" }];
      expect(() => parseOciRunIntent(input)).toThrow(/allowlisted non-credential/u);
    });
  }

  it("rejects arbitrary values even under allowlisted names", () => {
    const unsafeValues = [
      { name: "LANG", value: "secret-shaped-data" },
      { name: "LC_ALL", value: "en_US.UTF-8" },
      { name: "PATH", value: "/workspace/private/bin:/usr/bin:/bin" },
      { name: "TZ", value: "America/New_York" },
    ];
    for (const environmentEntry of unsafeValues) {
      const input = intentInput();
      input.environment = [environmentEntry];
      expect(() => parseOciRunIntent(input)).toThrow(/outside the locked profile/u);
    }
  });

  it("retains ordering, uniqueness, and bounded-value validation", () => {
    const unsorted = intentInput();
    unsorted.environment = [
      { name: "TZ", value: "UTC" },
      { name: "LANG", value: "C" },
    ];
    expect(() => parseOciRunIntent(unsorted)).toThrow(/unique and sorted/u);

    const duplicate = intentInput();
    duplicate.environment = [
      { name: "LANG", value: "C" },
      { name: "LANG", value: "C.UTF-8" },
    ];
    expect(() => parseOciRunIntent(duplicate)).toThrow(/unique and sorted/u);

    const multiline = intentInput();
    multiline.environment = [{ name: "LANG", value: "C\nC" }];
    expect(() => parseOciRunIntent(multiline)).toThrow(/bounded single-line/u);

    const oversized = intentInput();
    oversized.environment = [{ name: "LANG", value: "C".repeat(129) }];
    expect(() => parseOciRunIntent(oversized)).toThrow(/bounded single-line/u);
  });
});

describe("OCI receipt semantic validation", () => {
  it("accepts valid natural, timeout, cancellation, overflow, and OOM dispositions", () => {
    const validReceipts = [
      receiptInput(),
      receiptInput({ outcome: "failed", exitCode: 1 }),
      receiptInput({ outcome: "failed", exitCode: 137, oomKilled: true }),
      receiptInput({ outcome: "timed-out", terminationOrigin: "wall-time", exitCode: 0 }),
      receiptInput({ outcome: "cancelled", terminationOrigin: "cancellation", exitCode: 143 }),
      receiptInput({
        outcome: "output-overflow",
        terminationOrigin: "output-overflow",
        stdout: capturedOutput(true),
      }),
    ];
    for (const receipt of validReceipts) {
      expect(() => parseOciRunReceipt(receipt)).not.toThrow();
    }
  });

  it("requires the same path-safe run key and UUID formats as the intent", () => {
    for (const unsafeRunKey of ["../escape", "run/key", "-leading", "trailing-", "UPPER"]) {
      expect(() => parseOciRunReceipt(receiptInput({ runKey: unsafeRunKey }))).toThrow(
        /path-safe/u,
      );
    }
    expect(() => parseOciRunReceipt(receiptInput({ attemptId: "not-a-uuid" }))).toThrow(
      /attemptId must be a UUID/u,
    );
    expect(() =>
      parseOciRunReceipt(receiptInput({ runId: "22222222-2222-0222-8222-222222222222" })),
    ).toThrow(/runId must be a UUID/u);
  });

  it("requires a canonical full container ID", () => {
    for (const containerId of [
      `sha256:${CONTAINER_ID}`,
      "a".repeat(63),
      "A".repeat(64),
      `${"a".repeat(63)}/`,
    ]) {
      expect(() => parseOciRunReceipt(receiptInput({ containerId }))).toThrow(/canonical 64-hex/u);
    }
  });

  it("requires nondecreasing creation, start, finish, and removal times", () => {
    expect(() =>
      parseOciRunReceipt(receiptInput({ createdAt: "2026-08-11T16:00:02.001Z" })),
    ).toThrow(/timestamps must be monotonic/u);
    expect(() =>
      parseOciRunReceipt(receiptInput({ startedAt: "2026-08-11T16:00:03.001Z" })),
    ).toThrow(/timestamps must be monotonic/u);
    expect(() =>
      parseOciRunReceipt(receiptInput({ finishedAt: "2026-08-11T16:00:04.001Z" })),
    ).toThrow(/timestamps must be monotonic/u);
    expect(() =>
      parseOciRunReceipt(
        receiptInput({
          createdAt: "2026-08-11T16:00:01.000Z",
          startedAt: "2026-08-11T16:00:01.000Z",
          finishedAt: "2026-08-11T16:00:01.000Z",
          removedAt: "2026-08-11T16:00:01.000Z",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects mismatched outcome and termination origin pairs", () => {
    const invalidPairs = [
      { outcome: "succeeded", terminationOrigin: "wall-time" },
      { outcome: "failed", terminationOrigin: "cancellation" },
      { outcome: "timed-out", terminationOrigin: "natural" },
      { outcome: "output-overflow", terminationOrigin: "natural" },
      { outcome: "cancelled", terminationOrigin: "output-overflow" },
    ];
    for (const pair of invalidPairs) {
      expect(() => parseOciRunReceipt(receiptInput(pair))).toThrow(
        /outcome and termination origin are inconsistent/u,
      );
    }
  });

  it("rejects success/failure exit contradictions and overflow contradictions", () => {
    expect(() => parseOciRunReceipt(receiptInput({ exitCode: 1 }))).toThrow(
      /succeeded.*exit zero/u,
    );
    expect(() => parseOciRunReceipt(receiptInput({ oomKilled: true }))).toThrow(/succeeded.*OOM/u);
    expect(() => parseOciRunReceipt(receiptInput({ outcome: "failed", exitCode: 0 }))).toThrow(
      /failed.*failed exit/u,
    );
    expect(() =>
      parseOciRunReceipt(
        receiptInput({ outcome: "output-overflow", terminationOrigin: "output-overflow" }),
      ),
    ).toThrow(/output-overflow disposition/u);
    expect(() => parseOciRunReceipt(receiptInput({ stdout: capturedOutput(true) }))).toThrow(
      /output-overflow disposition/u,
    );
  });
});
