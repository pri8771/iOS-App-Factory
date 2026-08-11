#!/usr/bin/env node

import { createCommandClient } from "@app-factory/command-client";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { commandClientMcpPort, createFactoryMcpServer } from "./server.js";

const socketPath = process.env.APP_FACTORY_SOCKET;
const authorization = process.env.APP_FACTORY_AUTH_TOKEN;
if (socketPath === undefined || authorization === undefined) {
  console.error("APP_FACTORY_SOCKET and APP_FACTORY_AUTH_TOKEN are required.");
  process.exitCode = 2;
} else {
  const client = createCommandClient({ socketPath, authorization, origin: "mcp" });
  const handle = serveStdio(() => createFactoryMcpServer(commandClientMcpPort(client)), {
    legacy: "serve",
    onerror: (error) => console.error(`App Factory MCP transport error: ${error.message}`),
  });
  const close = (): void => {
    void handle.close().finally(() => client.close());
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
