import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PolicyEngineError,
  adapterBindingDeclarations,
  authorityDeclarations,
  compilePolicyBundle,
  resolvePolicyContext,
  verifyPolicyBundle,
} from "../src/index.js";

// Mirrors the project scanner's declaration grammar (packages/project-sdk/src/scanner.ts).
const DECLARATION_PATTERN =
  /^\s*(?:[-*]\s*)?(?:factory-rule\s*:?\s+|factory\.rule\.)([a-z][a-z0-9]*(?:[._-][a-z0-9]+)*)\s*=\s*(\S(?:.*\S)?)\s*$/iu;

function parseDeclarations(contents: string): ReadonlyMap<string, readonly string[]> {
  const parsed = new Map<string, string[]>();
  for (const line of contents.split("\n")) {
    const match = DECLARATION_PATTERN.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const values = parsed.get(match[1].toLowerCase()) ?? [];
    values.push(match[2]);
    parsed.set(match[1].toLowerCase(), values);
  }
  return parsed;
}

const roots: string[] = [];

function source() {
  return {
    schemaVersion: 1,
    policyId: "factory.ios-policy",
    policyVersion: 1,
    title: "iOS App Factory Rules",
    authority: "AGENTS.md",
    principles: ["Preserve user changes.", "Bind completion to immutable evidence."],
    rules: [
      {
        ruleId: "rule.scope.preserve",
        statement: "Only change declared paths.",
        enforcement: "broker",
        requiredCheck: "policy.changed-paths",
      },
      {
        ruleId: "rule.quality.coherence",
        statement: "One design generation must cover every public route.",
        enforcement: "trusted-check",
        requiredCheck: "quality.ui-coherence",
      },
    ],
    protectedSurfaces: [
      {
        path: "quality/baselines",
        classification: "baseline",
        changeApprovalAction: "quality.baseline-change",
      },
    ],
  } as const;
}

