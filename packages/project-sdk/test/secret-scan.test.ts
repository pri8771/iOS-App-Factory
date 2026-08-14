import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { scanExistingProject } from "../src/index.js";

function git(root: string, ...arguments_: readonly string[]): Buffer {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: null,
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
    },
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString("utf8"));
  return result.stdout;
}

function write(root: string, path: string, content: string | Buffer): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createRepository(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-sdk-secret-scan-")));
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  git(root, "init", "--quiet");
  git(root, "config", "user.name", "Secret Scan Test");
  git(root, "config", "user.email", "secret-scan@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

const AUTHORITY = ["# Canonical authority", "factory-rule: authority.version=1", ""].join("\n");

describe("secret-shaped-file detection at enrollment", () => {
  it("flags a fake .env file and a fake private-key file as blockers", () => {
    const repositoryRoot = createRepository({
      "AGENTS.md": AUTHORITY,
      ".env": ["DATABASE_URL=postgres://user:pass@localhost/db", "DEBUG=true", ""].join("\n"),
      "certs/private.pem": [
        "-----BEGIN PRIVATE KEY-----",
        "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
        "-----END PRIVATE KEY-----",
        "",
      ].join("\n"),
      "README.md": "# Example\n\nNothing secret here.\n",
    });

    const result = scanExistingProject({ repositoryRoot });

    const secretIssues = result.issues.filter(
      (issue) => issue.code === "safety.secret-material-detected",
    );
    expect(secretIssues.map((issue) => issue.paths)).toEqual(
      expect.arrayContaining([[".env"], ["certs/private.pem"]]),
    );
    expect(secretIssues.every((issue) => issue.severity === "blocker")).toBe(true);
    expect(result.readiness.ready).toBe(false);
    expect(result.plan.blocked).toBe(true);
    expect(secretIssues.every((issue) => result.plan.blockerIssueIds.includes(issue.issueId))).toBe(
      true,
    );
    expect(result.plan.actions).toContainEqual(
      expect.objectContaining({ kind: "resolve-secret-material", targetPath: ".env" }),
    );
    expect(result.plan.actions).toContainEqual(
      expect.objectContaining({ kind: "resolve-secret-material", targetPath: "certs/private.pem" }),
    );

    const findings = result.inventory.secretShapedFiles;
    expect(findings.find((finding) => finding.path === ".env")?.detectors).toContain(
      "filename-pattern",
    );
    expect(findings.find((finding) => finding.path === "certs/private.pem")?.detectors).toContain(
      "filename-pattern",
    );
  });

  it("detects credential-pattern filenames beyond .env and .pem", () => {
    const repositoryRoot = createRepository({
      "AGENTS.md": AUTHORITY,
      "mobile/App.mobileprovision": "not a real provisioning profile\n",
      "keys/signing.p12": "not a real PKCS12 bundle\n",
      "config/credentials.json": '{"key":"not-a-real-value"}\n',
      ".ssh/id_rsa": "not a real ssh key\n",
    });

    const result = scanExistingProject({ repositoryRoot });
    const flaggedPaths = new Set(result.inventory.secretShapedFiles.map((finding) => finding.path));
    expect(flaggedPaths).toEqual(
      new Set([
        "mobile/App.mobileprovision",
        "keys/signing.p12",
        "config/credentials.json",
        ".ssh/id_rsa",
      ]),
    );
  });

  it("flags a high-entropy assignment embedded in an ordinary small text file", () => {
    const repositoryRoot = createRepository({
      "AGENTS.md": AUTHORITY,
      "Sources/Config.swift": [
        "import Foundation",
        "",
        "enum Config {",
        '  static let apiBaseURL = "https://example.invalid/api"',
        "}",
        "",
      ].join("\n"),
      "Sources/Secrets.properties": [
        "environment=production",
        "AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLEKEY9182734",
        "",
      ].join("\n"),
    });

    const result = scanExistingProject({ repositoryRoot });
    const finding = result.inventory.secretShapedFiles.find(
      (item) => item.path === "Sources/Secrets.properties",
    );
    expect(finding?.detectors).toContain("content-entropy");
    expect(result.inventory.secretShapedFiles.map((item) => item.path)).not.toContain(
      "Sources/Config.swift",
    );
  });

  it("never reproduces matched file content, key names, or values in issue text", () => {
    const secretValue = "AKIAIOSFODNN7EXAMPLEKEY9182734";
    const repositoryRoot = createRepository({
      "AGENTS.md": AUTHORITY,
      ".env": `AWS_SECRET_ACCESS_KEY=${secretValue}\n`,
    });

    const result = scanExistingProject({ repositoryRoot });
    const serialized = JSON.stringify(result.issues);
    expect(serialized).not.toContain(secretValue);
    expect(serialized).not.toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("does not flag an ordinary clean repository", () => {
    const repositoryRoot = createRepository({
      "AGENTS.md": AUTHORITY,
      "Sources/App.swift": [
        "import SwiftUI",
        "",
        "@main",
        "struct ExampleApp: App {",
        "  var body: some Scene {",
        '    WindowGroup { Text("Hello") }',
        "  }",
        "}",
        "",
      ].join("\n"),
      "README.md": "# Example\n",
      ".github/workflows/verify.yml": [
        "name: verify",
        "on: [push]",
        "jobs:",
        "  test:",
        "    runs-on: macos-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "",
      ].join("\n"),
    });

    const result = scanExistingProject({ repositoryRoot });
    expect(result.inventory.secretShapedFiles).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "safety.secret-material-detected",
    );
  });
});
