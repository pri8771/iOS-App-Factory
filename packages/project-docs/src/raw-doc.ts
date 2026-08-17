import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { RelativePathSchema, Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

import type { ProjectDocsSourceRefV1 } from "@app-factory/contracts";

/** Bound every doc read: the mandated docs observed in the real six repositories top out around
 * 20KB (roam-ios's 570-line STATUS.md); 2MB is generous headroom without letting a malformed or
 * hostile file exhaust memory. */
export const MAX_DOC_BYTES = 2 * 1024 * 1024;

/** A file actually read off disk, with everything a parser or a provenance record needs. */
export type RawDoc = Readonly<{
  /** Repo-relative POSIX path, in the exact case found on disk. */
  relativePath: string;
  absolutePath: string;
  text: string;
  sha256: Sha256Digest;
  /** 1-based: `lines[0]` is line 1. */
  lines: readonly string[];
}>;

function toPosixRelative(repositoryRoot: string, absolutePath: string): string {
  return relative(repositoryRoot, absolutePath).split(sep).join("/");
}

/**
 * Reads one regular file within `repositoryRoot` and returns it as a `RawDoc`, or `null` if it does
 * not exist, is not a regular file, or exceeds `MAX_DOC_BYTES`. Fails closed (returns `null`) rather
 * than throwing for any of those cases, matching the "honest unavailable, never inferred" contract
 * `ProjectDocsSnapshotV1` promises -- an oversized or unreadable doc is unavailable, not a fatal
 * error for the whole snapshot. Bytes are decoded as UTF-8 with a best-effort fallback for anything
 * that is not; the six surveyed repositories' docs are all plain UTF-8 markdown/JSON.
 */
export function readRawDoc(repositoryRoot: string, relativePathCandidate: string): RawDoc | null {
  const absolutePath = resolve(join(repositoryRoot, relativePathCandidate));
  // Every candidate path this package builds comes from a fixed mandated filename joined onto a
  // directory name resolved from a real directory listing (see layout.ts), never from arbitrary
  // caller input, but this check is cheap defense in depth against a future caller passing one
  // through unchecked.
  if (!absolutePath.startsWith(`${resolve(repositoryRoot)}${sep}`)) return null;
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return null;
  }
  if (!stats.isFile() || stats.size < 1 || stats.size > MAX_DOC_BYTES) return null;
  let bytes: Buffer;
  try {
    bytes = readFileSync(absolutePath);
  } catch {
    return null;
  }
  const text = bytes.toString("utf8");
  const sha256 = Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );
  return {
    relativePath: toPosixRelative(repositoryRoot, absolutePath),
    absolutePath,
    text,
    sha256,
    lines: text.split(/\r\n|\r|\n/),
  };
}

/** Builds a `ProjectDocsSourceRefV1` citing `doc`, optionally narrowed to a 1-based inclusive line range. */
export function sourceRef(
  doc: RawDoc,
  lineRange: Readonly<{ start: number; end: number }> | null = null,
): ProjectDocsSourceRefV1 {
  return {
    path: RelativePathSchema.parse(doc.relativePath),
    sha256: doc.sha256,
    lineRange,
  };
}
