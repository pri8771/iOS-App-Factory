// Regenerates Tests/StudioKitTests/Fixtures/provider-*.response.json and settings-*.response.json
// (Wave 8's provider registry and studio settings surfaces — provider.ts/settings.ts) through the
// real, built `@app-factory/contracts` — same "record through the real contracts" discipline as
// record-room-fixtures.mjs. Re-record with:
//   pnpm --filter @app-factory/contracts build && node apps/studio-mac/scripts/record-provider-settings-fixtures.mjs
import { writeFileSync } from "node:fs";
import { CommandResponseV1Schema } from "../../../packages/contracts/dist/index.js";

const rid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = (result) =>
  CommandResponseV1Schema.parse({ protocolVersion: 1, requestId: rid, ok: true, result });

// A fabricated but well-formed digest — `provider.upsert`/`.remove`'s `digest` is an opaque CAS
// token to the Swift client (unlike `room.participants.list`'s `sourceDigest`, DaemonClient does not
// re-derive and compare this one), so no canonical-JSON recipe needs to back it here.
const fakeDigest = (byte) => `sha256:${byte.repeat(64)}`;

const keychainRef = (account) => ({
  schemaVersion: 1,
  kind: "macos-keychain",
  service: "app-factory-provider",
  account,
});

// Five configured instances: codex/claude/ollama authenticate outside the Keychain path (CLI
// session or loopback, never a bare key — `credentialReference: null`); two named OpenRouter
// instances, one with a stored BYOK reference and one not yet configured, so the Swift decode test
// sees both nullable-credential branches in one list.
const providers = [
  {
    key: "codex",
    family: "codex",
    model: "gpt-5-codex",
    displayName: "Codex",
    credentialReference: null,
  },
  {
    key: "claude",
    family: "claude",
    model: "claude-sonnet-4-5",
    displayName: "Claude",
    credentialReference: null,
  },
  {
    key: "ollama",
    family: "ollama",
    model: "qwen2.5-coder:14b",
    displayName: "Ollama",
    credentialReference: null,
  },
  {
    key: "openrouter-fast",
    family: "openrouter",
    model: "google/gemini-2.5-flash",
    displayName: "OpenRouter — fast",
    credentialReference: keychainRef("openrouter-fast"),
  },
  {
    key: "openrouter-deep",
    family: "openrouter",
    model: "anthropic/claude-opus-4.1",
    displayName: "OpenRouter — deep",
    credentialReference: null,
  },
];

const fixtures = {
  "provider-list.response.json": ok({ operation: "provider.list", providers }),
  "provider-upsert.response.json": ok({
    operation: "provider.upsert",
    instance: {
      key: "openrouter-batch",
      family: "openrouter",
      model: "meta-llama/llama-3.3-70b",
      displayName: "OpenRouter — batch",
      credentialReference: null,
    },
    created: true,
    digest: fakeDigest("b"),
  }),
  "provider-remove.response.json": ok({
    operation: "provider.remove",
    removed: true,
    digest: fakeDigest("c"),
  }),
  "provider-credential-set.response.json": ok({
    operation: "provider.credential.set",
    key: "openrouter-fast",
    credentialReference: keychainRef("openrouter-fast"),
  }),
  // One `ok` (real latency + version), one `unreachable` (network probe failed), one
  // `not-configured` (no instance at that key), one `blocked` (the containment-attestation gate,
  // Architecture decision 3) — every `ProviderHealthStatus` case a client must render.
  "provider-health.response.json": ok({
    operation: "provider.health",
    reports: [
      { key: "codex", report: { status: "ok", detail: null, latencyMs: 340, version: "0.42.0" } },
      {
        key: "claude",
        report: {
          status: "unreachable",
          detail: "connection refused",
          latencyMs: null,
          version: null,
        },
      },
      {
        key: "gemini",
        report: { status: "not-configured", detail: null, latencyMs: null, version: null },
      },
      {
        key: "openrouter-fast",
        report: {
          status: "blocked",
          detail: "containment-attestation-missing",
          latencyMs: null,
          version: null,
        },
      },
    ],
  }),
  // `settings.get` before the first `settings.set` — the honest "never set" answer.
  "settings-get-unset.response.json": ok({
    operation: "settings.get",
    entry: { key: "default-provider", value: null, updatedAt: null },
  }),
  "settings-get-set.response.json": ok({
    operation: "settings.get",
    entry: { key: "default-provider", value: "codex", updatedAt: "2026-08-16T18:20:00.000Z" },
  }),
  "settings-set.response.json": ok({
    operation: "settings.set",
    entry: { key: "default-provider", value: "codex", updatedAt: "2026-08-16T18:20:00.000Z" },
  }),
};

const dir = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url).pathname;
for (const [name, value] of Object.entries(fixtures)) {
  writeFileSync(dir + name, JSON.stringify(value, null, 2) + "\n");
}
console.log("wrote", Object.keys(fixtures).length, "provider/settings fixtures");
