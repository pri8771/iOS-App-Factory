import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  reclaimVerificationDirectory,
  selectStaleVerificationDirectories,
} from "../src/verification-checkouts.js";
import type { TerminalAttemptIndex } from "../src/terminal-index.js";
import { RetentionManagerError } from "../src/types.js";

const roots: string[] = [];
function makeRoot(): string {
  const path = mkdtempSync(join(tmpdir(), "app-factory-retention-verification-"));
  roots.push(path);
  return path;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    // Some fixtures deliberately lock a directory tree read-only; restore
    // write access so cleanup itself does not fail.
    try {
      chmodSync(root, 0o700);
    } catch {
      // best-effort
    }
    rmSync(root, { recursive: true, force: true });
  }
});

const TERMINAL = "11111111-1111-4111-8111-111111111111";
const NON_TERMINAL = "22222222-2222-4222-8222-222222222222";
const REPOSITORY_ID = "33333333-3333-4333-8333-333333333333";
const TERMINAL_AT = "2026-08-01T00:00:00.000Z";

function terminalIndex(): TerminalAttemptIndex {
  return {
    isTerminal: (attemptId) => attemptId === TERMINAL,
    terminalAt: (attemptId) => (attemptId === TERMINAL ? TERMINAL_AT : null),
  };
}

function makeScratchDirectory(gitRuntimeRoot: string, attemptId: string): string {
  const path = join(
    gitRuntimeRoot,
    "verification-scratch",
    attemptId,
    "fence-1",
    `swift-build-${"4".repeat(36)}`,
  );
  mkdirSync(join(path, "home"), { recursive: true, mode: 0o700 });
  mkdirSync(join(path, "tmp"), { mode: 0o700 });
  return join(gitRuntimeRoot, "verification-scratch", attemptId);
}

/** A UUID-v4-shaped string built from one repeated character, so distinct
 * test fixtures can use distinct, visually obvious nonces while still
 * matching the real `ownershipNonce` shape (version nibble 4, variant
 * nibble in [89ab]). */
function fakeNonce(character: string): string {
  return `${character.repeat(8)}-${character.repeat(4)}-4${character.repeat(3)}-8${character.repeat(3)}-${character.repeat(12)}`;
}

function makeCheckoutDirectory(
  gitRuntimeRoot: string,
  attemptId: string,
  nonceSeed: string,
): string {
  const name = `${attemptId}-${"c".repeat(16)}-${fakeNonce(nonceSeed)}`;
  const path = join(gitRuntimeRoot, "verification", REPOSITORY_ID, name);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  writeFileSync(join(path, "README.md"), "checked out\n", { mode: 0o600 });
  return path;
}

const FAR_FUTURE = new Date("2027-01-01T00:00:00.000Z");
const RIGHT_AT_TERMINAL = new Date(TERMINAL_AT);

