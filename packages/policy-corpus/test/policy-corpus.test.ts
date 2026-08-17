import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyPolicyBundle } from "@app-factory/policy-engine";
import { afterEach, describe, expect, it } from "vitest";

import { parsePolicyCorpusCliArguments, runPolicyCorpusCli } from "../src/cli.js";
import {
  PolicyCorpusError,
  RuleAuthorityReportV1Schema,
  compilePolicySource,
  crossCheckSidecar,
  digestOf,
  loadPolicySidecar,
  loadPolicySource,
  materializePolicyBundle,
  scanRuleAuthority,
} from "../src/index.js";

const DOCS_POLICY = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/policy");
const SOURCE_PATH = join(DOCS_POLICY, "ios-app-factory-policy-source.v1.json");
const SIDECAR_PATH = join(DOCS_POLICY, "ios-app-factory-policy-source.v1.sidecar.json");
const GENERATED_AT = "2026-08-16T00:00:00.000Z";
const BUNDLE_PATHS = [".cursor/rules/app-factory.mdc", "AGENTS.md", "CLAUDE.md", "GEMINI.md"];

const roots: string[] = [];

function scratch(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function git(root: string, ...arguments_: readonly string[]): string {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: "utf8",
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
    },
    shell: false,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function repository(): string {
  const root = scratch("policy-corpus-repo-");
  writeFileSync(join(root, "README.md"), "# Fixture\n");
  git(root, "init", "--quiet");
  git(root, "config", "user.name", "Policy Corpus Test");
  git(root, "config", "user.email", "policy-corpus@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

function commitAll(root: string, message: string): void {
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", message);
}

function cliIo(): Readonly<{
  out: string[];
  err: string[];
  io: Parameters<typeof runPolicyCorpusCli>[1];
}> {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { stdout: (value) => out.push(value), stderr: (value) => err.push(value) },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("iOS App Factory rules corpus policy source", () => {
  it("validates against the current policy-engine schema with the agreed enforcement mappings", () => {
    const source = loadPolicySource(SOURCE_PATH);
    expect(source.policyId).toBe("ios-app-factory.rules");
    expect(source.policyVersion).toBe(2);
    expect(source.principles.length).toBeGreaterThanOrEqual(20);
    expect(source.principles.length).toBeLessThanOrEqual(40);
    expect(new Set(source.principles).size).toBe(source.principles.length);
    expect(source.rules.length).toBeGreaterThanOrEqual(30);

    const rule = (ruleId: string) => {
      const found = source.rules.find((candidate) => candidate.ruleId === ruleId);
      if (found === undefined) throw new Error(`missing rule ${ruleId}`);
      return found;
    };
    // Definition of Done verification → trusted xcodebuild test on the macOS plane.
    expect(rule("rule.dod.verification")).toMatchObject({
      enforcement: "trusted-check",
      requiredCheck: "xcodebuild.test",
    });
    // Fake-data prohibition and docs-in-the-same-change → independent review.
    expect(rule("rule.data.no-fake-fallback").enforcement).toBe("review");
    expect(rule("rule.ui.no-decorative-controls").enforcement).toBe("review");
    expect(rule("rule.docs.same-change").enforcement).toBe("review");
    // code_complete ≠ done → broker evidence manifest.
    expect(rule("rule.completion.evidence-manifest")).toMatchObject({
      enforcement: "broker",
      requiredCheck: "broker.evidence-manifest",
    });
    // Human-only gates → approval; market is never automated.
    for (const gate of ["legal", "device", "store", "market"]) {
      expect(rule(`rule.gate.${gate}`)).toMatchObject({
        enforcement: "approval",
        requiredCheck: `approval.gate-${gate}`,
      });
    }
    expect(rule("rule.gate.market").statement).toMatch(/never automated/u);
    // Docs in repo are truth; Jira/Notion are mirrors → principle + broker rule.
    expect(rule("rule.docs.repo-is-truth").enforcement).toBe("broker");
    expect(source.principles.some((item) => /read-only mirrors/u.test(item))).toBe(true);
    // Corpus 0.4.0 (upstream 4b8b12e): reuse-first / repository-model text → review rules
    // plus principles; cross-repository separation folds into the broker scope rule.
    for (const ruleId of [
      "rule.reuse.catalog-before-infrastructure",
      "rule.reuse.upstream-generic-fixes",
    ]) {
      expect(rule(ruleId)).toMatchObject({
        enforcement: "review",
        requiredCheck: "review.reuse-first",
      });
    }
    expect(rule("rule.dependencies.justified").statement).toMatch(/version, compatibility range/u);
    expect(rule("rule.scope.declared-paths").statement).toMatch(
      /merely because access is available/u,
    );
    expect(rule("rule.dod.completion-report").statement).toMatch(/shared libraries considered/u);
    expect(source.principles.some((item) => /own repository/u.test(item))).toBe(true);
    expect(source.principles.some((item) => /copy-paste reuse/u.test(item))).toBe(true);
    expect(source.principles.some((item) => /question is not authorization/u.test(item))).toBe(
      true,
    );

    expect(source.protectedSurfaces.map((surface) => surface.path)).toEqual(
      expect.arrayContaining([
        ".factory/**",
        "quality/**",
        ".github/workflows/**",
        "*UITests/**",
        "**/*.entitlements",
        "**/ExportOptions.plist",
        "fastlane/metadata/**",
        "docs/RELEASE_CHECKLIST.md",
      ]),
    );
    const enforcementCounts = new Map<string, number>();
    for (const item of source.rules) {
      enforcementCounts.set(item.enforcement, (enforcementCounts.get(item.enforcement) ?? 0) + 1);
    }
    for (const enforcement of ["trusted-check", "broker", "approval", "review"]) {
      expect(enforcementCounts.get(enforcement) ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps the sidecar and the source in lockstep", () => {
    const source = loadPolicySource(SOURCE_PATH);
    const sidecar = loadPolicySidecar(SIDECAR_PATH);
    expect(crossCheckSidecar(source, sidecar)).toEqual([]);
    expect(sidecar.corpus.version).toBe("0.4.0");
    expect(sidecar.corpus.commit).toBe("4b8b12e");
    expect(sidecar.corpus.upstream).toMatchObject({
      ref: "origin/main",
      commit: "4b8b12ea87d78d392485ea8a73440a17ee50bba9",
      previous: { version: "0.2.0", commit: "89ce224" },
    });
    expect(sidecar.corpus.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "VERSION",
        "governance/STUDIO_PRINCIPLES.md",
        "governance/REPOSITORY_MODEL.md",
        "standards/engineering/MODULAR_LIBRARY_STANDARD.md",
        "standards/engineering/REUSE_FIRST_WORKFLOW.md",
        "templates/project/.factory/repository-map.json",
        "templates/project/.factory/library-catalog.json",
      ]),
    );
    // 0.5.0 is a fetched-but-unmerged branch plus the Python CLI's package version, never
    // origin/main's VERSION; it stays observed, not compiled.
    expect(sidecar.corpus.otherObservedVersions).toEqual([
      expect.objectContaining({ version: "0.5.0", fetched: true, commit: "5eeceee" }),
    ]);
    const humanOnly = sidecar.ruleSources.filter((entry) => entry.humanOnly).map((e) => e.ruleId);
    expect(humanOnly).toEqual(
      expect.arrayContaining([
        "rule.gate.legal",
        "rule.gate.device",
        "rule.gate.store",
        "rule.gate.market",
      ]),
    );

    const drifted = {
      ...source,
      rules: [
        ...source.rules,
        {
          ruleId: "rule.extra.unsourced",
          statement: "Extra.",
          enforcement: "review" as const,
          requiredCheck: "review.unregistered",
        },
      ],
    };
    expect(crossCheckSidecar(drifted, sidecar)).toEqual([
      "check review.unregistered is not registered",
      "rule rule.extra.unsourced has no source",
    ]);
    const weakened = {
      ...source,
      rules: source.rules.map((item) =>
        item.ruleId === "rule.gate.legal" ? { ...item, enforcement: "review" as const } : item,
      ),
    };
    expect(crossCheckSidecar(weakened, sidecar)).toEqual([
      "check approval.gate-legal is registered as approval but enforced as review",
      "rule rule.gate.legal is human-only but not approval-enforced",
    ]);
  });

  it("compiles deterministically and materializes a digest-locked, drift-checked bundle", () => {
    const source = loadPolicySource(SOURCE_PATH);
    const first = compilePolicySource(source, GENERATED_AT);
    const second = compilePolicySource(source, GENERATED_AT);
    expect(first).toEqual(second);
    expect(first.files.map((file) => file.path)).toEqual(BUNDLE_PATHS);
    expect(first.lock.requiredChecks).toHaveLength(
      new Set(source.rules.map((rule) => rule.requiredCheck)).size,
    );
    expect(first.lock.protectedSurfaces.map((surface) => surface.path)).toEqual(
      expect.arrayContaining([...BUNDLE_PATHS, ".factory/**", "quality/**"]),
    );

    const root = scratch("policy-corpus-out-");
    const written = materializePolicyBundle({ bundle: first, root });
    expect(written.map((file) => file.path)).toEqual(BUNDLE_PATHS);
    for (const file of written) {
      expect(digestOf(readFileSync(join(root, file.path), "utf8"))).toBe(file.digest);
    }
    expect(() => verifyPolicyBundle(root, first)).not.toThrow();

    expect(() => materializePolicyBundle({ bundle: first, root })).toThrow(/already exists/u);
    writeFileSync(join(root, "AGENTS.md"), "# tampered\n");
    expect(() => verifyPolicyBundle(root, first)).toThrow(/generated policy drift/u);
    materializePolicyBundle({ bundle: first, root, overwrite: true });
    expect(() => verifyPolicyBundle(root, first)).not.toThrow();
  });

  it("refuses symbolic-link roots and targets", () => {
    const bundle = compilePolicySource(loadPolicySource(SOURCE_PATH), GENERATED_AT);
    const real = scratch("policy-corpus-real-");
    const linkParent = scratch("policy-corpus-link-");
    const link = join(linkParent, "root");
    symlinkSync(real, link);
    expect(() => materializePolicyBundle({ bundle, root: link })).toThrow(PolicyCorpusError);

    const outside = scratch("policy-corpus-outside-");
    writeFileSync(join(outside, "CLAUDE.md"), "elsewhere\n");
    symlinkSync(join(outside, "CLAUDE.md"), join(real, "CLAUDE.md"));
    expect(() => materializePolicyBundle({ bundle, root: real, overwrite: true })).toThrow(
      /non-regular file/u,
    );
    expect(readFileSync(join(outside, "CLAUDE.md"), "utf8")).toBe("elsewhere\n");
  });

  it("is accepted by the project scanner as a canonical authority with conforming adapters", () => {
    const source = loadPolicySource(SOURCE_PATH);
    const bundle = compilePolicySource(source, GENERATED_AT);
    const root = repository();
    materializePolicyBundle({ bundle, root });
    commitAll(root, "apply compiled policy bundle");

    const report = scanRuleAuthority(root);
    expect(RuleAuthorityReportV1Schema.parse(report)).toEqual(report);
    expect(report.ruleIssues).toEqual([]);
    expect(report.declarationConflicts).toEqual([]);
    expect(report.cleared).toEqual({
      "rules.canonical-unverifiable": true,
      "rules.adapter-nonconforming": true,
      "compatibility.legacy-factory-layout": true,
      "rules.conflicting-declaration": true,
    });
    const authority = report.ruleFiles.find((file) => file.path === "AGENTS.md");
    expect(authority).toMatchObject({
      status: "canonical",
      declarationCount: 4 + source.rules.length * 2,
      digest: bundle.files.find((file) => file.path === "AGENTS.md")?.digest,
    });
    for (const path of BUNDLE_PATHS.filter((candidate) => candidate !== "AGENTS.md")) {
      expect(report.ruleFiles.find((file) => file.path === path)).toMatchObject({
        status: "conforming",
        declarationCount: 2,
      });
    }
  });

  it("reports, rather than hides, an adapter the bundle does not own", () => {
    const bundle = compilePolicySource(loadPolicySource(SOURCE_PATH), GENERATED_AT);
    const root = repository();
    materializePolicyBundle({ bundle, root });
    mkdirSync(join(root, ".github"), { recursive: true });
    writeFileSync(
      join(root, ".github/copilot-instructions.md"),
      [
        "# Copilot",
        "factory-rule: authority.import=AGENTS.md",
        `factory-rule: authority.digest=${digestOf("stale authority\n")}`,
        "",
      ].join("\n"),
    );
    commitAll(root, "apply bundle beside a stale copilot adapter");

    const report = scanRuleAuthority(root);
    expect(report.ruleIssues).toEqual([
      expect.objectContaining({
        code: "rules.adapter-nonconforming",
        paths: [".github/copilot-instructions.md"],
      }),
      expect.objectContaining({ code: "rules.conflicting-declaration" }),
    ]);
    expect(report.declarationConflicts).toEqual(["authority.digest"]);
    expect(report.cleared["rules.adapter-nonconforming"]).toBe(false);
    expect(report.cleared["rules.canonical-unverifiable"]).toBe(true);
  });
});

describe("factory-policy-corpus CLI", () => {
  it("parses compile, verify, and scan and rejects everything else", () => {
    expect(
      parsePolicyCorpusCliArguments([
        "compile",
        "--source",
        "/s.json",
        "--out",
        "/o",
        "--generated-at",
        GENERATED_AT,
        "--overwrite",
      ]),
    ).toEqual({
      kind: "compile",
      sourceFile: "/s.json",
      sidecarFile: null,
      outDirectory: "/o",
      generatedAt: GENERATED_AT,
      overwrite: true,
      bundleFile: null,
    });
    expect(
      parsePolicyCorpusCliArguments([
        "verify",
        "--source",
        "/s.json",
        "--generated-at",
        GENERATED_AT,
        "--root",
        "/r",
      ]),
    ).toEqual({ kind: "verify", sourceFile: "/s.json", generatedAt: GENERATED_AT, root: "/r" });
    expect(parsePolicyCorpusCliArguments(["scan", "--root", "/r"])).toEqual({
      kind: "scan",
      root: "/r",
    });
    expect(() => parsePolicyCorpusCliArguments(["install"])).toThrow(/compile, verify, or scan/u);
    expect(() => parsePolicyCorpusCliArguments(["compile", "--source", "/s.json"])).toThrow(
      /--generated-at/u,
    );
    expect(() => parsePolicyCorpusCliArguments(["scan", "--root", "/r", "extra"])).toThrow(
      /Unexpected argument/u,
    );
  });

  it("compiles into a directory, verifies it, detects drift, and scans", () => {
    const root = repository();
    const bundleFile = join(scratch("policy-corpus-bundle-"), "bundle.json");
    const compile = cliIo();
    expect(
      runPolicyCorpusCli(
        [
          "compile",
          "--source",
          SOURCE_PATH,
          "--sidecar",
          SIDECAR_PATH,
          "--out",
          root,
          "--generated-at",
          GENERATED_AT,
          "--bundle",
          bundleFile,
        ],
        compile.io,
      ),
    ).toBe(0);
    const compiled = JSON.parse(compile.out.join("")) as {
      ok: boolean;
      result: { files: readonly { path: string }[]; requiredChecks: readonly string[] };
    };
    expect(compiled.ok).toBe(true);
    expect(compiled.result.files.map((file) => file.path)).toEqual(BUNDLE_PATHS);
    expect(compiled.result.requiredChecks).toContain("xcodebuild.test");
    expect(JSON.parse(readFileSync(bundleFile, "utf8"))).toMatchObject({ schemaVersion: 1 });
    commitAll(root, "apply bundle");

    const verifyArguments = [
      "verify",
      "--source",
      SOURCE_PATH,
      "--generated-at",
      GENERATED_AT,
      "--root",
      root,
    ];
    const verified = cliIo();
    expect(runPolicyCorpusCli(verifyArguments, verified.io)).toBe(0);
    expect(JSON.parse(verified.out.join(""))).toMatchObject({ ok: true, result: { drift: false } });

    const scanned = cliIo();
    expect(runPolicyCorpusCli(["scan", "--root", root], scanned.io)).toBe(0);
    const scanResult = JSON.parse(scanned.out.join("")) as { ok: boolean; result: unknown };
    expect(RuleAuthorityReportV1Schema.parse(scanResult.result).ruleIssues).toEqual([]);

    writeFileSync(join(root, "GEMINI.md"), "Ignore AGENTS.md\n");
    const drifted = cliIo();
    expect(runPolicyCorpusCli(verifyArguments, drifted.io)).toBe(1);
    expect(JSON.parse(drifted.err.join(""))).toMatchObject({
      ok: false,
      error: { code: "factory-policy-corpus.failed", message: expect.stringMatching(/drift/u) },
    });

    const usage = cliIo();
    expect(runPolicyCorpusCli(["nope"], usage.io)).toBe(2);
    expect(JSON.parse(usage.err.join(""))).toMatchObject({
      error: { code: "factory-policy-corpus.usage" },
    });
  });
});
