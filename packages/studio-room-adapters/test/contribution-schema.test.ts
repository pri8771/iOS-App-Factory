import { MAX_ROOM_MESSAGE_BODY_LENGTH_V1 } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import {
  parseRoomContribution,
  ROOM_CONTRIBUTION_JSON_SCHEMA_V1,
  ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1,
} from "../src/index.js";

describe("parseRoomContribution", () => {
  it("parses a message with schemaVersion present", () => {
    expect(parseRoomContribution({ schemaVersion: 1, kind: "message", text: "hi" })).toEqual({
      kind: "message",
      text: "hi",
    });
  });

  it("parses a message with schemaVersion omitted (observed live Claude CLI behavior)", () => {
    expect(parseRoomContribution({ kind: "message", text: "hi" })).toEqual({
      kind: "message",
      text: "hi",
    });
  });

  it("parses a pass with schemaVersion omitted", () => {
    expect(parseRoomContribution({ kind: "pass", text: null })).toEqual({ kind: "pass" });
  });

  it("rejects a present but wrong schemaVersion", () => {
    expect(() => parseRoomContribution({ schemaVersion: 2, kind: "message", text: "hi" })).toThrow(
      TypeError,
    );
  });

  it("rejects an unexpected extra field even without schemaVersion", () => {
    expect(() => parseRoomContribution({ kind: "message", text: "hi", extra: true })).toThrow(
      TypeError,
    );
  });

  it("still requires kind and text", () => {
    expect(() => parseRoomContribution({ kind: "message" })).toThrow(TypeError);
    expect(() => parseRoomContribution({ text: "hi" })).toThrow(TypeError);
  });

  it("parses a raw JSON string form", () => {
    expect(parseRoomContribution('{"kind":"pass","text":null}')).toEqual({ kind: "pass" });
  });

  it("rejects invalid JSON strings", () => {
    expect(() => parseRoomContribution("not json")).toThrow(TypeError);
  });

  it("rejects text past MAX_ROOM_MESSAGE_BODY_LENGTH_V1 even though the Ollama wire schema no longer bounds it", () => {
    const tooLong = "a".repeat(MAX_ROOM_MESSAGE_BODY_LENGTH_V1 + 1);
    expect(() => parseRoomContribution({ kind: "message", text: tooLong })).toThrow(TypeError);
  });

  it("accepts text exactly at MAX_ROOM_MESSAGE_BODY_LENGTH_V1", () => {
    const atLimit = "a".repeat(MAX_ROOM_MESSAGE_BODY_LENGTH_V1);
    expect(parseRoomContribution({ kind: "message", text: atLimit })).toEqual({
      kind: "message",
      text: atLimit,
    });
  });
});

/**
 * Regression coverage for the live finding against local Ollama 0.21.0: a
 * `POST /api/generate` whose `format` carries a string `maxLength` above
 * ~2,000 fails every locally available model with HTTP 500 "failed to load
 * model vocabulary required for format", verified by bisection (2,000 ok,
 * 2,001 fails) independent of which model was loaded. Mirrors the
 * lookaround/`uniqueItems` wire-schema guards in
 * `packages/agent-runner/test/codex.test.ts`.
 */
describe("ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1", () => {
  function collectKeys(node: unknown, found: Set<string>): void {
    if (Array.isArray(node)) {
      for (const entry of node) collectKeys(entry, found);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      collectKeys(value, found);
    }
  }

  it("never carries maxLength anywhere in the wire schema", () => {
    const keys = new Set<string>();
    collectKeys(ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1, keys);
    expect(keys.has("maxLength")).toBe(false);
  });

  it("still requires the same object shape as the shared contract", () => {
    expect(ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1.required).toEqual(
      ROOM_CONTRIBUTION_JSON_SCHEMA_V1.required,
    );
    expect(ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1.additionalProperties).toBe(false);
    expect(ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1.properties.kind).toEqual(
      ROOM_CONTRIBUTION_JSON_SCHEMA_V1.properties.kind,
    );
    expect(ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1.properties.schemaVersion).toEqual(
      ROOM_CONTRIBUTION_JSON_SCHEMA_V1.properties.schemaVersion,
    );
  });

  it("keeps the Codex/Claude wire schema's maxLength intact (only Ollama's is loosened)", () => {
    expect(ROOM_CONTRIBUTION_JSON_SCHEMA_V1.properties.text).toMatchObject({
      maxLength: MAX_ROOM_MESSAGE_BODY_LENGTH_V1,
    });
  });
});
