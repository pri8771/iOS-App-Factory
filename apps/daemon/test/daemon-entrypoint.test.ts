import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DaemonConfigurationError,
  loadDaemonProcessConfiguration,
  readPrivateAuthorizationFile,
  runDaemonProcess,
  type DaemonSignalPort,
} from "../src/daemon-entrypoint.js";
import type { FactoryDaemonService } from "../src/factory-daemon-service.js";

const roots: string[] = [];
const TOKEN = "daemon-private-authorization-token-000001";

async function root(): Promise<string> {
  const path = await mkdtemp(join("/private/tmp", "factory-daemon-entrypoint-"));
  roots.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

describe("daemon process configuration", () => {
  it("loads a bounded user-private token without placing it in environment configuration", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    await writeFile(authFile, `${TOKEN}\n`, { mode: 0o600 });

    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.3.0-test",
        APP_FACTORY_POLL_INTERVAL_MS: "25",
      }),
    ).resolves.toEqual({
      runtimeDirectory: join(directory, "runtime"),
      authorization: TOKEN,
      daemonVersion: "0.3.0-test",
      pollIntervalMs: 25,
    });
  });

  it("rejects a group-readable credential and a symlink", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    const link = join(directory, "authorization-link");
    await writeFile(authFile, TOKEN, { mode: 0o600 });
    await chmod(authFile, 0o640);
    await expect(readPrivateAuthorizationFile(authFile)).rejects.toThrow(
      "must not be accessible by group or others",
    );

    await chmod(authFile, 0o600);
    await symlink(authFile, link);
    await expect(readPrivateAuthorizationFile(link)).rejects.toThrow("cannot be opened safely");
  });

  it("fails closed on missing, relative, malformed, and oversized settings", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    await writeFile(authFile, TOKEN, { mode: 0o600 });

    await expect(loadDaemonProcessConfiguration({})).rejects.toBeInstanceOf(
      DaemonConfigurationError,
    );
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: "relative",
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.3.0",
      }),
    ).rejects.toThrow("must be an absolute path");
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: directory,
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "version with spaces",
      }),
    ).rejects.toThrow("portable version identifier");
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: directory,
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.3.0",
        APP_FACTORY_POLL_INTERVAL_MS: "60001",
      }),
    ).rejects.toThrow("must not exceed 60000");
  });

  it("zeroes the raw authorization read buffer after decoding", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    await writeFile(authFile, TOKEN, { mode: 0o600 });
    const originalAlloc = Buffer.alloc;
    let captured: Buffer | undefined;
    const allocation = vi.spyOn(Buffer, "alloc").mockImplementation(((size: number) => {
      const value = originalAlloc(size);
      if (size === 515) captured = value;
      return value;
    }) as typeof Buffer.alloc);
    try {
      await expect(readPrivateAuthorizationFile(authFile)).resolves.toBe(TOKEN);
    } finally {
      allocation.mockRestore();
    }
    expect([...(captured ?? [])]).toEqual(Array(515).fill(0));
  });
});

function signalPort(emitter: EventEmitter): DaemonSignalPort {
  return {
    once: (signal, listener) => emitter.once(signal, listener),
    removeListener: (signal, listener) => emitter.removeListener(signal, listener),
  };
}

describe("daemon process lifecycle", () => {
  it("catches a signal during startup and logs scheduler failures without attacker text", async () => {
    const emitter = new EventEmitter();
    const close = vi.fn(async () => undefined);
    let resolveStart: ((service: FactoryDaemonService) => void) | undefined;
    const starting = new Promise<FactoryDaemonService>((resolve) => {
      resolveStart = resolve;
    });
    const stderr = vi.fn();
    const running = runDaemonProcess(
      {},
      { stderr },
      {
        signals: signalPort(emitter),
        start: async (_environment, onSchedulerError) => {
          onSchedulerError(Object.assign(new Error("secret"), { name: "Injected\nLog" }));
          return await starting;
        },
        shutdownTimeoutMs: 50,
      },
    );
    emitter.emit("SIGTERM");
    resolveStart?.({ close } as unknown as FactoryDaemonService);

    await expect(running).resolves.toBe(0);
    expect(close).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith("factory-daemon scheduler error\n");
    expect(stderr.mock.calls.flat().join("")).not.toContain("Injected");
  });

  it("bounds a daemon shutdown that never settles", async () => {
    const emitter = new EventEmitter();
    const stderr = vi.fn();
    const close = vi.fn(async () => await new Promise<void>(() => undefined));
    const running = runDaemonProcess(
      {},
      { stderr },
      {
        signals: signalPort(emitter),
        start: async () => ({ close }) as unknown as FactoryDaemonService,
        shutdownTimeoutMs: 5,
      },
    );
    emitter.emit("SIGINT");

    await expect(running).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith("factory-daemon: shutdown did not complete cleanly.\n");
  });
});
