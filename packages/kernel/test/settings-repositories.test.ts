import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFactoryRepositories, openMigratedFactoryDatabase } from "../src/index.js";

const roots: string[] = [];

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-settings-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("StudioSettingsRepository", () => {
  it("answers an unset key honestly -- null value, null updatedAt, never a fabricated default", () => {
    const db = database();
    const repository = createFactoryRepositories(db).studioSettings;
    expect(repository.get("default-provider")).toEqual({
      key: "default-provider",
      value: null,
      updatedAt: null,
    });
    db.close();
  });

  it("sets a value, then reads it back with the recorded updatedAt", () => {
    const db = database();
    const repository = createFactoryRepositories(db).studioSettings;
    const written = repository.set({
      key: "default-provider",
      value: "codex",
      updatedAt: "2026-08-19T00:00:00.000Z",
    });
    expect(written).toEqual({
      key: "default-provider",
      value: "codex",
      updatedAt: "2026-08-19T00:00:00.000Z",
    });
    expect(repository.get("default-provider")).toEqual(written);
    db.close();
  });

  it("upserts in place -- a second set replaces the value and bumps updatedAt, never a second row", () => {
    const db = database();
    const repository = createFactoryRepositories(db).studioSettings;
    repository.set({
      key: "default-provider",
      value: "codex",
      updatedAt: "2026-08-19T00:00:00.000Z",
    });
    const second = repository.set({
      key: "default-provider",
      value: "openrouter-fast",
      updatedAt: "2026-08-19T01:00:00.000Z",
    });
    expect(second).toEqual({
      key: "default-provider",
      value: "openrouter-fast",
      updatedAt: "2026-08-19T01:00:00.000Z",
    });
    const count = db.prepare("SELECT count(*) AS total FROM studio_settings").get() as {
      total: number;
    };
    expect(count.total).toBe(1);
    db.close();
  });

  it("lists every known key, unset keys included, sorted by key", () => {
    const db = database();
    const repository = createFactoryRepositories(db).studioSettings;
    expect(repository.list()).toEqual([{ key: "default-provider", value: null, updatedAt: null }]);
    repository.set({
      key: "default-provider",
      value: "ollama",
      updatedAt: "2026-08-19T00:00:00.000Z",
    });
    expect(repository.list()).toEqual([
      { key: "default-provider", value: "ollama", updatedAt: "2026-08-19T00:00:00.000Z" },
    ]);
    db.close();
  });

  it("rejects an unknown setting key and a malformed provider value at the contract layer", () => {
    const db = database();
    const repository = createFactoryRepositories(db).studioSettings;
    expect(() => repository.get("not-a-real-key")).toThrow();
    expect(() =>
      repository.set({
        key: "default-provider",
        value: "Not-Lowercase",
        updatedAt: "2026-08-19T00:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      repository.set({
        key: "not-a-real-key",
        value: "codex",
        updatedAt: "2026-08-19T00:00:00.000Z",
      }),
    ).toThrow();
    db.close();
  });

  it("rejects a key/value pair the CHECK constraint would refuse, straight from SQL", () => {
    const db = database();
    expect(() =>
      db
        .prepare(
          `INSERT INTO studio_settings (key, value, updated_at) VALUES ('unknown-key', 'x', '2026-08-19T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
    db.close();
  });
});
