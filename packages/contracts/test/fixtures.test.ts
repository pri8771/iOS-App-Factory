import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { contractSchemaCatalogV1, generateContractJsonSchemasV1 } from "../src/index.js";
import { loadContractFixtures } from "./fixture-loader.js";

const runtimeSchemas = new Map(contractSchemaCatalogV1.map((entry) => [entry.name, entry.schema]));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const portableValidators = new Map(
  generateContractJsonSchemasV1().map((generated) => [
    generated.name,
    ajv.compile(generated.document),
  ]),
);

function getValidators(name: string) {
  const runtimeSchema = runtimeSchemas.get(name);
  const portableValidator = portableValidators.get(name);
  if (runtimeSchema === undefined || portableValidator === undefined) {
    throw new Error(`Unknown fixture schema: ${name}`);
  }
  return { runtimeSchema, portableValidator };
}

describe("checked-in contract fixtures", () => {
  it("accepts every valid fixture in both Zod and JSON Schema", async () => {
    for (const fixture of await loadContractFixtures("valid/contracts.json")) {
      const { runtimeSchema, portableValidator } = getValidators(fixture.schema);
      const parsed = runtimeSchema.safeParse(fixture.value);

      expect(parsed.success, fixture.name).toBe(true);
      expect(portableValidator(fixture.value), fixture.name).toBe(true);

      if (parsed.success) {
        const roundTripped: unknown = JSON.parse(JSON.stringify(parsed.data));
        expect(runtimeSchema.safeParse(roundTripped).success, fixture.name).toBe(true);
        expect(roundTripped, fixture.name).toEqual(fixture.value);
      }
    }
  });

  it("rejects every invalid fixture in both Zod and JSON Schema", async () => {
    for (const fixture of await loadContractFixtures("invalid/contracts.json")) {
      const { runtimeSchema, portableValidator } = getValidators(fixture.schema);
      expect(runtimeSchema.safeParse(fixture.value).success, fixture.name).toBe(false);
      expect(portableValidator(fixture.value), fixture.name).toBe(false);
    }
  });
});
