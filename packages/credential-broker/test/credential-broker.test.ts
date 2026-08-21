import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  createCredentialBroker,
  createMacOsSecurityCommandPort,
  CredentialBrokerError,
  type CredentialCommandPort,
  type MacOsSecurityCommandPortOptions,
} from "../src/index.js";

const REFERENCE = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: "app-factory.github",
  account: "factory-user",
} as const;

function command(
  result: Readonly<{
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    timedOut?: boolean;
    outputLimitExceeded?: boolean;
  }> = {},
): CredentialCommandPort & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async () => ({
      exitCode: result.exitCode ?? 0,
      stdout: Uint8Array.from(Buffer.from(result.stdout ?? "metadata")),
      stderr: Uint8Array.from(Buffer.from(result.stderr ?? "")),
      timedOut: result.timedOut ?? false,
      outputLimitExceeded: result.outputLimitExceeded ?? false,
    })),
  };
}

describe("credential broker", () => {
  it("probes metadata without requesting or returning the secret", async () => {
    const port = command();
    const result = await createCredentialBroker(port).preflight(
      REFERENCE,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ available: true, blockerCode: null, reference: REFERENCE });
    expect(port.run.mock.calls[0]?.[0].arguments).toEqual([
      "find-generic-password",
      "-s",
      REFERENCE.service,
      "-a",
      REFERENCE.account,
    ]);
    const commandResult = await port.run.mock.results[0]?.value;
    expect([...(commandResult?.stdout ?? [])]).toEqual(Array("metadata".length).fill(0));
  });

  it("exposes credential bytes only inside the callback and zeroes owned buffers", async () => {
    const port = command({ stdout: "top-secret-provider-token\n" });
    let borrowed: Uint8Array | null = null;
    const result = await createCredentialBroker(port).withCredential(
      REFERENCE,
      new AbortController().signal,
      async (credential) => {
        borrowed = credential;
        return Buffer.from(credential).toString("utf8").length;
      },
    );
    expect(result).toBe("top-secret-provider-token".length);
    expect([...((borrowed ?? new Uint8Array()) as Uint8Array)]).toEqual(
      Array("top-secret-provider-token".length).fill(0),
    );
    expect(port.run.mock.calls[0]?.[0].arguments).toContain("-w");
  });

  it("redacts provider output on errors and zeroes credentials when a callback fails", async () => {
    const secret = "canary-that-must-not-escape";
    const denied = createCredentialBroker(command({ exitCode: 44, stderr: secret }));
    await expect(
      denied.withCredential(REFERENCE, new AbortController().signal, async () => undefined),
    ).rejects.toMatchObject({ code: "credential.not-found-or-denied" });
    try {
      await denied.withCredential(REFERENCE, new AbortController().signal, async () => undefined);
      throw new Error("expected denied credential access");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialBrokerError);
      expect((error as Error).message).not.toContain(secret);
    }

    const available = createCredentialBroker(command({ stdout: `${secret}\n` }));
    let borrowed: Uint8Array | null = null;
    await expect(
      available.withCredential(REFERENCE, new AbortController().signal, async (credential) => {
        borrowed = credential;
        throw new Error("adapter failed");
      }),
    ).rejects.toThrow("adapter failed");
    expect([...((borrowed ?? new Uint8Array()) as Uint8Array)]).toEqual(
      Array(secret.length).fill(0),
    );
  });

  it("fails before dispatch when cancellation is already requested", async () => {
    const port = command();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createCredentialBroker(port).preflight(REFERENCE, controller.signal),
    ).rejects.toBeInstanceOf(CredentialBrokerError);
    expect(port.run).not.toHaveBeenCalled();
  });

  it("erases command buffers when cancellation arrives after the Keychain result", async () => {
    const controller = new AbortController();
    const stdout = Uint8Array.from(Buffer.from("post-result-secret"));
    const stderr = Uint8Array.from(Buffer.from("diagnostic"));
    const port: CredentialCommandPort = {
      run: vi.fn(async () => {
        controller.abort();
        return {
          exitCode: 0,
          stdout,
          stderr,
          timedOut: false,
          outputLimitExceeded: false,
        };
      }),
    };

    await expect(
      createCredentialBroker(port).withCredential(REFERENCE, controller.signal, async () => 1),
    ).rejects.toMatchObject({ code: "credential.cancelled" });
    expect([...stdout]).toEqual(Array(stdout.byteLength).fill(0));
    expect([...stderr]).toEqual(Array(stderr.byteLength).fill(0));
  });

  it("stores a secret with -U (update-in-place) and never requests it back", async () => {
    const port = command();
    const secret = Uint8Array.from(Buffer.from("brand-new-provider-token"));
    await createCredentialBroker(port).store(REFERENCE, secret, new AbortController().signal);
    expect(port.run.mock.calls[0]?.[0].arguments).toEqual([
      "add-generic-password",
      "-U",
      "-s",
      REFERENCE.service,
      "-a",
      REFERENCE.account,
      "-w",
      "brand-new-provider-token",
    ]);
    // The caller's buffer is zeroed once the store settles.
    expect([...secret]).toEqual(Array("brand-new-provider-token".length).fill(0));
  });

  it("zeroes the secret buffer even when the store is refused, times out, or is cancelled upfront", async () => {
    const denied = createCredentialBroker(command({ exitCode: 44, stderr: "irrelevant" }));
    const deniedSecret = Uint8Array.from(Buffer.from("will-be-denied"));
    await expect(
      denied.store(REFERENCE, deniedSecret, new AbortController().signal),
    ).rejects.toMatchObject({ code: "credential.store-denied", retryable: false });
    expect([...deniedSecret]).toEqual(Array("will-be-denied".length).fill(0));

    const timedOut = createCredentialBroker(command({ timedOut: true }));
    const timedOutSecret = Uint8Array.from(Buffer.from("will-time-out"));
    await expect(
      timedOut.store(REFERENCE, timedOutSecret, new AbortController().signal),
    ).rejects.toMatchObject({ code: "credential.store-timeout", retryable: true });
    expect([...timedOutSecret]).toEqual(Array("will-time-out".length).fill(0));

    const limited = createCredentialBroker(command({ outputLimitExceeded: true }));
    const limitedSecret = Uint8Array.from(Buffer.from("output-too-big"));
    await expect(
      limited.store(REFERENCE, limitedSecret, new AbortController().signal),
    ).rejects.toMatchObject({ code: "credential.store-output-limit", retryable: false });
    expect([...limitedSecret]).toEqual(Array("output-too-big".length).fill(0));

    const controller = new AbortController();
    controller.abort();
    const port = command();
    const cancelledSecret = Uint8Array.from(Buffer.from("never-sent"));
    await expect(
      createCredentialBroker(port).store(REFERENCE, cancelledSecret, controller.signal),
    ).rejects.toMatchObject({ code: "credential.cancelled" });
    expect(port.run).not.toHaveBeenCalled();
    expect([...cancelledSecret]).toEqual(Array("never-sent".length).fill(0));

    const empty = createCredentialBroker(command());
    const emptySecret = new Uint8Array(0);
    await expect(
      empty.store(REFERENCE, emptySecret, new AbortController().signal),
    ).rejects.toMatchObject({ code: "credential.store-invalid", retryable: false });
  });

  it("wraps an unexpected command-port failure as credential.store-failed and still zeroes the buffer", async () => {
    const port: CredentialCommandPort = {
      run: vi.fn(async () => Promise.reject(new Error("boom"))),
    };
    const secret = Uint8Array.from(Buffer.from("about-to-explode"));
    await expect(
      createCredentialBroker(port).store(REFERENCE, secret, new AbortController().signal),
    ).rejects.toMatchObject({ code: "credential.store-failed", retryable: true });
    expect([...secret]).toEqual(Array("about-to-explode".length).fill(0));
  });

  it("never leaks the secret into a thrown error message", async () => {
    const secret = "canary-secret-must-not-appear-in-errors";
    const denied = createCredentialBroker(command({ exitCode: 1 }));
    try {
      await denied.store(
        REFERENCE,
        Uint8Array.from(Buffer.from(secret)),
        new AbortController().signal,
      );
      throw new Error("expected a denied store");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialBrokerError);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("revokes and erases a borrowed credential while its callback is still running", async () => {
    const controller = new AbortController();
    let borrowed: Uint8Array | undefined;
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const access = createCredentialBroker(command({ stdout: "live-secret\n" })).withCredential(
      REFERENCE,
      controller.signal,
      async (credential) => {
        borrowed = credential;
        await hold;
        return "must-not-succeed";
      },
    );
    await vi.waitFor(() => expect(borrowed).toBeDefined());
    controller.abort();
    expect([...(borrowed ?? [])]).toEqual(Array("live-secret".length).fill(0));
    release?.();
    await expect(access).rejects.toMatchObject({ code: "credential.cancelled" });
  });
});

