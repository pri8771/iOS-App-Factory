#!/usr/bin/env node

import { runDashboardProcess } from "./launcher.js";

process.exitCode = await runDashboardProcess(process.argv.slice(2), process.env, {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
});
