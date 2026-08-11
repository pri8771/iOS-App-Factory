#!/usr/bin/env node

import { runDaemonProcess } from "./daemon-entrypoint.js";

process.exitCode = await runDaemonProcess(process.env, {
  stderr: (value) => process.stderr.write(value),
});
