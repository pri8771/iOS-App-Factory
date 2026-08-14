/**
 * Environment name allowlist shared by every Codex-backed local execution
 * profile. Both the byte-pinned Swift Greeter fixture profile
 * (`swift-greeter-codex-v1`) and the config-driven enrolled-project profile
 * (`enrolled-codex-v1`) invoke the Codex CLI, and any trusted verification
 * plans it runs, through this exact same bounded set of environment names.
 * Keeping the allowlist in one module (rather than duplicated per profile)
 * means every real-identity profile is pinned to the same hermetic
 * environment surface by construction.
 */
export const CODEX_PROFILE_ENVIRONMENT_NAMES = [
  "LANG",
  "LC_ALL",
  "PATH",
  "SWIFT_DETERMINISTIC_HASHING",
  "TMPDIR",
  "TZ",
] as const;

export const CODEX_PROFILE_INVOCATION_ENVIRONMENT_NAMES = [
  "CODEX_HOME",
  ...CODEX_PROFILE_ENVIRONMENT_NAMES,
  "NO_COLOR",
  "RUST_LOG",
  "TERM",
].sort();
