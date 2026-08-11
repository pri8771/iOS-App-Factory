import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const expected = Object.freeze({
  node: "24.18.0",
  pnpm: "10.33.2",
});

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const nodeVersionFile = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
const userAgent = process.env.npm_config_user_agent ?? "";
const pnpmVersion = /^pnpm\/([^\s]+)/u.exec(userAgent)?.[1];

const configured = {
  nodeVersionFile,
  engineNode: packageManifest.engines?.node,
  enginePnpm: packageManifest.engines?.pnpm,
  packageManager: packageManifest.packageManager,
  voltaNode: packageManifest.volta?.node,
  voltaPnpm: packageManifest.volta?.pnpm,
};

const failures = [];

if (process.versions.node !== expected.node) {
  failures.push(`Node runtime is ${process.versions.node}; expected ${expected.node}.`);
}

if (pnpmVersion !== expected.pnpm) {
  failures.push(
    pnpmVersion === undefined
      ? "pnpm could not be identified. Run this check through `pnpm toolchain:check`."
      : `pnpm runtime is ${pnpmVersion}; expected ${expected.pnpm}.`,
  );
}

const expectedConfiguration = {
  nodeVersionFile: expected.node,
  engineNode: expected.node,
  enginePnpm: expected.pnpm,
  packageManager: `pnpm@${expected.pnpm}`,
  voltaNode: expected.node,
  voltaPnpm: expected.pnpm,
};

for (const [field, wanted] of Object.entries(expectedConfiguration)) {
  if (configured[field] !== wanted) {
    failures.push(
      `${field} is ${JSON.stringify(configured[field])}; expected ${JSON.stringify(wanted)}.`,
    );
  }
}

if (failures.length > 0) {
  console.error("App Factory toolchain check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(`Repository: ${repositoryRoot}`);
  process.exitCode = 1;
} else {
  console.log(`App Factory toolchain OK: Node ${expected.node}, pnpm ${expected.pnpm}.`);
}
