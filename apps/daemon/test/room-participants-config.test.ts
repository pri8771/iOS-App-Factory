import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadDaemonProcessConfiguration,
  type DaemonProcessEnvironment,
} from "../src/daemon-entrypoint.js";
import {
  buildPhaseParticipantsPortV1,
  buildProviderCatalogPortV1,
  buildRoomParticipantsCatalogSourceV1,
  buildRoomSubsystemConfiguration,
  createPhaseParticipantsHandleV1,
  parseRoomParticipantsConfigV1,
  RoomParticipantsConfigurationError,
  type RoomOllamaParticipantConfigV1,
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

  it("rejects a relative gemini executable path", () => {
    expect(() =>
      parseRoomParticipantsConfigV1({
        schemaVersion: 1,
        gemini: { executable: "gemini", model: "gemini-2.5-flash" },
      }),
    ).toThrow(RoomParticipantsConfigurationError);
  });

  it("rejects an unsupported field inside a gemini participant block", () => {
    expect(() =>
      parseRoomParticipantsConfigV1({
        schemaVersion: 1,
        gemini: { executable: "/usr/bin/true", model: "gemini-2.5-flash", apiKey: "sk-nope" },
      }),
    ).toThrow(RoomParticipantsConfigurationError);
  });

  it("parses a gemini participant block, including an optional displayName", () => {
    const config = parseRoomParticipantsConfigV1({
      schemaVersion: 1,
      gemini: {
        executable: "/usr/bin/true",
        model: "gemini-2.5-flash",
        displayName: "Gemini (fast)",
      },
    });
    expect(config.gemini).toEqual({
      executable: "/usr/bin/true",
      model: "gemini-2.5-flash",
      displayName: "Gemini (fast)",
    });
  });

  it("parses a full config with all four providers and a roster", () => {
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
      gemini: { executable: "/usr/bin/true", model: "gemini-2.5-flash" },
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
    expect(config.gemini?.model).toBe("gemini-2.5-flash");
    expect((config.ollama as RoomOllamaParticipantConfigV1 | undefined)?.model).toBe(
      "qwen2.5-coder:14b",
    );
    expect(config.roster?.rooms).toHaveLength(1);
  });
});

describe("parseRoomParticipantsConfigV1 -- ollama multi-instance + scorer selection", () => {
  it("parses the legacy singular object form, including a per-instance maxOutputTokens", () => {
    const config = parseRoomParticipantsConfigV1({
      schemaVersion: 1,
      ollama: { baseUrl: "http://127.0.0.1:11434", maxOutputTokens: 500 },
    });
    expect(config.ollama).toEqual({ baseUrl: "http://127.0.0.1:11434", maxOutputTokens: 500 });
  });

  it("parses an array of named ollama instances with unique ids", () => {
    const config = parseRoomParticipantsConfigV1({
      schemaVersion: 1,
      ollama: [
        { id: "fast", model: "qwen2.5-coder:7b" },
        { id: "reasoning", model: "qwen2.5-coder:32b", maxOutputTokens: 2_000 },
      ],
    });
    expect(config.ollama).toEqual([
      { id: "fast", model: "qwen2.5-coder:7b" },
      { id: "reasoning", model: "qwen2.5-coder:32b", maxOutputTokens: 2_000 },
    ]);
  });

  it("rejects an empty ollama array", () => {
    expect(() => parseRoomParticipantsConfigV1({ schemaVersion: 1, ollama: [] })).toThrow(
      RoomParticipantsConfigurationError,
    );
  });

  it("rejects a duplicate ollama instance id", () => {
    expect(() =>
      parseRoomParticipantsConfigV1({
        schemaVersion: 1,
        ollama: [{ id: "fast" }, { id: "fast" }],
      }),
    ).toThrow(RoomParticipantsConfigurationError);
  });

  it("rejects an ollama instance id that is not a lowercase slug", () => {
    expect(() =>
      parseRoomParticipantsConfigV1({ schemaVersion: 1, ollama: [{ id: "Not_Valid" }] }),
    ).toThrow(RoomParticipantsConfigurationError);
  });

  it("accepts an explicit scorer.ollama selecting one array instance", () => {
    const config = parseRoomParticipantsConfigV1({
      schemaVersion: 1,
      ollama: [{ id: "fast" }, { id: "reasoning" }],
      scorer: { ollama: "reasoning" },
    });
    expect(config.scorer).toEqual({ ollama: "reasoning" });
  });

  it("accepts an explicit scorer.ollama of 'legacy' selecting the singular object form", () => {
    const config = parseRoomParticipantsConfigV1({
      schemaVersion: 1,
      ollama: { model: "qwen2.5-coder:14b" },
      scorer: { ollama: "legacy" },
    });
    expect(config.scorer).toEqual({ ollama: "legacy" });
  });

  it("rejects a scorer.ollama that does not match any configured ollama instance", () => {
    expect(() =>
      parseRoomParticipantsConfigV1({
        schemaVersion: 1,
        ollama: [{ id: "fast" }],
        scorer: { ollama: "nope" },
      }),
    ).toThrow(RoomParticipantsConfigurationError);
  });

  it("rejects a scorer block when no ollama instance is configured at all", () => {
    expect(() =>
      parseRoomParticipantsConfigV1({ schemaVersion: 1, scorer: { ollama: "legacy" } }),
    ).toThrow(RoomParticipantsConfigurationError);
  });

  it("accepts a per-instance maxOutputTokens on an openrouter entry", () => {
    const config = parseRoomParticipantsConfigV1({
      schemaVersion: 1,
      openrouter: [
        {
          id: "fast",
          model: "anthropic/claude-3.5-sonnet",
          credentialReference: {
            schemaVersion: 1,
            kind: "macos-keychain",
            service: "app-factory-openrouter",
            account: "fast",
          },
          maxOutputTokens: 800,
        },
      ],
    });
    expect(config.openrouter?.[0]?.maxOutputTokens).toBe(800);
  });
});

