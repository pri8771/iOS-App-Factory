import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { CommandResponseV1Schema } from "../src/index.js";

/**
 * `apps/studio-mac/Tests/StudioKitTests/Fixtures/*.response.json` are checked-in wire fixtures the
 * Swift app's own tests decode against (`Fixtures.data(...)` / `ModelDecodingTests.swift` etc.),
 * produced by `apps/studio-mac/scripts/record-*.mjs` through this package's real, built schemas —
 * never hand-authored. Nothing re-runs those recorder scripts in CI, so when a schema gains a
 * required field (as `AttemptListItemV1.phase` and `StudioAwaitingHumanItemV1.phaseRunId` each did)
 * a stale checked-in fixture can silently drift out of sync with the schema it claims to satisfy,
 * only surfacing as a Swift decode failure much later — or not at all, if the Swift model happens
 * to tolerate the stale shape.
 *
 * This test parses every one of those response fixtures with the same `CommandResponseV1Schema`
 * the recorders validate against, so that kind of drift fails fast, in TS CI, pointing at the exact
 * fixture file — instead of surfacing (or silently not surfacing) on the Swift side. It does not
 * re-record anything; re-recording is `apps/studio-mac/scripts/record-*.mjs`'s job.
 *
 * Non-response fixtures in the same directory (`*.canonical.txt`, `*.digest.txt`,
 * `lifecycle-stages.json`, `locale-compare-order.json`, `number-format.json`) are not
 * `CommandResponseV1` envelopes at all — they are skipped by the `*.response.json` filter below,
 * not by name.
 */

const fixturesDir = new URL(
  "../../../apps/studio-mac/Tests/StudioKitTests/Fixtures/",
  import.meta.url,
);

describe("Studio (apps/studio-mac) checked-in response fixtures", () => {
  it("parses every *.response.json fixture with CommandResponseV1Schema", async () => {
    const entries = await readdir(fixturesDir);
    const responseFixtures = entries.filter((name) => name.endsWith(".response.json")).sort();

    // A sanity floor, not a magic number: catches this test silently no-op'ing (0 fixtures found)
    // if the relative path above ever stops resolving to the Swift fixtures directory.
    expect(responseFixtures.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const name of responseFixtures) {
      const raw = await readFile(new URL(name, fixturesDir), "utf8");
      const value: unknown = JSON.parse(raw);
      const parsed = CommandResponseV1Schema.safeParse(value);
      if (!parsed.success) {
        failures.push(`${name}: ${parsed.error.message}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
