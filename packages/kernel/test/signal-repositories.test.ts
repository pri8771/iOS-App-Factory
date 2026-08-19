import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SignalInsightV1Schema,
  canonicalSignalInsightDigestInputV1,
  type SignalInsightDigestInputV1,
  type SignalInsightV1,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  SignalInsightConflictError,
  SignalNotFoundError,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const roots: string[] = [];

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-signals-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function signalId(suffix: number): string {
  return `8a000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function insight(
  suffix: number,
  signal: string,
  discoveredAt: string,
  headline = "Searches for gothic streetwear are up sharply heading into October.",
): SignalInsightV1 {
  const input = {
    schemaVersion: 1,
    insightId: `8b000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`,
    signalId: signal,
    discoveredAt,
    headline,
    rationale: "Three competitor stores added black-based capsules in the last two weeks.",
    confidence: "moderate",
    citations: [{ url: "https://example.com/trend-report", title: "Trend report" }],
  } as SignalInsightDigestInputV1;
  return SignalInsightV1Schema.parse({
    ...input,
    insightDigest: `sha256:${createHash("sha256")
      .update(canonicalSignalInsightDigestInputV1(input), "utf8")
      .digest("hex")}`,
  });
}

describe("SignalRepository", () => {
  it("creates a signal active by default, with no checks or insights yet", () => {
    const db = database();
    const repository = createFactoryRepositories(db).signals;
    expect(repository.list()).toEqual([]);
    const created = repository.create({
      signalId: signalId(1),
      name: "Halloween streetwear trends",
      watchDescription: "Fashion trends relevant to a Halloween-season streetwear Shopify store.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    expect(created).toMatchObject({
      signalId: signalId(1),
      name: "Halloween streetwear trends",
      scoutProvider: "codex",
      status: "active",
      lastCheckedAt: null,
      checkCount: 0,
      insightCount: 0,
    });
    expect(repository.findById(signalId(1))).toEqual(created);
    expect(repository.list()).toEqual([created]);
    db.close();
  });

  it("pauses and resumes, and lists newest first", () => {
    const db = database();
    const repository = createFactoryRepositories(db).signals;
    const first = repository.create({
      signalId: signalId(2),
      name: "First",
      watchDescription: "Watch one thing.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const second = repository.create({
      signalId: signalId(3),
      name: "Second",
      watchDescription: "Watch another thing.",
      scoutProvider: "ollama",
      createdAt: "2026-08-19T00:01:00.000Z",
    });
    expect(repository.list().map((s) => s.signalId)).toEqual([second.signalId, first.signalId]);

    const paused = repository.setStatus(first.signalId, "paused");
    expect(paused.status).toBe("paused");
    const resumed = repository.setStatus(first.signalId, "active");
    expect(resumed.status).toBe("active");
    db.close();
  });

  it("refuses to update or check a signal that does not exist", () => {
    const db = database();
    const repository = createFactoryRepositories(db).signals;
    expect(() => repository.setStatus(signalId(99), "paused")).toThrow(SignalNotFoundError);
    expect(() => repository.recordCheck(signalId(99), "2026-08-19T00:00:00.000Z", false)).toThrow(
      SignalNotFoundError,
    );
    db.close();
  });

  it("records a check, bumping checkCount always and insightCount only when something was found", () => {
    const db = database();
    const repository = createFactoryRepositories(db).signals;
    const created = repository.create({
      signalId: signalId(4),
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const afterNothing = repository.recordCheck(
      created.signalId,
      "2026-08-19T01:00:00.000Z",
      false,
    );
    expect(afterNothing).toMatchObject({
      lastCheckedAt: "2026-08-19T01:00:00.000Z",
      checkCount: 1,
      insightCount: 0,
    });
    const afterFound = repository.recordCheck(created.signalId, "2026-08-19T02:00:00.000Z", true);
    expect(afterFound).toMatchObject({
      lastCheckedAt: "2026-08-19T02:00:00.000Z",
      checkCount: 2,
      insightCount: 1,
    });
    db.close();
  });
});

describe("SignalInsightRepository", () => {
  it("records once, is idempotent, and fails closed on a different insight under the same id", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.signals.create({
      signalId: signalId(5),
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const repository = repositories.signalInsights;
    const recorded = insight(1, signalId(5), "2026-08-19T01:00:00.000Z");
    expect(repository.record(recorded)).toEqual({ insight: recorded, inserted: true });
    expect(repository.record(recorded)).toEqual({ insight: recorded, inserted: false });
    expect(repository.get(recorded.insightId)).toEqual(recorded);

    const different = insight(1, signalId(5), "2026-08-19T01:05:00.000Z");
    expect(() => repository.record(different)).toThrow(SignalInsightConflictError);
    db.close();
  });

  it("lists a signal's insights newest first, scoped to that signal only", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.signals.create({
      signalId: signalId(6),
      name: "A",
      watchDescription: "Watch A.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    repositories.signals.create({
      signalId: signalId(7),
      name: "B",
      watchDescription: "Watch B.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const repository = repositories.signalInsights;
    const early = insight(2, signalId(6), "2026-08-19T01:00:00.000Z", "Early finding");
    const late = insight(3, signalId(6), "2026-08-19T02:00:00.000Z", "Late finding");
    const otherSignal = insight(4, signalId(7), "2026-08-19T03:00:00.000Z", "Unrelated finding");
    repository.record(early);
    repository.record(late);
    repository.record(otherSignal);

    expect(repository.listBySignal(signalId(6))).toEqual([late, early]);
    expect(repository.listBySignal(signalId(7))).toEqual([otherSignal]);
    db.close();
  });

  it("never updates or deletes a recorded insight", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.signals.create({
      signalId: signalId(8),
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const repository = repositories.signalInsights;
    const recorded = insight(5, signalId(8), "2026-08-19T01:00:00.000Z");
    repository.record(recorded);
    expect(() =>
      db
        .prepare(`UPDATE signal_insights SET headline = 'edited' WHERE insight_id = ?`)
        .run(recorded.insightId),
    ).toThrow(/never rewritten/);
    expect(() =>
      db.prepare(`DELETE FROM signal_insights WHERE insight_id = ?`).run(recorded.insightId),
    ).toThrow(/retained/);
    expect(repository.get(recorded.insightId)).toEqual(recorded);
    db.close();
  });

  it("rejects a Scout finding with no citation at the contract layer, before it ever reaches the repository", () => {
    expect(() =>
      SignalInsightV1Schema.parse({
        schemaVersion: 1,
        insightId: "8b000000-0000-4000-8000-000000000099",
        signalId: signalId(9),
        discoveredAt: "2026-08-19T01:00:00.000Z",
        headline: "Unsourced claim",
        rationale: "No evidence.",
        confidence: "weak",
        citations: [],
        insightDigest: `sha256:${"a".repeat(64)}`,
      }),
    ).toThrow();
  });
});
