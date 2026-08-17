import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  COMMAND_OPERATIONS_V1,
  CommandRequestV1Schema,
  CommandResultV1Schema,
  RoomParticipantsCatalogV1Schema,
  canonicalRoomParticipantsCatalogDigestInputV1,
  roomParticipantsCatalogDigestInputV1,
  type RoomParticipantsCatalogDigestInputV1,
} from "../src/index.js";

const SOURCED_AT = "2026-08-17T09:00:00.000Z";

function digestOf(input: RoomParticipantsCatalogDigestInputV1): string {
  return `sha256:${createHash("sha256")
    .update(canonicalRoomParticipantsCatalogDigestInputV1(input), "utf8")
    .digest("hex")}`;
}

const CODEX_PROVIDER = { provider: "codex", model: "gpt-5-codex", cliVersion: "0.42.0" } as const;

function enabledInput(): RoomParticipantsCatalogDigestInputV1 {
  return {
    schemaVersion: 1,
    enabled: true,
    unavailableReason: null,
    providers: [
      CODEX_PROVIDER,
      { provider: "claude", model: "claude-sonnet-4-5", cliVersion: null },
      { provider: "ollama", model: "qwen2.5-coder:14b", cliVersion: null },
    ],
    roster: [
      {
        roomId: "50000001-0000-4000-8000-000000000001",
        kind: "research",
        charter: "Design review for the Studio launch.",
        participants: [
          { persona: "architect", oneLineCharter: "Owns structure and trade-offs." },
          { persona: "critic", oneLineCharter: "Finds what the plan misses." },
        ],
      },
      { roomId: "lounge", kind: "project", charter: null, participants: [] },
    ],
  };
}

function disabledInput(): RoomParticipantsCatalogDigestInputV1 {
  return {
    schemaVersion: 1,
    enabled: false,
    unavailableReason: "rooms subsystem disabled (APP_FACTORY_ROOMS_ENABLED unset)",
    providers: [],
    roster: [],
  };
}

describe("room participants catalog V1", () => {
  it("is a read-only operation in the catalog with an empty payload and a nested catalog result", () => {
    expect(COMMAND_OPERATIONS_V1).toContain("room.participants.list");
    expect(
      CommandRequestV1Schema.safeParse({
        schemaVersion: 1,
        commandId: "1e5f0d0e-2b1a-4c3d-8e9f-000000000001",
        issuedAt: SOURCED_AT,
        origin: "cli",
        operation: "room.participants.list",
        payload: {},
      }).success,
    ).toBe(true);
    expect(
      CommandRequestV1Schema.safeParse({
        schemaVersion: 1,
        commandId: "1e5f0d0e-2b1a-4c3d-8e9f-000000000001",
        issuedAt: SOURCED_AT,
        origin: "cli",
        operation: "room.participants.list",
        payload: { limit: 1 },
      }).success,
    ).toBe(false);
    const input = enabledInput();
    expect(
      CommandResultV1Schema.safeParse({
        operation: "room.participants.list",
        catalog: { ...input, sourcedAt: SOURCED_AT, sourceDigest: digestOf(input) },
      }).success,
    ).toBe(true);
  });

  it("computes one deterministic digest over everything except sourcedAt and the digest itself", () => {
    const input = enabledInput();
    const catalog = RoomParticipantsCatalogV1Schema.parse({
      ...input,
      sourcedAt: SOURCED_AT,
      sourceDigest: digestOf(input),
    });
    expect(roomParticipantsCatalogDigestInputV1(catalog)).not.toHaveProperty("sourcedAt");
    expect(roomParticipantsCatalogDigestInputV1(catalog)).not.toHaveProperty("sourceDigest");
    expect(canonicalRoomParticipantsCatalogDigestInputV1(catalog)).toBe(
      canonicalRoomParticipantsCatalogDigestInputV1(structuredClone(input)),
    );
    // A different sourcedAt does not move the digest; a different model does.
    expect(digestOf({ ...catalog, sourcedAt: "2026-08-18T09:00:00.000Z" })).toBe(
      catalog.sourceDigest,
    );
    const mutated = {
      ...input,
      providers: [{ ...CODEX_PROVIDER, model: "gpt-5-codex-mini" }, ...input.providers.slice(1)],
    };
    expect(digestOf(mutated)).not.toBe(catalog.sourceDigest);
  });

  it("answers honestly when disabled: a reason, no providers, no roster", () => {
    const input = disabledInput();
    expect(
      RoomParticipantsCatalogV1Schema.safeParse({
        ...input,
        sourcedAt: SOURCED_AT,
        sourceDigest: digestOf(input),
      }).success,
    ).toBe(true);
    // Disabled without a reason, enabled with a reason, or disabled with providers all fail closed.
    for (const broken of [
      { ...input, unavailableReason: null },
      { ...enabledInput(), unavailableReason: "but why" },
      { ...input, providers: enabledInput().providers },
    ]) {
      expect(
        RoomParticipantsCatalogV1Schema.safeParse({
          ...broken,
          sourcedAt: SOURCED_AT,
          sourceDigest: digestOf(broken),
        }).success,
      ).toBe(false);
    }
  });

  it("never carries daemon-local secrets, paths, or duplicate providers", () => {
    const input = enabledInput();
    for (const leak of [
      { executable: "/usr/local/bin/codex" },
      { codexHome: "/Users/operator/.codex" },
      { baseUrl: "http://127.0.0.1:11434" },
      { executableDigest: "sha256:00" },
      { runnerRoot: "/tmp/runner" },
    ]) {
      const providers = [{ ...CODEX_PROVIDER, ...leak }, ...input.providers.slice(1)];
      expect(
        RoomParticipantsCatalogV1Schema.safeParse({
          ...input,
          providers,
          sourcedAt: SOURCED_AT,
          sourceDigest: `sha256:${"0".repeat(64)}`,
        }).success,
      ).toBe(false);
    }
    const duplicated = {
      ...input,
      providers: [CODEX_PROVIDER, CODEX_PROVIDER],
    };
    expect(
      RoomParticipantsCatalogV1Schema.safeParse({
        ...duplicated,
        sourcedAt: SOURCED_AT,
        sourceDigest: digestOf(duplicated),
      }).success,
    ).toBe(false);
  });
});
