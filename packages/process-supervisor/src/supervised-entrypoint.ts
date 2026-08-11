import { fileURLToPath } from "node:url";

import { runSupervisedController, runSupervisedTargetGate } from "./supervised-controller.js";

export async function runSupervisedEntrypoint(argv: readonly string[]): Promise<number> {
  if (argv.length !== 2) return 64;
  const [mode, intentPath] = argv;
  if (intentPath === undefined) return 64;
  if (mode === "controller") {
    await runSupervisedController(intentPath);
    return 0;
  }
  if (mode === "gate") {
    return runSupervisedTargetGate(intentPath) === "permission-eof" ? 70 : 0;
  }
  return 64;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runSupervisedEntrypoint(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      // Errors are represented by the durable artifacts. Never print target arguments,
      // environment, stdin, or private artifact contents to an inherited logging surface.
      process.exitCode = 70;
    });
}
