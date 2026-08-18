import { parseCredentialReference, type CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import { IsoInstantSchema, Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

import {
  createProviderHttpRequest,
  performProviderHttpRequest,
  providerBaseUrl,
  providerUrl,
  type BoundedProviderHttpTransport,
  type ProviderHttpHeaderV1,
  type ValidatedProviderHttpResponse,
} from "./http.js";
import {
  array,
  bool,
  boundedIdentifier,
  enumeration,
  exact,
  exactOneOf,
  fail,
  isoInstant,
  jsonBytes,
  parseJsonBytes,
  record,
  repositoryName,
  sha256Canonical,
  text,
  zeroBytes,
} from "./validation.js";

/**
 * GitHub owner binding: the durable, digest-bound artifact that closes the
 * first activation blocker in this package's README ("an authenticated
 * GitHub viewer/organization proof that binds the enrolled owner to
 * `ownerNodeId` before any repository mutation").
 *
 * `createGitHubOwnerBinding` makes exactly one read-only GraphQL request
 * through an injected `BoundedProviderHttpTransport` (so the credential is
 * resolved just-in-time by the trusted transport and never seen here) and
 * turns the answer into a `GitHubOwnerBindingV1`:
 *
 * - `viewerLogin` / `viewerNodeId` — the authenticated identity the
 *   credential resolves to;
 * - `ownerLogin` / `ownerNodeId` / `ownerType` — the enrolled repository
 *   owner as GitHub resolves it. For a `User` owner the viewer must *be*
 *   that user (a personal token binding someone else's account is
 *   rejected); for an `Organization` owner the viewer is the member the
 *   token was minted for and both identities are recorded;
 * - `enrolledRepositories` — the exact `owner/name` list the caller
 *   enrolled, every entry under `ownerLogin`;
 * - `observedRepositories` — the subset of those the credential can
 *   actually see, with GitHub's canonical `nameWithOwner`, node ID, and
 *   visibility. This is the credential's observed repository scope, not a
 *   claim about the token's configured permissions;
 * - `credentialReference` (Keychain service/account only — never a value)
 *   and `credentialOrigin` — the exact reference and HTTPS origin the
 *   binding was produced through; a consumer must refuse to reuse the
 *   binding with any other pair;
 * - `boundAt` and `bindingDigest` — the sha256 of the canonical JSON of
 *   every field above. `parseGitHubOwnerBinding` recomputes and compares
 *   it, so a hand-edited artifact fails closed.
 *
 * The module holds no network client, no credential access, and no
 * persistence: callers decide where the artifact lives (the operations
 * record for a manual live proof, a private runtime file for the daemon).
 */

export const GITHUB_OWNER_BINDING_SCHEMA_VERSION = 1 as const;

/**
 * GitHub's Keychain contract: the item holds the **bare token** (as GitHub
 * issues it), and the trusted transport derives the outbound header value
 * from it with this function (`createFetchProviderHttpTransport({
 * authorization: deriveGitHubBearerAuthorization })`). It runs inside the
 * broker's credential window, must not retain or log `secret`, and its
 * result still passes the transport's header-safety check. Shape-compatible
 * with `provider-transport`'s `ProviderAuthorizationDerivation` without
 * importing it (adapters never depend on the transport).
 */
export function deriveGitHubBearerAuthorization(secret: Uint8Array): string {
  return `Bearer ${Buffer.from(secret).toString("utf8")}`;
}

const DEFAULT_API_VERSION = "2022-11-28";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ENROLLED_REPOSITORIES = 32;
const MAX_GRAPHQL_ERRORS = 100;
const REPOSITORY_ALIAS_PREFIX = "repository";
const BINDING_LABEL = "GitHub owner binding";

export type GitHubOwnerTypeV1 = "User" | "Organization";

export type GitHubOwnerBindingRepositoryV1 = Readonly<{
  fullName: string;
  nodeId: string;
  visibility: "private" | "public";
}>;

export type GitHubOwnerBindingV1 = Readonly<{
  schemaVersion: typeof GITHUB_OWNER_BINDING_SCHEMA_VERSION;
  provider: "github";
  viewerLogin: string;
  viewerNodeId: string;
  ownerLogin: string;
  ownerNodeId: string;
  ownerType: GitHubOwnerTypeV1;
  enrolledRepositories: readonly string[];
  observedRepositories: readonly GitHubOwnerBindingRepositoryV1[];
  credentialReference: CredentialReferenceV1;
  credentialOrigin: string;
  boundAt: string;
  bindingDigest: Sha256Digest;
}>;

export type GitHubOwnerBindingClock = Readonly<{ now(): Date }>;

export type CreateGitHubOwnerBindingOptions = Readonly<{
  transport: BoundedProviderHttpTransport;
  apiBaseUrl: string;
  apiVersion?: string;
  /** The enrolled owner login the credential must resolve against. */
  owner: string;
  /** `owner/name` entries; every one must belong to `owner`. */
  enrolledRepositories: readonly string[];
  credentialReference: CredentialReferenceV1;
  clock?: GitHubOwnerBindingClock;
  requestTimeoutMs?: number;
}>;

/**
 * The exact fields a consumer must pin before trusting a binding for a
 * given adapter/observer construction. Everything is compared exactly
 * except `credentialOrigin`, which is compared as an HTTPS origin.
 */
export type GitHubOwnerBindingExpectation = Readonly<{
  owner: string;
  ownerNodeId: string;
  credentialReference: CredentialReferenceV1;
  credentialOrigin: string;
}>;

type BindingBody = Omit<GitHubOwnerBindingV1, "bindingDigest">;

function githubLogin(value: unknown, label: string): string {
  const parsed = text(value, label, 39);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(parsed)) fail(`${label} is invalid`);
  return parsed;
}

function ownerOf(fullName: string): string {
  return fullName.slice(0, fullName.indexOf("/"));
}

function enrolledRepositoryList(value: unknown, owner: string): readonly string[] {
  const list = array(value, `${BINDING_LABEL} enrolled repositories`, MAX_ENROLLED_REPOSITORIES);
  if (list.length === 0) fail(`${BINDING_LABEL} must enroll at least one repository`);
  const names = list.map((item) => repositoryName(item));
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    fail(`${BINDING_LABEL} enrolled repositories must be unique`);
  }
  for (const name of names) {
    if (ownerOf(name).toLowerCase() !== owner.toLowerCase()) {
      fail(`${BINDING_LABEL} enrolled repository ${name} does not belong to ${owner}`);
    }
  }
  return names;
}

