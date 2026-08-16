#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PolicyEngineError, verifyPolicyBundle } from "@app-factory/policy-engine";

import {
  PolicyCorpusError,
  compilePolicySource,
  crossCheckSidecar,
  loadPolicySidecar,
  loadPolicySource,
  materializePolicyBundle,
  scanRuleAuthority,
} from "./index.js";

export type PolicyCorpusCliIo = Readonly<{
  stdout(value: string): void;
  stderr(value: string): void;
}>;

export type ParsedPolicyCorpusCliInvocation =
  | Readonly<{
      kind: "compile";
      sourceFile: string;
      sidecarFile: string | null;
      outDirectory: string;
      generatedAt: string;
      overwrite: boolean;
      bundleFile: string | null;
    }>
  | Readonly<{ kind: "verify"; sourceFile: string; generatedAt: string; root: string }>
  | Readonly<{ kind: "scan"; root: string }>;

export class PolicyCorpusCliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PolicyCorpusCliUsageError";
  }
}

function usageError(message: string): never {
  throw new PolicyCorpusCliUsageError(message);
}

function consumeOption(arguments_: string[], option: string): string | undefined {
  const indexes = arguments_
    .map((argument, index) => (argument === option ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length > 1) usageError(`${option} may only be provided once.`);
  const index = indexes[0];
  if (index === undefined) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) usageError(`${option} requires a value.`);
  arguments_.splice(index, 2);
  return value;
}

function consumeFlag(arguments_: string[], flag: string): boolean {
  const index = arguments_.indexOf(flag);
  if (index < 0) return false;
  arguments_.splice(index, 1);
  if (arguments_.includes(flag)) usageError(`${flag} may only be provided once.`);
  return true;
}

function requiredPath(value: string | undefined, option: string): string {
  if (value === undefined || value.length === 0) usageError(`${option} is required.`);
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function optionalPath(value: string | undefined): string | null {
  if (value === undefined) return null;
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function parsePolicyCorpusCliArguments(
  argv: readonly string[],
): ParsedPolicyCorpusCliInvocation {
  const arguments_ = [...argv];
  const operation = arguments_.shift();
  let invocation: ParsedPolicyCorpusCliInvocation;
  if (operation === "compile") {
    const generatedAt = consumeOption(arguments_, "--generated-at");
    if (generatedAt === undefined) usageError("--generated-at <ISO instant> is required.");
    invocation = {
      kind: "compile",
      sourceFile: requiredPath(consumeOption(arguments_, "--source"), "--source"),
      sidecarFile: optionalPath(consumeOption(arguments_, "--sidecar")),
      outDirectory: requiredPath(consumeOption(arguments_, "--out"), "--out"),
      generatedAt,
      overwrite: consumeFlag(arguments_, "--overwrite"),
      bundleFile: optionalPath(consumeOption(arguments_, "--bundle")),
    };
  } else if (operation === "verify") {
    const generatedAt = consumeOption(arguments_, "--generated-at");
    if (generatedAt === undefined) usageError("--generated-at <ISO instant> is required.");
    invocation = {
      kind: "verify",
      sourceFile: requiredPath(consumeOption(arguments_, "--source"), "--source"),
      generatedAt,
      root: requiredPath(consumeOption(arguments_, "--root"), "--root"),
    };
  } else if (operation === "scan") {
    invocation = {
      kind: "scan",
      root: requiredPath(consumeOption(arguments_, "--root"), "--root"),
    };
  } else {
    usageError("factory-policy-corpus requires compile, verify, or scan.");
  }
  if (arguments_.length > 0) usageError(`Unexpected argument: ${String(arguments_[0])}`);
  return invocation;
}

function renderError(error: unknown): string {
  const code =
    error instanceof PolicyCorpusCliUsageError
      ? "factory-policy-corpus.usage"
      : error instanceof PolicyCorpusError || error instanceof PolicyEngineError
        ? "factory-policy-corpus.failed"
        : "factory-policy-corpus.error";
  const message = error instanceof Error ? error.message : String(error);
  return `${JSON.stringify({ ok: false, error: { code, message } })}\n`;
}

export function runPolicyCorpusCli(argv: readonly string[], io: PolicyCorpusCliIo): number {
  let invocation: ParsedPolicyCorpusCliInvocation;
  try {
    invocation = parsePolicyCorpusCliArguments(argv);
  } catch (error) {
    io.stderr(renderError(error));
    return 2;
  }
  try {
    switch (invocation.kind) {
      case "compile": {
        const source = loadPolicySource(invocation.sourceFile);
        if (invocation.sidecarFile !== null) {
          const mismatches = crossCheckSidecar(source, loadPolicySidecar(invocation.sidecarFile));
          if (mismatches.length > 0) {
            throw new PolicyCorpusError(`sidecar disagrees with source: ${mismatches.join("; ")}`);
          }
        }
        const bundle = compilePolicySource(source, invocation.generatedAt);
        const written = materializePolicyBundle({
          bundle,
          root: invocation.outDirectory,
          overwrite: invocation.overwrite,
        });
        if (invocation.bundleFile !== null) {
          writeFileSync(invocation.bundleFile, `${JSON.stringify(bundle, null, 2)}\n`, {
            flag: invocation.overwrite ? "w" : "wx",
          });
        }
        io.stdout(
          `${JSON.stringify({
            ok: true,
            result: {
              policyId: bundle.lock.policyId,
              policyVersion: bundle.lock.policyVersion,
              sourceDigest: bundle.sourceDigest,
              bundleDigest: bundle.bundleDigest,
              generatedAt: bundle.lock.generatedAt,
              root: invocation.outDirectory,
              files: written,
              requiredChecks: bundle.lock.requiredChecks,
              protectedSurfaceCount: bundle.lock.protectedSurfaces.length,
              bundleFile: invocation.bundleFile,
            },
          })}\n`,
        );
        return 0;
      }
      case "verify": {
        // The bundle is a pure function of (source, generatedAt); recompile rather than trust a file.
        const bundle = compilePolicySource(
          loadPolicySource(invocation.sourceFile),
          invocation.generatedAt,
        );
        verifyPolicyBundle(invocation.root, bundle);
        io.stdout(
          `${JSON.stringify({
            ok: true,
            result: { root: invocation.root, bundleDigest: bundle.bundleDigest, drift: false },
          })}\n`,
        );
        return 0;
      }
      case "scan": {
        const report = scanRuleAuthority(invocation.root);
        io.stdout(`${JSON.stringify({ ok: true, result: report })}\n`);
        return 0;
      }
    }
  } catch (error) {
    io.stderr(renderError(error));
    return 1;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  process.exitCode = runPolicyCorpusCli(process.argv.slice(2), {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  });
}
