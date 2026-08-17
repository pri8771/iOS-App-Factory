import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadDaemonProcessConfiguration,
  type DaemonProcessEnvironment,
} from "../src/daemon-entrypoint.js";
import {
  buildPhaseParticipantsPortV1,
  buildRoomSubsystemConfiguration,
  parseRoomParticipantsConfigV1,
  RoomParticipantsConfigurationError,
} from "../src/room-participants-config.js";

const TOKEN = "daemon-private-authorization-token-000001";

const VALID_ATTESTATION = {
  schemaVersion: 1,
  decision:
    "Owner-approved ADR 0002 gate closure for real room participants, with the accepted gaps below and standing compensating controls.",
  acceptedGaps: [
    "Codex CLI fine-grained per-path deny rules are not OS-enforced.",
    "The Factory-owned Seatbelt sandbox layer is deferred.",
  ],
  date: "2026-08-14",
  owner: "Priyansh Chordia",
} as const;

const roots: string[] = [];
async function root(): Promise<string> {
  const path = await mkdtemp(join("/private/tmp", "room-participants-config-test-"));
  roots.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

describe("parseRoomParticipantsConfigV1", () => {
  it("parses a minimal config with no providers or roster configured", () => {
    expect(parseRoomParticipantsConfigV1({ schemaVersion: 1 })).toEqual({ schemaVersion: 1 });
  });

  it("rejects an unsupported schema version", () => {
    expect(() => parseRoomParticipantsConfigV1({ schemaVersion: 2 })).toThrow(
      RoomParticipantsConfigurationError,
    );
  });

  it("rejects unexpected top-level fields", () => {
    expect(() => parseRoomParticipantsConfigV1({ schemaVersion: 1, extra: true })).toThrow(
      RoomParticipantsConfigurationError,
    );
  });

  it("rejects a relative codex executable path", () => {
    expect(() =>
      parseRoomParticipantsConfigV1({
        schemaVersion: 1,
        codex: {
          executable: "codex",
          model: "gpt-test",
          codexHome: "/tmp/codex-home",
          runnerRoot: "/tmp/codex-runner",
          scratchRoot: "/tmp/codex-scratch",
        },
      }),
    ).toThrow(RoomParticipantsConfigurationError);
  });

  it("parses a full config with all three providers and a roster", () => {
    const config = parseRoomParticipantsConfigV1({
      schemaVersion: 1,
      codex: {
        executable: "/usr/bin/true",
        model: "gpt-test",
        codexHome: "/tmp/codex-home",
        runnerRoot: "/tmp/codex-runner",
        scratchRoot: "/tmp/codex-scratch",
      },
      claude: { executable: "/usr/bin/true", model: "sonnet" },
      ollama: { baseUrl: "http://127.0.0.1:11434", model: "qwen2.5-coder:14b" },
      roster: {
        schemaVersion: 1,
        rooms: [
          {
            roomId: "e0000000-0000-4000-8000-000000000001",
            kind: "research",
            participants: [{ persona: "codex-planner", oneLineCharter: "Plans the work." }],
          },
        ],
      },
    });
    expect(config.codex?.model).toBe("gpt-test");
    expect(config.claude?.model).toBe("sonnet");
    expect(config.ollama?.model).toBe("qwen2.5-coder:14b");
    expect(config.roster?.rooms).toHaveLength(1);
  });
});

describe("buildRoomSubsystemConfiguration", () => {
  it("builds a working scorer/contributor/revalidator/quotaFactory from a codex+ollama config", async () => {
    const directory = await root();
    const codexHome = join(directory, "codex-home");
    await mkdir(codexHome, { mode: 0o700 });
    const ports = buildRoomSubsystemConfiguration({
      schemaVersion: 1,
      codex: {
        executable: "/usr/bin/true",
        model: "gpt-test",
        codexHome,
        runnerRoot: join(directory, "codex-runner"),
        scratchRoot: join(directory, "codex-scratch"),
      },
      ollama: { baseUrl: "http://127.0.0.1:19999" },
    });
    expect(ports.scorer).toBeDefined();
    expect(ports.contributor).toBeDefined();
    expect(ports.revalidator).toBeDefined();
    expect(ports.quotaFactory).toBeDefined();

    // The contributor should fail closed (not throw) for a provider with no
    // registered adapter (here, "claude" was never configured).
    const result = await ports.contributor?.contribute({
      room: {
        schemaVersion: 1,
        roomId: "e0000000-0000-4000-8000-000000000002",
        title: "Test room",
        projectId: null,
        createdAt: "2026-08-16T10:00:00.000Z",
        updatedAt: "2026-08-16T10:00:00.000Z",
        unattendedEnabled: false,
        headSequence: 0,
        headMessageId: null,
        lastHumanAt: null,
        humanTypingUntil: null,
        roundCounter: 0,
        activeGrantId: null,
        pendingTrigger: null,
        agentCooldownEvents: 2,
        participants: [
          {
            persona: "claude-critic",
            provider: "claude",
            displayName: "Claude Critic",
            position: 0,
            benchedUntil: null,
            benchReason: null,
          },
        ],
        budget: {
          dayKey: "2026-08-16",
          dailyCeilingTokens: 10_000,
          unattendedDailyCeilingTokens: 2_000,
          maxTokensPerReply: 1_000,
          spentTokens: 0,
          reservedTokens: 0,
          unattendedSpentTokens: 0,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      grant: {
        schemaVersion: 1,
        grantId: "e0000000-0000-4000-9000-000000000001",
        roomId: "e0000000-0000-4000-8000-000000000002",
        roundNumber: 1,
        persona: "claude-critic",
        headSequence: 0,
        state: "active",
        ownerPid: 1,
        workerPid: null,
        reservedTokens: 1_000,
        leaseExpiresAt: "2026-08-16T10:02:00.000Z",
        createdAt: "2026-08-16T10:00:00.000Z",
        updatedAt: "2026-08-16T10:00:00.000Z",
        outcome: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      participant: { persona: "claude-critic", provider: "claude" } as any,
      transcript: [],
      maxTokens: 100,
      signal: new AbortController().signal,
      reportWorkerPid: () => undefined,
    });
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });
});

describe("buildPhaseParticipantsPortV1 (Seam (b): phase.run's composed roster)", () => {
  it("resolves a configured provider's adapter and null for an unconfigured one", async () => {
    const directory = await root();
    const codexHome = join(directory, "codex-home");
    await mkdir(codexHome, { mode: 0o700 });
    const port = buildPhaseParticipantsPortV1({
      schemaVersion: 1,
      codex: {
        executable: "/usr/bin/true",
        model: "gpt-test",
        codexHome,
        runnerRoot: join(directory, "codex-runner"),
        scratchRoot: join(directory, "codex-scratch"),
      },
      claude: { executable: "/usr/bin/true", model: "sonnet" },
    });

    const codexAdapter = port.resolve("codex" as never);
    expect(codexAdapter).not.toBeNull();
    expect(codexAdapter?.provider).toBe("codex");

    const claudeAdapter = port.resolve("claude" as never);
    expect(claudeAdapter).not.toBeNull();
    expect(claudeAdapter?.provider).toBe("claude");

    // "ollama" was never configured on this port -- resolves closed (null), never a fabricated
    // adapter, exactly like a room roster naming an unconfigured provider only fails that
    // provider's own turns.
    expect(port.resolve("ollama" as never)).toBeNull();
  });

  it("resolves nothing at all from an empty participants config", () => {
    const port = buildPhaseParticipantsPortV1({ schemaVersion: 1 });
    expect(port.resolve("codex" as never)).toBeNull();
    expect(port.resolve("claude" as never)).toBeNull();
    expect(port.resolve("ollama" as never)).toBeNull();
  });

  it("builds the ollama adapter without contacting a real server (construction only)", () => {
    const port = buildPhaseParticipantsPortV1({
      schemaVersion: 1,
      ollama: { baseUrl: "http://127.0.0.1:19999", model: "qwen2.5-coder:14b" },
    });
    const adapter = port.resolve("ollama" as never);
    expect(adapter).not.toBeNull();
    expect(adapter?.provider).toBe("ollama");
  });
});

describe("daemon-entrypoint rooms wiring reuses the containment attestation gate", () => {
  async function baseEnvironment(directory: string): Promise<DaemonProcessEnvironment> {
    const authFile = join(directory, "authorization");
    await writeFile(authFile, TOKEN, { mode: 0o600 });
    return {
      APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
      APP_FACTORY_AUTH_FILE: authFile,
      APP_FACTORY_DAEMON_VERSION: "0.6.0-rooms-gate",
    };
  }

  it("leaves rooms undefined when APP_FACTORY_ROOMS_ENABLED is unset", async () => {
    const directory = await root();
    const configuration = await loadDaemonProcessConfiguration(await baseEnvironment(directory));
    expect(configuration.rooms).toBeUndefined();
  });

  it("refuses to enable rooms without a containment attestation, exactly like the coding-agent profile", async () => {
    const directory = await root();
    const codexHome = join(directory, "codex-home");
    await mkdir(codexHome, { mode: 0o700 });
    const participantsConfig = join(directory, "room-participants.json");
    await writeFile(
      participantsConfig,
      JSON.stringify({
        schemaVersion: 1,
        ollama: { baseUrl: "http://127.0.0.1:19999" },
      }),
      { mode: 0o600 },
    );
    await expect(
      loadDaemonProcessConfiguration({
        ...(await baseEnvironment(directory)),
        APP_FACTORY_ROOMS_ENABLED: "true",
        APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG: participantsConfig,
      }),
    ).rejects.toThrow(/containment attestation/);
  });

  it("enables rooms once a valid attestation and participants config are present", async () => {
    const directory = await root();
    const attestationFile = join(directory, "containment-attestation.json");
    await writeFile(attestationFile, JSON.stringify(VALID_ATTESTATION), { mode: 0o600 });
    const participantsConfig = join(directory, "room-participants.json");
    await writeFile(
      participantsConfig,
      JSON.stringify({ schemaVersion: 1, ollama: { baseUrl: "http://127.0.0.1:19999" } }),
      { mode: 0o600 },
    );
    const configuration = await loadDaemonProcessConfiguration({
      ...(await baseEnvironment(directory)),
      APP_FACTORY_ROOMS_ENABLED: "true",
      APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG: participantsConfig,
      APP_FACTORY_CONTAINMENT_ATTESTATION: attestationFile,
    });
    expect(configuration.rooms?.enabled).toBe(true);
    expect(configuration.rooms?.scorer).toBeDefined();
    expect(configuration.rooms?.contributor).toBeDefined();
    expect(configuration.rooms?.revalidator).toBeDefined();
  });
});
