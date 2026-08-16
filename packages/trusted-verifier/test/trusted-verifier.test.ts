import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TrustedVerificationError,
  TrustedVerificationCancelledError,
  runTrustedVerification,
  type TrustedVerificationPlan,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("/usr/bin/git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
  }).trim();
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function makeCheckout(): Readonly<{
  root: string;
  scratch: string;
  tree: string;
  protectedDigest: string;
}> {
  const container = realpathSync(mkdtempSync(join(tmpdir(), "factory-verifier-")));
  temporaryDirectories.push(container);
  const root = join(container, "checkout");
  mkdirSync(root, { mode: 0o700 });
  git(root, "init", "-q");
  git(root, "config", "user.name", "Factory Test");
  git(root, "config", "user.email", "factory@example.invalid");
  writeFileSync(join(root, "Protected.txt"), "protected\n");
  writeFileSync(join(root, ".gitignore"), "generated.txt\n");
  git(root, "add", "Protected.txt", ".gitignore");
  git(root, "commit", "-q", "-m", "fixture");
  git(root, "checkout", "-q", "--detach", "HEAD");
  return {
    root,
    scratch: join(container, "scratch"),
    tree: git(root, "rev-parse", "HEAD^{tree}"),
    protectedDigest: sha256(readFileSync(join(root, "Protected.txt"))),
  };
}