describe("buildRoomSubsystemConfiguration / buildPhaseParticipantsPortV1 -- ollama multi-instance", () => {
  it("registers each array instance under its own ollama-<id> provider key", () => {
    const port = buildPhaseParticipantsPortV1({
      schemaVersion: 1,
      ollama: [
        { id: "fast", baseUrl: "http://127.0.0.1:19999" },
        { id: "reasoning", baseUrl: "http://127.0.0.1:19998" },
      ],
    });
    const fast = port.resolve("ollama-fast" as never);
    const reasoning = port.resolve("ollama-reasoning" as never);
    expect(fast).not.toBeNull();
    expect(fast?.provider).toBe("ollama-fast");
    expect(reasoning).not.toBeNull();
    expect(reasoning?.provider).toBe("ollama-reasoning");
    // The bare legacy key is not registered when only the array form is configured.
    expect(port.resolve("ollama" as never)).toBeNull();
  });

  it("still registers the bare 'ollama' key for the legacy singular object form", () => {
    const port = buildPhaseParticipantsPortV1({
      schemaVersion: 1,
      ollama: { baseUrl: "http://127.0.0.1:19999" },
    });
    expect(port.resolve("ollama" as never)?.provider).toBe("ollama");
    expect(port.resolve("ollama-fast" as never)).toBeNull();
  });

  it("builds a working scorer from an array config honoring an explicit scorer.ollama selection", () => {
    const ports = buildRoomSubsystemConfiguration({
      schemaVersion: 1,
      ollama: [
        { id: "fast", baseUrl: "http://127.0.0.1:19999" },
        { id: "reasoning", baseUrl: "http://127.0.0.1:19998" },
      ],
      scorer: { ollama: "reasoning" },
    });
    expect(ports.scorer).toBeDefined();
    expect(ports.contributor).toBeDefined();
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

describe("buildRoomParticipantsCatalogSourceV1 (room.participants.list)", () => {
  const FULL_CONFIG = parseRoomParticipantsConfigV1({
    schemaVersion: 1,
    codex: {
      executable: "/usr/bin/true",
      executableDigest: "sha256:abc",
      expectedCliVersion: "0.42.0",
      model: "gpt-test",
      codexHome: "/tmp/codex-home",
      runnerRoot: "/tmp/codex-runner",
      scratchRoot: "/tmp/codex-scratch",
    },
    claude: { executable: "/usr/bin/true", model: "sonnet" },
    gemini: { executable: "/usr/bin/true", model: "gemini-2.5-flash" },
    ollama: { baseUrl: "http://127.0.0.1:11434", timeoutMs: 120_000 },
    roster: {
      schemaVersion: 1,
      rooms: [
        {
          roomId: "e0000000-0000-4000-8000-000000000001",
          kind: "research",
          charter: "Plans the launch.",
          participants: [{ persona: "codex-planner", oneLineCharter: "Plans the work." }],
        },
        { roomId: "lounge", kind: "project" },
      ],
    },
  });

  it("projects providers by key/model/pinned CLI version and the roster verbatim", () => {
    const source = buildRoomParticipantsCatalogSourceV1(FULL_CONFIG);
    expect(source.providers).toEqual([
      { provider: "codex", roomProviderKey: "codex", model: "gpt-test", cliVersion: "0.42.0" },
      { provider: "claude", roomProviderKey: "claude", model: "sonnet", cliVersion: null },
      {
        provider: "gemini",
        roomProviderKey: "gemini",
        model: "gemini-2.5-flash",
        cliVersion: null,
      },
      // Ollama's model was left unset in the config; the catalog reports the effective default
      // the adapter actually speaks, never an "unknown". The legacy singular form's
      // `roomProviderKey` is the bare "ollama" (Architecture decision 9).
      {
        provider: "ollama",
        roomProviderKey: "ollama",
        model: expect.stringMatching(/^.+$/) as string,
        cliVersion: null,
      },
    ]);
    expect(source.roster).toEqual([
      {
        roomId: "e0000000-0000-4000-8000-000000000001",
        kind: "research",
        charter: "Plans the launch.",
        participants: [{ persona: "codex-planner", oneLineCharter: "Plans the work." }],
      },
      { roomId: "lounge", kind: "project", charter: null, participants: [] },
    ]);
  });

  it("never leaks executables, paths, digests, base URLs, or timeouts onto the wire", () => {
    const text = JSON.stringify(buildRoomParticipantsCatalogSourceV1(FULL_CONFIG));
    for (const secret of [
      "/usr/bin/true",
      "sha256:abc",
      "/tmp/codex-home",
      "/tmp/codex-runner",
      "/tmp/codex-scratch",
      "127.0.0.1",
      "11434",
      "120000",
      "executable",
      "baseUrl",
      "codexHome",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("projects an empty config as no providers and no roster", () => {
    expect(buildRoomParticipantsCatalogSourceV1({ schemaVersion: 1 })).toEqual({
      providers: [],
      roster: [],
    });
  });

  it("is carried by buildRoomSubsystemConfiguration so the composed moderator can serve it", () => {
    const ports = buildRoomSubsystemConfiguration({
      schemaVersion: 1,
      ollama: { baseUrl: "http://127.0.0.1:19999", model: "qwen2.5-coder:14b" },
    });
    expect(ports.participantsCatalog).toEqual({
      providers: [
        {
          provider: "ollama",
          roomProviderKey: "ollama",
          model: "qwen2.5-coder:14b",
          cliVersion: null,
        },
      ],
      roster: [],
    });
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
      gemini: { executable: "/usr/bin/true", model: "gemini-2.5-flash" },
    });

    const codexAdapter = port.resolve("codex" as never);
    expect(codexAdapter).not.toBeNull();
    expect(codexAdapter?.provider).toBe("codex");

    const claudeAdapter = port.resolve("claude" as never);
    expect(claudeAdapter).not.toBeNull();
    expect(claudeAdapter?.provider).toBe("claude");

    const geminiAdapter = port.resolve("gemini" as never);
    expect(geminiAdapter).not.toBeNull();
    expect(geminiAdapter?.provider).toBe("gemini");

    // "ollama" was never configured on this port -- resolves closed (null), never a fabricated
    // adapter, exactly like a room roster naming an unconfigured provider only fails that
    // provider's own turns.
    expect(port.resolve("ollama" as never)).toBeNull();
  });

  it("resolves nothing at all from an empty participants config", () => {
    const port = buildPhaseParticipantsPortV1({ schemaVersion: 1 });
    expect(port.resolve("codex" as never)).toBeNull();
    expect(port.resolve("claude" as never)).toBeNull();
    expect(port.resolve("gemini" as never)).toBeNull();
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

describe("createPhaseParticipantsHandleV1 (Gap 2: phase.run/signal-scout hot-swap)", () => {
  it("resolves through whichever pool was most recently reloaded, and fails closed for a provider dropped from it", () => {
    const before = {
      schemaVersion: 1 as const,
      ollama: { model: "qwen2.5:3b" },
    };
    const after = {
      schemaVersion: 1 as const,
      ollama: { model: "qwen2.5:3b" },
      claude: { executable: "/usr/bin/true", model: "sonnet" },
    };
    const handle = createPhaseParticipantsHandleV1({
      phaseParticipants: buildPhaseParticipantsPortV1(before),
      providerCatalog: buildProviderCatalogPortV1(before),
    });

    // Seeded from `before`: ollama resolves, claude does not.
    expect(handle.port.resolve("ollama" as never)).not.toBeNull();
    expect(handle.port.resolve("claude" as never)).toBeNull();
    expect(handle.providerCatalog.resolve("ollama" as never)).toEqual({
      family: "ollama",
      model: "qwen2.5:3b",
    });
    expect(() => handle.providerCatalog.resolve("claude" as never)).toThrow();

    // `port`/`providerCatalog` are the SAME stable objects before and after reload -- a caller that
    // captured them once (exactly like `factory-daemon-service.ts`'s `openDaemonCommandRuntime`
    // options) never needs to re-fetch anything.
    const { port, providerCatalog } = handle;

    handle.reload({
      phaseParticipants: buildPhaseParticipantsPortV1(after),
      providerCatalog: buildProviderCatalogPortV1(after),
    });

    // Reloaded: claude now resolves too, through the exact same object references.
    expect(port).toBe(handle.port);
    expect(providerCatalog).toBe(handle.providerCatalog);
    expect(port.resolve("claude" as never)).not.toBeNull();
    expect(providerCatalog.resolve("claude" as never)).toEqual({
      family: "claude",
      model: "sonnet",
    });

    // A provider REMOVED by the next reload fails the NEXT resolution closed -- the existing
    // null/throw paths, never a special case.
    handle.reload({
      phaseParticipants: buildPhaseParticipantsPortV1(before),
      providerCatalog: buildProviderCatalogPortV1(before),
    });
    expect(port.resolve("claude" as never)).toBeNull();
    expect(() => providerCatalog.resolve("claude" as never)).toThrow();
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

  // Architecture decision 3: a missing containment attestation no longer kills rooms-enabled
  // startup -- the daemon starts with the configured file's catalog visible (so `provider.list`/
  // `room.participants.list` are honest about what is configured) but with no adapters activated
  // (`provider.health` reports each instance "blocked"; see `provider-command-runtime.test.ts`).
  it("starts rooms without a containment attestation, but activates no adapters", async () => {
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
    const configuration = await loadDaemonProcessConfiguration({
      ...(await baseEnvironment(directory)),
      APP_FACTORY_ROOMS_ENABLED: "true",
      APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG: participantsConfig,
      // No APP_FACTORY_CONTAINMENT_ATTESTATION set.
    });
    expect(configuration.rooms?.enabled).toBe(true);
    expect(configuration.rooms?.scorer).toBeDefined();
    expect(configuration.rooms?.contributor).toBeDefined();
    expect(configuration.rooms?.revalidator).toBeDefined();
    expect(configuration.rooms?.providerCatalog).toBeDefined();
    // The file's configured providers still surface honestly, even though not-attested means no
    // adapter was activated for any of them.
    expect(configuration.rooms?.participantsCatalog).toEqual({
      providers: [
        {
          provider: "ollama",
          roomProviderKey: "ollama",
          model: expect.stringMatching(/^.+$/) as string,
          cliVersion: null,
        },
      ],
      roster: [],
    });
    expect(configuration.providerRegistry).toEqual({ configPath: participantsConfig });
  });

  // Architecture decision 3: a missing participants config file (nothing has ever been
  // `provider.upsert`ed) also no longer kills rooms-enabled startup -- the daemon starts with an
  // empty registry, ready for the first `provider.upsert` to populate.
  it("starts rooms with an empty registry when no participants config file exists yet", async () => {
    const directory = await root();
    const attestationFile = join(directory, "containment-attestation.json");
    await writeFile(attestationFile, JSON.stringify(VALID_ATTESTATION), { mode: 0o600 });
    const participantsConfig = join(directory, "room-participants.json");
    const configuration = await loadDaemonProcessConfiguration({
      ...(await baseEnvironment(directory)),
      APP_FACTORY_ROOMS_ENABLED: "true",
      APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG: participantsConfig,
      APP_FACTORY_CONTAINMENT_ATTESTATION: attestationFile,
    });
    expect(configuration.rooms?.enabled).toBe(true);
    expect(configuration.rooms?.participantsCatalog).toEqual({ providers: [], roster: [] });
    expect(configuration.providerRegistry).toEqual({
      configPath: participantsConfig,
      containmentAttestationPath: attestationFile,
    });
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