function credentialOriginOf(value: unknown): string {
  const base = providerBaseUrl(value, `${BINDING_LABEL} credential origin`);
  if (base.pathname !== "" && base.pathname !== "/") {
    fail(`${BINDING_LABEL} credential origin must be a bare HTTPS origin`);
  }
  return base.origin;
}

function timeoutMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 120_000) {
    fail("GitHub owner binding request timeout must be an integer from 100 through 120000");
  }
  return value;
}

function headers(apiVersion: string): readonly ProviderHttpHeaderV1[] {
  return [
    { name: "accept", value: "application/vnd.github+json" },
    { name: "content-type", value: "application/json" },
    { name: "x-github-api-version", value: apiVersion },
  ];
}

function bindingQuery(repositoryCount: number): string {
  const variables = ["$owner: String!"];
  const selections = [
    "viewer { id login }",
    "repositoryOwner(login: $owner) { __typename id login }",
  ];
  for (let index = 0; index < repositoryCount; index += 1) {
    variables.push(`$name${String(index)}: String!`);
    selections.push(
      `${REPOSITORY_ALIAS_PREFIX}${String(index)}: repository(owner: $owner, name: $name${String(index)}) { id nameWithOwner isPrivate }`,
    );
  }
  return `query AppFactoryOwnerBinding(${variables.join(", ")}) { ${selections.join(" ")} }`;
}

