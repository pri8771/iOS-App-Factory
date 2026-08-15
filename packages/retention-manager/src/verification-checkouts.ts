import { chmodSync, existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { AttemptIdSchema } from "@app-factory/contracts";

import type { TerminalAttemptIndex } from "./terminal-index.js";
import { RetentionManagerError, type GcSelectedItemV1 } from "./types.js";

/**
 * OS-generated metadata entries (from Finder, Spotlight, or volume
 * bookkeeping) that a fail-closed directory scan must tolerate rather than
 * reject. Kept narrow and exact, matching the same denylist used
 * everywhere else in this repository's stores.
 */
const IGNORABLE_OS_METADATA_ENTRIES = new Set([
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
]);

function isIgnorableOsMetadataEntry(name: string): boolean {
  return IGNORABLE_OS_METADATA_ENTRIES.has(name) || name.startsWith("._");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** `<attemptId>-<candidateTree first 16 hex chars>-<ownership nonce uuid>`,
 * exactly `#createWorkspace`'s directory-naming convention in
 * `packages/git-workspace/src/workspace.ts` for `kind: "verification"`. */
const VERIFICATION_CHECKOUT_NAME_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-([0-9a-f]{16})-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;

/**
 * Neither verification scratch directories nor verification checkouts
 * carry an ownership PID, lease, or timestamp of their own (confirmed:
 * `trusted-verifier`'s scratch identity is an in-memory dev/ino tuple that
 * dies with the process, and `FactoryWorkspaceRecord`'s `app-factory-
 * owner.json` marker has no timestamp field). The attemptId is a literal
 * leading path segment for both, which makes the kernel's `terminal_at`
 * the only trustworthy clock: "no live owner" is exactly "the owning
 * attempt is kernel-terminal", since the coordinator that created the
 * checkout only ever runs once per attempt and never again once terminal.
 */
function ageMs(now: Date, terminalAt: string): number {
  return now.getTime() - Date.parse(terminalAt);
}

function eligible(
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
  attemptId: ReturnType<typeof AttemptIdSchema.parse>,
): string | null {
  if (!terminalIndex.isTerminal(attemptId)) return null;
  const terminalAt = terminalIndex.terminalAt(attemptId);
  if (terminalAt === null || ageMs(now, terminalAt) < retentionWindowMs) return null;
  return terminalAt;
}

function selectStaleVerificationScratchDirectories(
  gitRuntimeRoot: string,
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
): readonly GcSelectedItemV1[] {
  const scratchRoot = join(gitRuntimeRoot, "verification-scratch");
  if (!existsSync(scratchRoot)) return [];
  const items: GcSelectedItemV1[] = [];
  for (const entry of readdirSync(scratchRoot, { withFileTypes: true })) {
    if (isIgnorableOsMetadataEntry(entry.name)) continue;
    const parsed = AttemptIdSchema.safeParse(entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink() || !parsed.success) {
      throw new RetentionManagerError(`Unexpected entry under verification-scratch: ${entry.name}`);
    }
    const terminalAt = eligible(terminalIndex, retentionWindowMs, now, parsed.data);
    if (terminalAt === null) continue;
    items.push({
      category: "verification-checkout",
      id: `scratch:${parsed.data}`,
      path: join(scratchRoot, entry.name),
      attemptId: parsed.data,
      reason: `terminal attempt; verification scratch has no live owner (terminal at ${terminalAt})`,
    });
  }
  return items;
}

function selectStaleVerificationCheckoutDirectories(
  gitRuntimeRoot: string,
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
): readonly GcSelectedItemV1[] {
  const verificationRoot = join(gitRuntimeRoot, "verification");
  if (!existsSync(verificationRoot)) return [];
  const items: GcSelectedItemV1[] = [];
  for (const repositoryEntry of readdirSync(verificationRoot, { withFileTypes: true })) {
    if (isIgnorableOsMetadataEntry(repositoryEntry.name)) continue;
    if (
      !repositoryEntry.isDirectory() ||
      repositoryEntry.isSymbolicLink() ||
      !UUID_PATTERN.test(repositoryEntry.name)
    ) {
      throw new RetentionManagerError(
        `Unexpected entry under verification: ${repositoryEntry.name}`,
      );
    }
    const repositoryRoot = join(verificationRoot, repositoryEntry.name);
    for (const checkoutEntry of readdirSync(repositoryRoot, { withFileTypes: true })) {
      if (isIgnorableOsMetadataEntry(checkoutEntry.name)) continue;
      const match = VERIFICATION_CHECKOUT_NAME_PATTERN.exec(checkoutEntry.name);
      if (!checkoutEntry.isDirectory() || checkoutEntry.isSymbolicLink() || match === null) {
        throw new RetentionManagerError(
          `Unexpected entry under verification/${repositoryEntry.name}: ${checkoutEntry.name}`,
        );
      }
      const attemptId = AttemptIdSchema.parse(match[1]);
      const terminalAt = eligible(terminalIndex, retentionWindowMs, now, attemptId);
      if (terminalAt === null) continue;
      items.push({
        category: "verification-checkout",
        id: `checkout:${repositoryEntry.name}/${checkoutEntry.name}`,
        path: join(repositoryRoot, checkoutEntry.name),
        attemptId,
        reason: `terminal attempt; verification checkout has no live owner (terminal at ${terminalAt})`,
      });
    }
  }
  return items;
}

export function selectStaleVerificationDirectories(
  gitRuntimeRoot: string,
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
): readonly GcSelectedItemV1[] {
  return [
    ...selectStaleVerificationScratchDirectories(
      gitRuntimeRoot,
      terminalIndex,
      retentionWindowMs,
      now,
    ),
    ...selectStaleVerificationCheckoutDirectories(
      gitRuntimeRoot,
      terminalIndex,
      retentionWindowMs,
      now,
    ),
  ];
}

/**
 * Verification checkouts are locked read-only before the coordinator
 * hands them off (`removeOwnerWriteRecursively` in
 * `packages/git-workspace/src/workspace.ts`), so a plain `rmSync` can fail
 * with `EACCES`. This unlocks recursively first, mirroring
 * `cleanupReviewWorkspace` in `apps/daemon/src/codex-independent-
 * reviewer.ts`. It is harmless to run against scratch directories too,
 * which are not locked.
 *
 * This intentionally does not run `git worktree prune` on the owning
 * mirror afterward: the hard safety rule for this tool is to leave the
 * immutable mirror and broker refs completely alone, and pruning stale
 * worktree administrative entries touches the mirror's own git-dir. A
 * leaked checkout's removal may leave a stale `git worktree` admin entry
 * behind; that is a pre-existing, separate cleanup concern for the normal
 * (non-crash) reconciliation path, not something this tool reaches into.
 */
function unlockWritableRecursive(path: string): void {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    return;
  }
  if (stats.isSymbolicLink()) return;
  if (stats.isDirectory()) {
    chmodSync(path, (stats.mode & 0o777) | 0o700);
    for (const entry of readdirSync(path)) unlockWritableRecursive(join(path, entry));
  } else {
    chmodSync(path, (stats.mode & 0o777) | 0o600);
  }
}

export function reclaimVerificationDirectory(
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
  item: GcSelectedItemV1,
): boolean {
  if (!existsSync(item.path)) return false;
  const attemptId = AttemptIdSchema.parse(item.attemptId);
  if (eligible(terminalIndex, retentionWindowMs, now, attemptId) === null) return false;
  unlockWritableRecursive(item.path);
  rmSync(item.path, { recursive: true, force: true });
  return true;
}
