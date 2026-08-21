import { spawn } from "node:child_process";

import { parseCredentialReference, type CredentialReferenceV1 } from "@app-factory/adapter-sdk";

const SECURITY_EXECUTABLE = "/usr/bin/security";
const MAX_CREDENTIAL_BYTES = 64 * 1024;
const MAX_DIAGNOSTIC_BYTES = 8 * 1024;

export class CredentialBrokerError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "CredentialBrokerError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type CredentialCommandRequest = Readonly<{
  executable: typeof SECURITY_EXECUTABLE;
  arguments: readonly string[];
  timeoutMs: number;
  maximumStdoutBytes: number;
  maximumStderrBytes: number;
  signal: AbortSignal;
}>;

export type CredentialCommandResult = Readonly<{
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
  timedOut: boolean;
  outputLimitExceeded: boolean;
}>;

export type CredentialCommandPort = Readonly<{
  run(request: CredentialCommandRequest): Promise<CredentialCommandResult>;
}>;

export type CredentialCapabilityV1 = Readonly<{
  schemaVersion: 1;
  reference: CredentialReferenceV1;
  available: boolean;
  blockerCode: string | null;
}>;

export type CredentialBroker = Readonly<{
  preflight(reference: unknown, signal: AbortSignal): Promise<CredentialCapabilityV1>;
  withCredential<T>(
    reference: unknown,
    signal: AbortSignal,
    use: (credential: Uint8Array) => Promise<T>,
  ): Promise<T>;
  /**
   * Writes `secret` into Keychain under `reference` (Architecture decision 2: the daemon writes
   * the Keychain, the bare key crosses the wire exactly once via `provider.credential.set`).
   * `secret` is zeroed in `finally`, whether the store succeeds, fails, or is cancelled -- the
   * caller must treat it as consumed after this call returns or throws.
   */
  store(reference: unknown, secret: Uint8Array, signal: AbortSignal): Promise<void>;
}>;

function aborted(): CredentialBrokerError {
  return new CredentialBrokerError(
    "credential.cancelled",
    "Credential access was cancelled.",
    true,
  );
}

function validateTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 60_000) {
    throw new TypeError("credential timeout must be between 100 and 60000 milliseconds");
  }
  return value;
}

function securityArguments(reference: CredentialReferenceV1, includeSecret: boolean): string[] {
  return [
    "find-generic-password",
    ...(includeSecret ? ["-w"] : []),
    "-s",
    reference.service,
    "-a",
    reference.account,
  ];
}

/**
 * `-U` updates the item in place when one already exists for this service/account instead of
 * failing with a duplicate-item error, so `store` is safe to call again for key rotation. The
 * secret is necessarily materialized as a JS string here (a child process argv is strings, not
 * bytes) -- unlike a fetched credential's bytes, this string cannot be zeroed; the caller's
 * `Uint8Array` is zeroed in `store`'s `finally` regardless.
 */
function securityStoreArguments(reference: CredentialReferenceV1, secretText: string): string[] {
  return [
    "add-generic-password",
    "-U",
    "-s",
    reference.service,
    "-a",
    reference.account,
    "-w",
    secretText,
  ];
}

function trimOneLineEnding(bytes: Uint8Array): Uint8Array {
  let end = bytes.byteLength;
  if (end > 0 && bytes[end - 1] === 0x0a) end -= 1;
  if (end > 0 && bytes[end - 1] === 0x0d) end -= 1;
  return bytes.subarray(0, end);
}

function eraseResult(result: CredentialCommandResult | undefined): void {
  result?.stdout.fill(0);
  result?.stderr.fill(0);
}

