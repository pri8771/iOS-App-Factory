import { describe, expect, it } from "vitest";

import { parseRoomContribution } from "../src/index.js";

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
});