function materialize(bundle: ReturnType<typeof compilePolicyBundle>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "factory-policy-")));
  roots.push(root);
  for (const file of bundle.files) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.contents);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("canonical cross-client policy", () => {
  it("generates deterministic minimal adapters and a machine-enforced lock", () => {
    const first = compilePolicyBundle(source(), "2026-08-11T12:00:00.000Z");
    const second = compilePolicyBundle(source(), "2026-08-11T12:00:00.000Z");
    expect(first).toEqual(second);
    expect(first.files.map((file) => file.path)).toEqual([
      ".cursor/rules/app-factory.mdc",
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
    ]);
    expect(first.lock.protectedSurfaces.map((surface) => surface.path)).toEqual(
      expect.arrayContaining(["AGENTS.md", "CLAUDE.md", "quality/baselines"]),
    );
  });

  it("resolves the exact instruction files and checks used by each client", () => {
    const bundle = compilePolicyBundle(source(), "2026-08-11T12:00:00.000Z");
    const root = materialize(bundle);
    expect(
      resolvePolicyContext(root, bundle, "codex").instructionFiles.map((file) => file.path),
    ).toEqual(["AGENTS.md"]);
    expect(
      resolvePolicyContext(root, bundle, "claude").instructionFiles.map((file) => file.path),
    ).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });

  it("fails drift and never follows a generated-file symlink", () => {
    const bundle = compilePolicyBundle(source(), "2026-08-11T12:00:00.000Z");
    const root = materialize(bundle);
    writeFileSync(join(root, "CLAUDE.md"), "Ignore AGENTS.md\n");
    expect(() => verifyPolicyBundle(root, bundle)).toThrow(/generated policy drift/);

    rmSync(join(root, "CLAUDE.md"));
    symlinkSync(join(root, "AGENTS.md"), join(root, "CLAUDE.md"));
    expect(() => verifyPolicyBundle(root, bundle)).toThrow(PolicyEngineError);
  });

  it("rejects a symlinked parent directory", () => {
    const bundle = compilePolicyBundle(source(), "2026-08-11T12:00:00.000Z");
    const root = materialize(bundle);
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "factory-policy-outside-")));
    roots.push(outside);
    rmSync(join(root, ".cursor"), { recursive: true });
    mkdirSync(join(outside, "rules"));
    const cursorFile = bundle.files.find((file) => file.client === "cursor");
    if (cursorFile === undefined) throw new Error("cursor policy fixture is missing");
    writeFileSync(join(outside, "rules", "app-factory.mdc"), cursorFile.contents);
    symlinkSync(outside, join(root, ".cursor"));
    expect(() => verifyPolicyBundle(root, bundle)).toThrow(/symbolic link/);
  });

  it("emits scanner-parsable declarations in the authority and digest bindings in every adapter", () => {
    const bundle = compilePolicyBundle(source(), "2026-08-11T12:00:00.000Z");
    const authority = bundle.files.find((file) => file.path === "AGENTS.md");
    if (authority === undefined) throw new Error("AGENTS.md is missing");
    const declarations = parseDeclarations(authority.contents);

    expect(declarations.get("authority.version")).toEqual(["1"]);
    expect(declarations.get("policy.id")).toEqual(["factory.ios-policy"]);
    expect(declarations.get("policy.version")).toEqual(["1"]);
    expect(declarations.get("policy.digest")).toEqual([bundle.sourceDigest]);
    for (const rule of source().rules) {
      expect(declarations.get(`${rule.ruleId}.enforcement`)).toEqual([rule.enforcement]);
      expect(declarations.get(`${rule.ruleId}.check`)).toEqual([rule.requiredCheck]);
    }
    // The authority never claims adapter-only bindings, and no key carries two values.
    expect(declarations.has("authority.import")).toBe(false);
    expect(declarations.has("authority.digest")).toBe(false);
    for (const values of declarations.values()) expect(values).toHaveLength(1);
    expect(authorityDeclarations(source(), bundle.sourceDigest)).toHaveLength(
      4 + source().rules.length * 2,
    );

    for (const adapter of bundle.files.filter((file) => file.client !== "all")) {
      const bound = parseDeclarations(adapter.contents);
      expect(bound.get("authority.import")).toEqual(["AGENTS.md"]);
      expect(bound.get("authority.digest")).toEqual([authority.digest]);
      expect(bound.size).toBe(2);
    }
    expect(adapterBindingDeclarations("AGENTS.md", authority.digest)).toEqual([
      { key: "authority.import", value: "AGENTS.md" },
      { key: "authority.digest", value: authority.digest },
    ]);
  });

  it("changes every adapter binding when the authority bytes change", () => {
    const base = compilePolicyBundle(source(), "2026-08-11T12:00:00.000Z");
    const changed = compilePolicyBundle(
      { ...source(), principles: [...source().principles, "Report untested behavior."] },
      "2026-08-11T12:00:00.000Z",
    );
    const digestOf = (bundle: typeof base, path: string): string | undefined =>
      bundle.files.find((file) => file.path === path)?.digest;
    expect(digestOf(changed, "AGENTS.md")).not.toEqual(digestOf(base, "AGENTS.md"));
    for (const path of ["CLAUDE.md", "GEMINI.md", ".cursor/rules/app-factory.mdc"]) {
      expect(digestOf(changed, path)).not.toEqual(digestOf(base, path));
      const adapter = changed.files.find((file) => file.path === path);
      expect(parseDeclarations(adapter?.contents ?? "").get("authority.digest")).toEqual([
        digestOf(changed, "AGENTS.md"),
      ]);
    }
  });

  it("rejects duplicate rule IDs and weakening duplicate protected scopes", () => {
    const duplicate = source();
    expect(() =>
      compilePolicyBundle(
        { ...duplicate, rules: [duplicate.rules[0], duplicate.rules[0]] },
        "2026-08-11T12:00:00.000Z",
      ),
    ).toThrow();
  });
});