describe("selectStaleVerificationDirectories", () => {
  it("returns nothing when neither subtree exists", () => {
    const gitRuntimeRoot = makeRoot();
    expect(
      selectStaleVerificationDirectories(gitRuntimeRoot, terminalIndex(), 0, FAR_FUTURE),
    ).toEqual([]);
  });

  it("selects a terminal attempt's scratch directory and checkout directory past the retention window", () => {
    const gitRuntimeRoot = makeRoot();
    const scratchPath = makeScratchDirectory(gitRuntimeRoot, TERMINAL);
    const checkoutPath = makeCheckoutDirectory(gitRuntimeRoot, TERMINAL, "d");

    const items = selectStaleVerificationDirectories(
      gitRuntimeRoot,
      terminalIndex(),
      0,
      FAR_FUTURE,
    );
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.path).sort()).toEqual([checkoutPath, scratchPath].sort());
    for (const item of items) {
      expect(item.category).toBe("verification-checkout");
      expect(item.attemptId).toBe(TERMINAL);
    }
  });

  it("never selects a non-terminal attempt's scratch or checkout directory", () => {
    const gitRuntimeRoot = makeRoot();
    makeScratchDirectory(gitRuntimeRoot, NON_TERMINAL);
    makeCheckoutDirectory(gitRuntimeRoot, NON_TERMINAL, "e");

    expect(
      selectStaleVerificationDirectories(gitRuntimeRoot, terminalIndex(), 0, FAR_FUTURE),
    ).toEqual([]);
  });

  it("respects the retention window even for a terminal attempt", () => {
    const gitRuntimeRoot = makeRoot();
    makeScratchDirectory(gitRuntimeRoot, TERMINAL);
    makeCheckoutDirectory(gitRuntimeRoot, TERMINAL, "f");

    const items = selectStaleVerificationDirectories(
      gitRuntimeRoot,
      terminalIndex(),
      365 * 24 * 60 * 60 * 1_000,
      RIGHT_AT_TERMINAL,
    );
    expect(items).toEqual([]);
  });

  it("ignores OS metadata junk under both subtrees", () => {
    const gitRuntimeRoot = makeRoot();
    makeScratchDirectory(gitRuntimeRoot, TERMINAL);
    writeFileSync(join(gitRuntimeRoot, "verification-scratch", ".DS_Store"), "junk\n");
    mkdirSync(join(gitRuntimeRoot, "verification", REPOSITORY_ID), { recursive: true });
    writeFileSync(join(gitRuntimeRoot, "verification", ".DS_Store"), "junk\n");
    writeFileSync(join(gitRuntimeRoot, "verification", REPOSITORY_ID, ".DS_Store"), "junk\n");

    const items = selectStaleVerificationDirectories(
      gitRuntimeRoot,
      terminalIndex(),
      0,
      FAR_FUTURE,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("verification-checkout");
  });

  it("fails closed on a genuinely unexpected entry under verification-scratch", () => {
    const gitRuntimeRoot = makeRoot();
    mkdirSync(join(gitRuntimeRoot, "verification-scratch", "not-an-attempt-id"), {
      recursive: true,
    });

    expect(() =>
      selectStaleVerificationDirectories(gitRuntimeRoot, terminalIndex(), 0, FAR_FUTURE),
    ).toThrow(RetentionManagerError);
  });

  it("fails closed on a genuinely unexpected repository entry under verification", () => {
    const gitRuntimeRoot = makeRoot();
    mkdirSync(join(gitRuntimeRoot, "verification", "not-a-repository-id"), { recursive: true });

    expect(() =>
      selectStaleVerificationDirectories(gitRuntimeRoot, terminalIndex(), 0, FAR_FUTURE),
    ).toThrow(RetentionManagerError);
  });

  it("fails closed on a genuinely unexpected checkout entry name", () => {
    const gitRuntimeRoot = makeRoot();
    mkdirSync(join(gitRuntimeRoot, "verification", REPOSITORY_ID, "not-a-checkout-name"), {
      recursive: true,
    });

    expect(() =>
      selectStaleVerificationDirectories(gitRuntimeRoot, terminalIndex(), 0, FAR_FUTURE),
    ).toThrow(RetentionManagerError);
  });
});

describe("reclaimVerificationDirectory", () => {
  it("unlocks a read-only-locked checkout before removing it, and is idempotent", () => {
    const gitRuntimeRoot = makeRoot();
    const checkoutPath = makeCheckoutDirectory(gitRuntimeRoot, TERMINAL, "1");
    // Mirrors `removeOwnerWriteRecursively` locking a verification checkout
    // read-only before handing it to the reviewer/verifier.
    chmodSync(join(checkoutPath, "README.md"), 0o400);
    chmodSync(checkoutPath, 0o500);

    const [item] = selectStaleVerificationDirectories(
      gitRuntimeRoot,
      terminalIndex(),
      0,
      FAR_FUTURE,
    );
    if (item === undefined) throw new Error("expected one selected item");

    expect(reclaimVerificationDirectory(terminalIndex(), 0, FAR_FUTURE, item)).toBe(true);
    expect(existsSync(checkoutPath)).toBe(false);
    expect(reclaimVerificationDirectory(terminalIndex(), 0, FAR_FUTURE, item)).toBe(false);
  });

  it("refuses to reclaim a non-terminal attempt's directory even if handed a fabricated item", () => {
    const gitRuntimeRoot = makeRoot();
    const scratchPath = makeScratchDirectory(gitRuntimeRoot, NON_TERMINAL);
    const fabricated = {
      category: "verification-checkout" as const,
      id: `scratch:${NON_TERMINAL}`,
      path: scratchPath,
      attemptId: NON_TERMINAL,
      reason: "fabricated for the test",
    };

    expect(reclaimVerificationDirectory(terminalIndex(), 0, FAR_FUTURE, fabricated)).toBe(false);
    expect(existsSync(scratchPath)).toBe(true);
  });
});