describe("macOS Keychain command port", () => {
  it("erases captured process chunks when the child errors", async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const spawnProcess = vi.fn(() => child) as unknown as NonNullable<
      MacOsSecurityCommandPortOptions["spawnProcess"]
    >;
    const port = createMacOsSecurityCommandPort({ spawnProcess, terminateGraceMs: 5 });
    const stdout = Buffer.from("raw-secret-chunk");
    const stderr = Buffer.from("raw-diagnostic");
    const running = port.run({
      executable: "/usr/bin/security",
      arguments: ["find-generic-password"],
      timeoutMs: 100,
      maximumStdoutBytes: 1_000,
      maximumStderrBytes: 1_000,
      signal: new AbortController().signal,
    });
    child.stdout.write(stdout);
    child.stderr.write(stderr);
    child.emit("error", new Error("child failed"));

    await expect(running).rejects.toThrow("child failed");
    expect([...stdout]).toEqual(Array(stdout.byteLength).fill(0));
    expect([...stderr]).toEqual(Array(stderr.byteLength).fill(0));
  });

  it("settles cancellation even when the child never closes", async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const spawnProcess = vi.fn(() => child) as unknown as NonNullable<
      MacOsSecurityCommandPortOptions["spawnProcess"]
    >;
    const controller = new AbortController();
    const running = createMacOsSecurityCommandPort({
      spawnProcess,
      terminateGraceMs: 5,
    }).run({
      executable: "/usr/bin/security",
      arguments: ["find-generic-password"],
      timeoutMs: 100,
      maximumStdoutBytes: 1_000,
      maximumStderrBytes: 1_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: "credential.cancelled" });
  });
});
