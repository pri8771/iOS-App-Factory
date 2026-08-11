import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  JSON_SCHEMA_DRAFT_2020_12,
  contractSchemaCatalogV1,
  generateContractJsonSchemasV1,
} from "../src/index.js";

const schemaDirectory = new URL("../schemas/v1/", import.meta.url);

describe("portable contract schemas", () => {
  it("generates every catalog entry deterministically", () => {
    const first = generateContractJsonSchemasV1();
    const second = generateContractJsonSchemasV1();

    expect(first).toEqual(second);
    expect(first.map((entry) => entry.name)).toEqual(
      contractSchemaCatalogV1.map((entry) => entry.name),
    );

    for (const generated of first) {
      expect(generated.document.$schema).toBe(JSON_SCHEMA_DRAFT_2020_12);
      expect(generated.document.$id).toBe(generated.id);
      expect(generated.contents.endsWith("\n")).toBe(true);
    }
  });

  it("matches the checked-in JSON Schema byte for byte", async () => {
    const generated = generateContractJsonSchemasV1();
    const expectedNames = generated.map((entry) => entry.fileName).sort();
    const actualNames = (await readdir(schemaDirectory))
      .filter((name) => name.endsWith(".json"))
      .sort();

    expect(actualNames).toEqual(expectedNames);

    for (const schema of generated) {
      const checkedIn = await readFile(new URL(schema.fileName, schemaDirectory), "utf8");
      expect(checkedIn, schema.fileName).toBe(schema.contents);
    }
  });
});
