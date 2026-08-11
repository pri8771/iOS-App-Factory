import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TrustedVerificationError,
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
  tree: string;
  protectedDigest: string;
}> {
  const root = mkdtempSync(join(tmpdir(), "factory-verifier-"));
  temporaryDirectories.push(root);
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
