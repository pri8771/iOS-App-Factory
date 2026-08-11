import { readFile } from "node:fs/promises";

export type ContractFixtureCase = Readonly<{
  name: string;
  schema: string;
  value: unknown;
}>;

type FixtureDocument = Readonly<{
  cases: readonly ContractFixtureCase[];
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertFixtureDocument(value: unknown): asserts value is FixtureDocument {
  if (!isRecord(value) || !Array.isArray(value.cases)) {
    throw new Error("Contract fixture must contain a cases array");
  }

  for (const fixture of value.cases) {
    if (
      !isRecord(fixture) ||
      typeof fixture.name !== "string" ||
      typeof fixture.schema !== "string" ||
      !("value" in fixture)
    ) {
      throw new Error("Malformed contract fixture case");
    }
  }
}

export async function loadContractFixtures(
  relativePath: string,
): Promise<readonly ContractFixtureCase[]> {
  const fixtureUrl = new URL(`../fixtures/v1/${relativePath}`, import.meta.url);
  const parsed: unknown = JSON.parse(await readFile(fixtureUrl, "utf8"));
  assertFixtureDocument(parsed);
  return parsed.cases;
}