function repositoryAliasIndex(value: unknown): number | null {
  if (typeof value !== "string" || !value.startsWith(REPOSITORY_ALIAS_PREFIX)) return null;
  const suffix = value.slice(REPOSITORY_ALIAS_PREFIX.length);
  if (!/^(?:0|[1-9][0-9]*)$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

/**
 * GitHub answers a query that names a repository the credential cannot see
 * with `null` for that alias plus a `NOT_FOUND` error whose `path` is the
 * alias. Those errors are the observed-scope signal, not a failure. Any
 * other error (bad query, forbidden viewer, rate limit, ...) fails closed.
 */
function assertOnlyRepositoryScopeErrors(errors: readonly unknown[], repositoryCount: number) {
  for (const entry of errors) {
    const error = record(entry, "GitHub GraphQL error");
    const path = Array.isArray(error.path) ? error.path : null;
    const index = path !== null && path.length === 1 ? repositoryAliasIndex(path[0]) : null;
    if (index === null || index >= repositoryCount) {
      fail("GitHub owner binding query returned an error outside repository visibility");
    }
  }
}

function parseObservedRepository(
  value: unknown,
  enrolled: string,
): GitHubOwnerBindingRepositoryV1 | null {
  if (value === null) return null;
  const source = record(value, "GitHub owner binding repository node");
  exact(source, ["id", "nameWithOwner", "isPrivate"], "GitHub owner binding repository node");
  const fullName = repositoryName(source.nameWithOwner);
  if (fullName.toLowerCase() !== enrolled.toLowerCase()) {
    fail(`GitHub returned repository ${fullName} for enrolled repository ${enrolled}`);
  }
  return {
    fullName,
    nodeId: boundedIdentifier(source.id, "GitHub repository node ID", 160),
    visibility: bool(source.isPrivate, "GitHub repository privacy") ? "private" : "public",
  };
}

function bindingDigestOf(body: BindingBody): Sha256Digest {
  return sha256Canonical(body);
}

async function postBindingQuery(
  options: CreateGitHubOwnerBindingOptions,
  input: Readonly<{
    base: URL;
    apiVersion: string;
    credentialReference: CredentialReferenceV1;
    query: string;
    variables: Readonly<Record<string, string>>;
    deadline: string;
    signal: AbortSignal;
  }>,
): Promise<Readonly<Record<string, unknown>>> {
  const body = jsonBytes({ query: input.query, variables: input.variables });
  let response: ValidatedProviderHttpResponse | undefined;
  try {
    const request = createProviderHttpRequest({
      method: "POST",
      url: providerUrl(input.base, "/graphql"),
      headers: headers(input.apiVersion),
      body,
      credentialReference: input.credentialReference,
      credentialOrigin: input.base.origin,
      deadline: IsoInstantSchema.parse(input.deadline),
      signal: input.signal,
    });
    response = await performProviderHttpRequest(options.transport, request);
    if (response.status !== 200) {
      fail(`GitHub owner binding query returned HTTP ${String(response.status)}`);
    }
    const value = record(
      parseJsonBytes(response.body, "GitHub owner binding response"),
      "GitHub owner binding response",
    );
    exactOneOf(value, [["data"], ["data", "errors"]], "GitHub owner binding response");
    return value;
  } finally {
    zeroBytes(body);
    if (response !== undefined) zeroBytes(response.body);
  }
}

/**
 * Performs the read-only viewer/owner proof through `options.transport` and
 * returns the digest-bound binding. Throws (`ProviderResponseError` /
 * `ProviderHttpContractError` / transport errors) rather than returning a
 * partial binding when anything about the answer is not exactly what the
 * enrollment expects.
 */
export async function createGitHubOwnerBinding(
  options: CreateGitHubOwnerBindingOptions,
  signal: AbortSignal,
): Promise<GitHubOwnerBindingV1> {
  const base = providerBaseUrl(options.apiBaseUrl, "GitHub API base URL");
  const apiVersion = text(options.apiVersion ?? DEFAULT_API_VERSION, "GitHub API version", 40);
  const owner = githubLogin(options.owner, "GitHub owner");
  const enrolledRepositories = enrolledRepositoryList(options.enrolledRepositories, owner);
  const credentialReference = parseCredentialReference(options.credentialReference);
  const clock = options.clock ?? { now: () => new Date() };
  const requestTimeoutMs = timeoutMs(options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS);
  const startedAt = clock.now();

  const variables: Record<string, string> = { owner };
  enrolledRepositories.forEach((fullName, index) => {
    variables[`name${String(index)}`] = fullName.slice(fullName.indexOf("/") + 1);
  });
  const value = await postBindingQuery(options, {
    base,
    apiVersion,
    credentialReference,
    query: bindingQuery(enrolledRepositories.length),
    variables,
    deadline: new Date(startedAt.getTime() + requestTimeoutMs).toISOString(),
    signal,
  });

  if ("errors" in value) {
    assertOnlyRepositoryScopeErrors(
      array(value.errors, "GitHub GraphQL errors", MAX_GRAPHQL_ERRORS),
      enrolledRepositories.length,
    );
  }
  const data = record(value.data, "GitHub owner binding data");
  exact(
    data,
    [
      "viewer",
      "repositoryOwner",
      ...enrolledRepositories.map((_, index) => `${REPOSITORY_ALIAS_PREFIX}${String(index)}`),
    ],
    "GitHub owner binding data",
  );

  const viewer = record(data.viewer, "GitHub viewer");
  exact(viewer, ["id", "login"], "GitHub viewer");
  const viewerLogin = githubLogin(viewer.login, "GitHub viewer login");
  const viewerNodeId = boundedIdentifier(viewer.id, "GitHub viewer node ID", 160);

  if (data.repositoryOwner === null) {
    fail(`GitHub could not resolve the enrolled owner ${owner} for this credential`);
  }
  const repositoryOwner = record(data.repositoryOwner, "GitHub repository owner");
  exact(repositoryOwner, ["__typename", "id", "login"], "GitHub repository owner");
  const ownerType = enumeration(
    repositoryOwner.__typename,
    ["User", "Organization"] as const,
    "GitHub repository owner type",
  );
  const ownerLogin = githubLogin(repositoryOwner.login, "GitHub repository owner login");
  const ownerNodeId = boundedIdentifier(repositoryOwner.id, "GitHub owner node ID", 160);
  if (ownerLogin.toLowerCase() !== owner.toLowerCase()) {
    fail(`GitHub resolved owner ${ownerLogin} for the enrolled owner ${owner}`);
  }
  if (ownerType === "User" && (viewerLogin !== ownerLogin || viewerNodeId !== ownerNodeId)) {
    fail(
      `the credential authenticates as ${viewerLogin}, not the enrolled user owner ${ownerLogin}`,
    );
  }

  const observedRepositories: GitHubOwnerBindingRepositoryV1[] = [];
  enrolledRepositories.forEach((fullName, index) => {
    const observed = parseObservedRepository(
      data[`${REPOSITORY_ALIAS_PREFIX}${String(index)}`],
      fullName,
    );
    if (observed !== null) observedRepositories.push(observed);
  });

  const body: BindingBody = {
    schemaVersion: GITHUB_OWNER_BINDING_SCHEMA_VERSION,
    provider: "github",
    viewerLogin,
    viewerNodeId,
    ownerLogin,
    ownerNodeId,
    ownerType,
    enrolledRepositories,
    observedRepositories,
    credentialReference,
    credentialOrigin: base.origin,
    boundAt: isoInstant(clock.now().toISOString(), "GitHub owner binding time"),
  };
  return { ...body, bindingDigest: bindingDigestOf(body) };
}

/**
 * Strictly re-validates a persisted binding (exact keys, bounded fields,
 * every enrolled repository under `ownerLogin`, every observed repository
 * one of the enrolled ones) and recomputes `bindingDigest`; a mismatch means
 * the artifact was edited after it was produced and is rejected.
 */
export function parseGitHubOwnerBinding(value: unknown): GitHubOwnerBindingV1 {
  const source = record(value, BINDING_LABEL);
  exact(
    source,
    [
      "schemaVersion",
      "provider",
      "viewerLogin",
      "viewerNodeId",
      "ownerLogin",
      "ownerNodeId",
      "ownerType",
      "enrolledRepositories",
      "observedRepositories",
      "credentialReference",
      "credentialOrigin",
      "boundAt",
      "bindingDigest",
    ],
    BINDING_LABEL,
  );
  if (source.schemaVersion !== GITHUB_OWNER_BINDING_SCHEMA_VERSION) {
    fail(`${BINDING_LABEL} schema version is unsupported`);
  }
  if (source.provider !== "github") fail(`${BINDING_LABEL} provider is unsupported`);
  const ownerLogin = githubLogin(source.ownerLogin, `${BINDING_LABEL} owner login`);
  const ownerType = enumeration(
    source.ownerType,
    ["User", "Organization"] as const,
    `${BINDING_LABEL} owner type`,
  );
  const viewerLogin = githubLogin(source.viewerLogin, `${BINDING_LABEL} viewer login`);
  const viewerNodeId = boundedIdentifier(source.viewerNodeId, `${BINDING_LABEL} viewer node ID`);
  const ownerNodeId = boundedIdentifier(source.ownerNodeId, `${BINDING_LABEL} owner node ID`);
  if (ownerType === "User" && (viewerLogin !== ownerLogin || viewerNodeId !== ownerNodeId)) {
    fail(`${BINDING_LABEL} viewer does not match its user owner`);
  }
  const enrolledRepositories = enrolledRepositoryList(source.enrolledRepositories, ownerLogin);
  const enrolledLower = new Set(enrolledRepositories.map((name) => name.toLowerCase()));
  const observedRepositories = array(
    source.observedRepositories,
    `${BINDING_LABEL} observed repositories`,
    MAX_ENROLLED_REPOSITORIES,
  ).map((item): GitHubOwnerBindingRepositoryV1 => {
    const entry = record(item, `${BINDING_LABEL} observed repository`);
    exact(entry, ["fullName", "nodeId", "visibility"], `${BINDING_LABEL} observed repository`);
    const fullName = repositoryName(entry.fullName);
    if (!enrolledLower.has(fullName.toLowerCase())) {
      fail(`${BINDING_LABEL} observed repository ${fullName} was not enrolled`);
    }
    return {
      fullName,
      nodeId: boundedIdentifier(entry.nodeId, `${BINDING_LABEL} repository node ID`),
      visibility: enumeration(
        entry.visibility,
        ["private", "public"] as const,
        `${BINDING_LABEL} repository visibility`,
      ),
    };
  });
  if (
    new Set(observedRepositories.map((entry) => entry.fullName.toLowerCase())).size !==
    observedRepositories.length
  ) {
    fail(`${BINDING_LABEL} observed repositories must be unique`);
  }
  const body: BindingBody = {
    schemaVersion: GITHUB_OWNER_BINDING_SCHEMA_VERSION,
    provider: "github",
    viewerLogin,
    viewerNodeId,
    ownerLogin,
    ownerNodeId,
    ownerType,
    enrolledRepositories,
    observedRepositories,
    credentialReference: parseCredentialReference(source.credentialReference),
    credentialOrigin: credentialOriginOf(source.credentialOrigin),
    boundAt: isoInstant(source.boundAt, `${BINDING_LABEL} bound time`),
  };
  const bindingDigest = Sha256DigestSchema.parse(source.bindingDigest);
  if (bindingDigestOf(body) !== bindingDigest) {
    fail(`${BINDING_LABEL} digest does not match its contents`);
  }
  return { ...body, bindingDigest };
}

/**
 * The consumer-side gate: before an adapter or observer is constructed with
 * an `owner`/`ownerNodeId`/credential pair, the pair must be exactly the one
 * a valid binding proved. Returns the parsed binding so callers can chain
 * `assertGitHubOwnerBindingCoversRepository`.
 */
export function assertGitHubOwnerBindingMatches(
  value: unknown,
  expected: GitHubOwnerBindingExpectation,
): GitHubOwnerBindingV1 {
  const binding = parseGitHubOwnerBinding(value);
  const owner = githubLogin(expected.owner, "expected GitHub owner");
  const credentialReference = parseCredentialReference(expected.credentialReference);
  if (binding.ownerLogin !== owner) fail(`${BINDING_LABEL} owner login does not match`);
  if (binding.ownerNodeId !== boundedIdentifier(expected.ownerNodeId, "expected owner node ID")) {
    fail(`${BINDING_LABEL} owner node ID does not match`);
  }
  if (
    binding.credentialReference.service !== credentialReference.service ||
    binding.credentialReference.account !== credentialReference.account
  ) {
    fail(`${BINDING_LABEL} credential reference does not match`);
  }
  if (binding.credentialOrigin !== credentialOriginOf(expected.credentialOrigin)) {
    fail(`${BINDING_LABEL} credential origin does not match`);
  }
  return binding;
}

/**
 * Whether the binding observed `fullName` (case-insensitively, as GitHub
 * resolves repository names) as visible to the bound credential. Fails
 * closed for a repository that was enrolled but not visible at binding
 * time, and for one that was never enrolled at all.
 */
export function assertGitHubOwnerBindingCoversRepository(
  binding: GitHubOwnerBindingV1,
  fullName: string,
): GitHubOwnerBindingRepositoryV1 {
  const wanted = repositoryName(fullName).toLowerCase();
  const observed = binding.observedRepositories.find(
    (entry) => entry.fullName.toLowerCase() === wanted,
  );
  if (observed === undefined) {
    fail(`${BINDING_LABEL} does not cover repository ${fullName}`);
  }
  return observed;
}