function plan(
  checkout: ReturnType<typeof makeCheckout>,
  args: readonly string[],
  overrides: Partial<TrustedVerificationPlan> = {},
): TrustedVerificationPlan {
  return {
    checkId: "fixture.node",
    checkoutDirectory: checkout.root,
    scratchDirectory: checkout.scratch,
    expectedTree: checkout.tree,
    executable: process.execPath,
    args,
    environment: { LANG: "C", PATH: "/usr/bin:/bin" },
    protectedFiles: { "Protected.txt": checkout.protectedDigest },
    timeoutMs: 2_000,
    terminationGraceMs: 100,
    maxStdoutBytes: 64 * 1024,
    maxStderrBytes: 64 * 1024,
    toolVersions: [{ name: "node", version: process.version }],
    ...overrides,
  };
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe("trusted verification", () => {
  it("runs a bounded no-shell check and binds evidence to the exact clean tree", async () => {
    const checkout = makeCheckout();
    const result = await runTrustedVerification(
      plan(checkout, ["-e", "process.stdout.write('verified\\n')"]),
      (() => {
        const values = [new Date("2026-08-10T12:00:00.000Z"), new Date("2026-08-10T12:00:01.000Z")];
        return () => values.shift() ?? new Date("2026-08-10T12:00:01.000Z");
      })(),
    );

    expect(result.claims).toMatchObject({ passed: true, exitCode: 0, checkoutTree: checkout.tree });
    expect(result.stdout.toString()).toBe("verified\n");
    expect(result.stdoutDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.protectedFilesUnchanged).toBe(true);
    expect(result.checkoutCleanAfter).toBe(true);
    expect(existsSync(checkout.scratch)).toBe(false);
  });

  it("returns failing evidence for a nonzero trusted check", async () => {
    const checkout = makeCheckout();
    const result = await runTrustedVerification(plan(checkout, ["-e", "process.exit(7)"]));
    expect(result.claims).toMatchObject({ passed: false, exitCode: 7 });
  });

  it("fails verification when the check changes a protected tracked file", async () => {
    const checkout = makeCheckout();
    const result = await runTrustedVerification(
      plan(checkout, ["-e", "require('node:fs').writeFileSync('Protected.txt', 'weakened\\n')"]),
    );

    expect(result.claims.passed).toBe(false);
    expect(result.protectedFilesUnchanged).toBe(false);
    expect(result.checkoutCleanAfter).toBe(false);
  });

  it("terminates a timed-out check and records the reason", async () => {
    const checkout = makeCheckout();
    const result = await runTrustedVerification(
      plan(checkout, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 30 }),
    );
    expect(result.claims.passed).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it("uses isolated scratch identities and removes them after each check", async () => {
    const firstCheckout = makeCheckout();
    const secondCheckout = makeCheckout();
    const printScratch = [
      "-e",
      "process.stdout.write(JSON.stringify({tmp:process.env.TMPDIR,swift:process.env.SWIFTPM_BUILD_DIR}))",
    ];
    const [first, second] = await Promise.all([
      runTrustedVerification(plan(firstCheckout, printScratch)),
      runTrustedVerification(plan(secondCheckout, printScratch)),
    ]);
    const firstEnvironment = JSON.parse(first.stdout.toString("utf8")) as {
      tmp: string;
      swift: string;
    };
    const secondEnvironment = JSON.parse(second.stdout.toString("utf8")) as {
      tmp: string;
      swift: string;
    };
    expect(firstEnvironment.tmp).toBe(`${firstCheckout.scratch}/tmp`);
    expect(firstEnvironment.swift).toBe(`${firstCheckout.scratch}/swiftpm-build`);
    expect(secondEnvironment.tmp).toBe(`${secondCheckout.scratch}/tmp`);
    expect(secondEnvironment.swift).toBe(`${secondCheckout.scratch}/swiftpm-build`);
    expect(firstEnvironment.tmp).not.toBe(secondEnvironment.tmp);
    expect(existsSync(firstCheckout.scratch)).toBe(false);
    expect(existsSync(secondCheckout.scratch)).toBe(false);
  });

  it("aborts the entire verifier process group before a grandchild can outlive it", async () => {
    const checkout = makeCheckout();
    const orphanMarker = `${checkout.root}-orphan-marker`;
    temporaryDirectories.push(orphanMarker);
    const grandchild = [
      "process.on('SIGTERM', () => {})",
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(orphanMarker)}, 'orphan'), 350)`,
      "setInterval(() => {}, 1000)",
    ].join(";");
    const parent = [
      "require('node:child_process').spawn(process.execPath, ['-e', " +
        `${JSON.stringify(grandchild)}], { stdio: 'ignore' })`,
      "setInterval(() => {}, 1000)",
    ].join(";");
    const controller = new AbortController();
    const running = runTrustedVerification(
      plan(checkout, ["-e", parent], { terminationGraceMs: 50 }),
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(new Error("lease lost")), 50).unref();

    await expect(running).rejects.toBeInstanceOf(TrustedVerificationCancelledError);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    expect(existsSync(orphanMarker)).toBe(false);
    expect(existsSync(checkout.scratch)).toBe(false);
  });

  it("fails and terminates a background descendant after a successful leader exit", async () => {
    const checkout = makeCheckout();
    const orphanMarker = `${checkout.root}-successful-orphan-marker`;
    temporaryDirectories.push(orphanMarker);
    const descendant = [
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(orphanMarker)}, 'orphan'), 350)`,
      "setInterval(() => {}, 1000)",
    ].join(";");
    const leader = [
      "require('node:child_process').spawn(process.execPath, ['-e', " +
        `${JSON.stringify(descendant)}], { stdio: 'ignore' })`,
      "process.exit(0)",
    ].join(";");

    await expect(
      runTrustedVerification(plan(checkout, ["-e", leader], { terminationGraceMs: 50 })),
    ).rejects.toThrow("left background processes running");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    expect(existsSync(orphanMarker)).toBe(false);
    expect(existsSync(checkout.scratch)).toBe(false);
  });

  it("settles by the termination deadline when an escaped descendant retains verifier pipes", async () => {
    const checkout = makeCheckout();
    // Timing budget (measured on Node 24.18 / Apple M5 Pro, 2026-08-16):
    // a spawned Node child reaches user code after ~41-58 ms and the leader
    // has spawned its detached descendant after ~44-73 ms (p90), more under
    // load. The leader therefore needs a timeout comfortably above that
    // (300 ms, ~4x p90) or SIGTERM lands before the escaped descendant even
    // exists and the verifier -- correctly -- settles a clean group. The
    // escaped descendant must then outlive the verifier's termination
    // deadline (stop + max(1000, 2*grace) = ~1300 ms after start) by a wide
    // margin, so its inherited pipes are still open when the deadline fires.
    const ESCAPED_LIFETIME_MS = 2_500;
    const escaped = [
      `setTimeout(() => process.exit(0), ${String(ESCAPED_LIFETIME_MS)})`,
      "setInterval(() => {}, 1000)",
    ].join(";");
    const leader = [
      "require('node:child_process').spawn(process.execPath, ['-e', " +
        `${JSON.stringify(escaped)}], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] })`,
      "setInterval(() => {}, 1000)",
    ].join(";");
    const startedAt = Date.now();

    await expect(
      runTrustedVerification(
        plan(checkout, ["-e", leader], { timeoutMs: 300, terminationGraceMs: 50 }),
      ),
    ).rejects.toThrow("did not terminate after SIGKILL");
    // Settled by the verifier's own deadline (~1300 ms), well before the escaped
    // descendant's exit would have closed the pipes at ~2500 ms.
    expect(Date.now() - startedAt).toBeLessThan(2_200);
    expect(existsSync(checkout.scratch)).toBe(true);
    // Let the escaped descendant exit before the checkout is removed.
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, Math.max(0, startedAt + ESCAPED_LIFETIME_MS + 700 - Date.now())),
    );
  });

  it("rejects an attached branch, dirty input, and unsafe environment", async () => {
    const attached = makeCheckout();
    git(attached.root, "switch", "-q", "-");
    await expect(runTrustedVerification(plan(attached, ["-e", "process.exit(0)"]))).rejects.toThrow(
      /detached HEAD/,
    );

    const dirty = makeCheckout();
    writeFileSync(join(dirty.root, "untracked.txt"), "dirty\n");
    await expect(runTrustedVerification(plan(dirty, ["-e", "process.exit(0)"]))).rejects.toThrow(
      /not clean/,
    );

    const clean = makeCheckout();
    await expect(
      runTrustedVerification(
        plan(clean, ["-e", "process.exit(0)"], {
          environment: { OPENAI_API_KEY: "secret" },
        }),
      ),
    ).rejects.toThrow(TrustedVerificationError);
  });
});