export function createCredentialBroker(
  commandPort: CredentialCommandPort = createMacOsSecurityCommandPort(),
  timeoutMsValue = 10_000,
): CredentialBroker {
  const timeoutMs = validateTimeout(timeoutMsValue);
  const run = async (
    reference: CredentialReferenceV1,
    includeSecret: boolean,
    signal: AbortSignal,
  ): Promise<CredentialCommandResult> => {
    if (signal.aborted) throw aborted();
    const result = await commandPort.run({
      executable: SECURITY_EXECUTABLE,
      arguments: securityArguments(reference, includeSecret),
      timeoutMs,
      maximumStdoutBytes: includeSecret ? MAX_CREDENTIAL_BYTES + 2 : MAX_DIAGNOSTIC_BYTES,
      maximumStderrBytes: MAX_DIAGNOSTIC_BYTES,
      signal,
    });
    if (signal.aborted) {
      eraseResult(result);
      throw aborted();
    }
    return result;
  };

  return {
    preflight: async (referenceValue, signal) => {
      const reference = parseCredentialReference(referenceValue);
      let result: CredentialCommandResult;
      try {
        result = await run(reference, false, signal);
      } catch (error) {
        if (error instanceof CredentialBrokerError) throw error;
        return {
          schemaVersion: 1,
          reference,
          available: false,
          blockerCode: "credential.probe-failed",
        };
      }
      try {
        const available = result.exitCode === 0 && !result.timedOut && !result.outputLimitExceeded;
        return {
          schemaVersion: 1,
          reference,
          available,
          blockerCode: available
            ? null
            : result.timedOut
              ? "credential.probe-timeout"
              : result.outputLimitExceeded
                ? "credential.probe-output-limit"
                : "credential.not-found-or-denied",
        };
      } finally {
        eraseResult(result);
      }
    },
    withCredential: async (referenceValue, signal, use) => {
      const reference = parseCredentialReference(referenceValue);
      let result: CredentialCommandResult;
      try {
        result = await run(reference, true, signal);
      } catch (error) {
        if (error instanceof CredentialBrokerError) throw error;
        throw new CredentialBrokerError(
          "credential.read-failed",
          "The credential could not be read from Keychain.",
          true,
        );
      }
      try {
        if (result.timedOut) {
          throw new CredentialBrokerError(
            "credential.read-timeout",
            "The Keychain credential read timed out.",
            true,
          );
        }
        if (result.outputLimitExceeded || result.stdout.byteLength > MAX_CREDENTIAL_BYTES + 2) {
          throw new CredentialBrokerError(
            "credential.read-output-limit",
            "The Keychain credential exceeds the allowed size.",
            false,
          );
        }
        if (result.exitCode !== 0) {
          throw new CredentialBrokerError(
            "credential.not-found-or-denied",
            "The Keychain credential is unavailable.",
            false,
          );
        }
      } catch (error) {
        eraseResult(result);
        throw error;
      }
      let owned: Uint8Array;
      try {
        owned = Uint8Array.from(trimOneLineEnding(result.stdout));
      } finally {
        eraseResult(result);
      }
      if (owned.byteLength === 0 || owned.byteLength > MAX_CREDENTIAL_BYTES) {
        owned.fill(0);
        throw new CredentialBrokerError(
          "credential.invalid",
          "The Keychain credential is empty or too large.",
          false,
        );
      }
      const onAbort = (): void => {
        owned.fill(0);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        if (signal.aborted) throw aborted();
        const value = await use(owned);
        if (signal.aborted) throw aborted();
        return value;
      } finally {
        signal.removeEventListener("abort", onAbort);
        owned.fill(0);
      }
    },
    store: async (referenceValue, secret, signal) => {
      const reference = parseCredentialReference(referenceValue);
      try {
        if (signal.aborted) throw aborted();
        if (secret.byteLength === 0 || secret.byteLength > MAX_CREDENTIAL_BYTES) {
          throw new CredentialBrokerError(
            "credential.store-invalid",
            "The credential to store is empty or too large.",
            false,
          );
        }
        // Never logged: this string exists only to become the `-w` argv entry below.
        const secretText = Buffer.from(secret).toString("utf8");
        let result: CredentialCommandResult;
        try {
          result = await commandPort.run({
            executable: SECURITY_EXECUTABLE,
            arguments: securityStoreArguments(reference, secretText),
            timeoutMs,
            maximumStdoutBytes: MAX_DIAGNOSTIC_BYTES,
            maximumStderrBytes: MAX_DIAGNOSTIC_BYTES,
            signal,
          });
        } catch (error) {
          if (error instanceof CredentialBrokerError) throw error;
          throw new CredentialBrokerError(
            "credential.store-failed",
            "The credential could not be stored in Keychain.",
            true,
          );
        }
        try {
          if (signal.aborted) throw aborted();
          if (result.timedOut) {
            throw new CredentialBrokerError(
              "credential.store-timeout",
              "The Keychain credential store timed out.",
              true,
            );
          }
          if (result.outputLimitExceeded) {
            throw new CredentialBrokerError(
              "credential.store-output-limit",
              "The Keychain credential store produced too much output.",
              false,
            );
          }
          if (result.exitCode !== 0) {
            throw new CredentialBrokerError(
              "credential.store-denied",
              "The credential could not be written to Keychain.",
              false,
            );
          }
        } finally {
          eraseResult(result);
        }
      } finally {
        secret.fill(0);
      }
    },
  };
}

