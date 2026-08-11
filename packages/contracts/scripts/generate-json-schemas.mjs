#!/usr/bin/env node

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateContractJsonSchemasV1 } from "../dist/index.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../schemas/v1");
const checkOnly = process.argv.includes("--check");
const generatedSchemas = generateContractJsonSchemasV1();
const expectedFileNames = new Set(generatedSchemas.map((generated) => generated.fileName));

if (checkOnly) {
  const mismatches = [];

  for (const generated of generatedSchemas) {
    const path = join(outputDirectory, generated.fileName);
    let current;
    try {
      current = await readFile(path, "utf8");
    } catch {
      mismatches.push(`${generated.fileName}: missing`);
      continue;
    }

    if (current !== generated.contents) {
      mismatches.push(`${generated.fileName}: stale`);
    }
  }

  try {
    const existing = await readdir(outputDirectory);
    for (const fileName of existing) {
      if (fileName.endsWith(".json") && !expectedFileNames.has(fileName)) {
        mismatches.push(`${fileName}: unexpected`);
      }
    }
  } catch {
    if (mismatches.length === 0) {
      mismatches.push("schema directory: missing");
    }
  }

  if (mismatches.length > 0) {
    process.stderr.write(
      `Contract JSON Schema check failed:\n${mismatches
        .map((mismatch) => `- ${mismatch}`)
        .join("\n")}\n`,
    );
    process.exitCode = 1;
  }
} else {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    generatedSchemas.map((generated) =>
      writeFile(join(outputDirectory, generated.fileName), generated.contents, "utf8"),
    ),
  );
  process.stdout.write(
    `Generated ${generatedSchemas.length} contract schemas in ${outputDirectory}\n`,
  );
}
