import { RoomPersonaSchema } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import { parseMentions } from "../src/index.js";

const PARTICIPANTS = ["architect", "critic", "planner"].map((persona) =>
  RoomPersonaSchema.parse(persona),
);

describe("parseMentions", () => {
  it("returns known personas in first-mention order without duplicates", () => {
    expect(parseMentions("@critic then @architect, and @critic again", PARTICIPANTS)).toEqual([
      "critic",
      "architect",
    ]);
  });

  it("ignores unknown handles, e-mail addresses, and mid-word at-signs", () => {
    expect(
      parseMentions("mail me at ops@critic.example or ping @nobody; x@planner", PARTICIPANTS),
    ).toEqual([]);
    expect(parseMentions("@planner-x is not @planner? actually @planner.", PARTICIPANTS)).toEqual([
      "planner",
    ]);
  });

  it("matches at line starts and after punctuation", () => {
    expect(parseMentions("@architect\n(@critic)", PARTICIPANTS)).toEqual(["architect", "critic"]);
  });
});
