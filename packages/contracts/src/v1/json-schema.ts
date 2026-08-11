import { z } from "zod";

import { contractSchemaCatalogV1 } from "./catalog.js";

export const JSON_SCHEMA_DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

export type GeneratedContractJsonSchemaV1 = Readonly<{
  name: string;
  fileName: string;
  id: string;
  document: Readonly<Record<string, unknown>>;
  contents: string;
}>;

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }

  return value;
}

export function serializeContractJsonSchemaV1(document: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(sortJsonValue(document), null, 2)}\n`;
}

export function generateContractJsonSchemasV1(): readonly GeneratedContractJsonSchemaV1[] {
  return contractSchemaCatalogV1.map((entry) => {
    const generated = z.toJSONSchema(entry.schema, {
      target: "draft-2020-12",
      unrepresentable: "throw",
      cycles: "throw",
      reused: "ref",
    });
    const document = {
      ...generated,
      $schema: JSON_SCHEMA_DRAFT_2020_12,
      $id: entry.id,
    };

    return {
      name: entry.name,
      fileName: entry.fileName,
      id: entry.id,
      document,
      contents: serializeContractJsonSchemaV1(document),
    };
  });
}