export type MacOsSecurityCommandPortOptions = Readonly<{
  terminateGraceMs?: number;
  spawnProcess?: typeof spawn;
}>;

export function createMacOsSecurityCommandPort(
  options: MacOsSecurityCommandPortOptions = {},
): CredentialCommandPort {
  const terminateGraceMs = options.terminateGraceMs ?? 1_000;
  if (
    !Number.isSafeInteger(terminateGraceMs) ||
    terminateGraceMs < 1 ||
    terminateGraceMs > 10_000
  ) {
    throw new TypeError("terminateGraceMs must be between 1 and 10000 milliseconds");
  }
  const spawnProcess = options.spawnProcess ?? spawn;
  return {
    run: async (request) =>
      await new Promise<CredentialCommandResult>((resolvePromise, rejectPromise) => {
        if (request.signal.aborted) return rejectPromise(aborted());
        const child = spawnProcess(request.executable, request.arguments, {
          detached: true,
          env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        let outputLimitExceeded = false;
        let settled = false;
        let stopping = false;
        let forceTimer: NodeJS.Timeout | undefined;
        let hardStopTimer: NodeJS.Timeout | undefined;

        const eraseChunks = (): void => {
          for (const chunk of stdout) chunk.fill(0);
          for (const chunk of stderr) chunk.fill(0);
          stdout.length = 0;
          stderr.length = 0;
        };
        const consumeChunks = (chunks: Buffer[]): Uint8Array => {
          const output = Buffer.alloc(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
          let offset = 0;
          for (const chunk of chunks) {
            chunk.copy(output, offset);
            offset += chunk.byteLength;
            chunk.fill(0);
          }
          chunks.length = 0;
          return output;
        };

        const signalGroup = (signal: NodeJS.Signals): void => {
          if (child.pid === undefined) return;
          try {
            process.kill(-child.pid, signal);
          } catch {
            // Hard settlement below still bounds the caller and erases output.
          }
        };
        const cleanup = (): void => {
          clearTimeout(timer);
          if (forceTimer !== undefined) clearTimeout(forceTimer);
          if (hardStopTimer !== undefined) clearTimeout(hardStopTimer);
          request.signal.removeEventListener("abort", onAbort);
          child.stdout.removeAllListeners("data");
          child.stderr.removeAllListeners("data");
        };
        const finish = (code: number | null): void => {
          if (settled) return;
          settled = true;
          cleanup();
          if (request.signal.aborted) {
            eraseChunks();
            rejectPromise(aborted());
            return;
          }
          resolvePromise({
            exitCode: code ?? 255,
            stdout: consumeChunks(stdout),
            stderr: consumeChunks(stderr),
            timedOut,
            outputLimitExceeded,
          });
        };
        const stop = (): void => {
          if (stopping) return;
          stopping = true;
          signalGroup("SIGTERM");
          forceTimer ??= setTimeout(() => signalGroup("SIGKILL"), terminateGraceMs);
          hardStopTimer ??= setTimeout(() => finish(255), terminateGraceMs * 2);
        };
        const onAbort = (): void => stop();
        request.signal.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => {
          timedOut = true;
          stop();
        }, request.timeoutMs);
        timer.unref();
        if (request.signal.aborted) stop();

        const collect = (
          target: Buffer[],
          chunk: Buffer,
          maximum: number,
          current: number,
        ): number => {
          const next = current + chunk.byteLength;
          if (next <= maximum) target.push(Buffer.from(chunk));
          chunk.fill(0);
          if (next > maximum && !outputLimitExceeded) {
            outputLimitExceeded = true;
            stop();
          }
          return next;
        };
        child.stdout.on("data", (chunk: Buffer) => {
          stdoutBytes = collect(stdout, chunk, request.maximumStdoutBytes, stdoutBytes);
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderrBytes = collect(stderr, chunk, request.maximumStderrBytes, stderrBytes);
        });
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          eraseChunks();
          rejectPromise(error);
        });
        child.once("close", (code) => {
          finish(code);
        });
      }),
  };
}
