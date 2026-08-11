"use strict";

const workspacePackage = "(^|/)packages/";
const workspaceApp = "(^|/)apps/";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-unresolved-workspace-imports",
      severity: "error",
      from: { path: `(?:${workspacePackage}|${workspaceApp})` },
      to: { couldNotResolve: true },
    },
    {
      name: "no-circular-workspace-dependencies",
      severity: "error",
      from: { path: `(?:${workspacePackage}|${workspaceApp})` },
      to: { circular: true },
    },
    {
      name: "packages-must-not-import-apps",
      severity: "error",
      from: { path: workspacePackage },
      to: { path: workspaceApp },
    },
    {
      name: "contracts-are-foundational",
      severity: "error",
      from: { path: "(^|/)packages/contracts/" },
      to: { path: "(^|/)(apps/|packages/(?!contracts(?:/|$)))" },
    },
    {
      name: "kernel-imports-contracts-only",
      severity: "error",
      from: { path: "(^|/)packages/kernel/" },
      to: { path: "(^|/)(apps/|packages/(?!contracts(?:/|$)|kernel(?:/|$)))" },
    },
    {
      name: "agent-runner-imports-contracts-only",
      severity: "error",
      from: { path: "(^|/)packages/agent-runner/" },
      to: { path: "(^|/)(apps/|packages/(?!agent-runner(?:/|$)|contracts(?:/|$)))" },
    },
    {
      name: "command-client-imports-contracts-only",
      severity: "error",
      from: { path: "(^|/)packages/command-client/" },
      to: { path: "(^|/)(apps/|packages/(?!command-client(?:/|$)|contracts(?:/|$)))" },
    },
    {
      name: "oci-runner-imports-contracts-only",
      severity: "error",
      from: { path: "(^|/)packages/oci-runner/" },
      to: {
        path: "(^|/)(apps/|packages/(?!contracts(?:/|$)|oci-runner(?:/|$)))",
      },
    },
    {
      name: "supervisor-imports-runner-or-contracts-only",
      severity: "error",
      from: { path: "(^|/)packages/process-supervisor/" },
      to: {
        path: "(^|/)(apps/|packages/(?!agent-runner(?:/|$)|contracts(?:/|$)|process-supervisor(?:/|$)))",
      },
    },
    {
      name: "clients-use-command-boundary-only",
      severity: "error",
      from: { path: "(^|/)apps/(cli|dashboard|mcp)/" },
      to: {
        path: "(^|/)(apps/(?!cli(?:/|$)|dashboard(?:/|$)|mcp(?:/|$))|packages/(?!command-client(?:/|$)|contracts(?:/|$)))",
      },
    },
    {
      name: "adapter-sdk-must-not-import-kernel",
      severity: "error",
      from: { path: "(^|/)packages/adapter-sdk/" },
      to: { path: "(^|/)packages/kernel/" },
    },
    {
      name: "module-sdk-must-not-import-kernel",
      severity: "error",
      from: { path: "(^|/)packages/module-sdk/" },
      to: { path: "(^|/)packages/kernel/" },
    },
    {
      name: "production-must-not-import-testkit",
      severity: "error",
      from: { path: "(^|/)(apps/|packages/(?!testkit(?:/|$)))" },
      to: { path: "(^|/)packages/testkit/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(coverage|dist|node_modules)/" },
    includeOnly: { path: "(^|/)(apps|packages|tests/dependency-boundaries)/" },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ["types", "import", "default"],
      exportsFields: ["exports"],
      extensions: [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
