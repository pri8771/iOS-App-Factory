import {
  parseCredentialReference,
  type AdapterPreflightReportV1,
  type CredentialReferenceV1,
  type EffectReconciliationInput,
  type EffectReconciliationResult,
  type EffectSendResult,
  type ExternalProviderAdapter,
} from "@app-factory/adapter-sdk";
import {
  ExternalResourceV1Schema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  type ExternalEffectV1,
  type ExternalResourceV1,
  type IsoInstant,
} from "@app-factory/contracts";
import {
  digestCanonical,
  parseGitHubCheckSnapshot,
  parseGitHubDeliverySnapshot,
  parseGitHubPullRequestSnapshot,
  parseGitHubRepositorySnapshot,
  type CorrelationQueryV1,
  type GitHubCheckSnapshotV1,
  type GitHubDeliverySnapshotV1,
  type GitHubPullRequestSnapshotV1,
  type GitHubRepositorySnapshotV1,
  type ProviderResourceObservationV1,
  type ReadOnlyCorrelationPort,
} from "@app-factory/work-tracking-integrations";

import {
  createProviderHttpRequest,
  headerValue,
  performProviderHttpRequest,
  providerBaseUrl,
  providerUrl,
  type BoundedProviderHttpTransport,
  type ProviderHttpHeaderV1,
  type ValidatedProviderHttpResponse,
} from "./http.js";
import {
  readVerifiedEffectPayloadJson,
  requireEffectPayloadReader,
  type EffectPayloadReader,
} from "./payload.js";
import {
  array,
  bool,
  boundedIdentifier,
  enumeration,
  exact,
  exactOneOf,
  fail,
  gitSha,
  isoInstant,
  jsonBytes,
  nullableText,
  operationMarker,
  parseJsonBytes,
  possiblyEmptyText,
  record,
  repositoryName,
  safeUrl,
  sha256Canonical,
  text,
  zeroBytes,
} from "./validation.js";

const ADAPTER_ID = "github.graphql-http";
const ADAPTER_VERSION = "1.0.0";
const DEFAULT_API_VERSION = "2022-11-28";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RECONCILE_DELAY_MS = 30_000;
const MAX_PAGES = 20;
const MARKER_PREFIX = "App Factory operation: ";

const PREFLIGHT_QUERY = `query AppFactoryPreflight($owner: String!) { viewer { id login } repositoryOwner(login: $owner) { __typename ... on Organization { id viewerCanCreateRepositories } ... on User { id login } } }`;
const CREATE_REPOSITORY_MUTATION = `mutation AppFactoryCreateRepository($input: CreateRepositoryInput!) { createRepository(input: $input) { clientMutationId repository { id nameWithOwner url visibility isArchived description defaultBranchRef { name } } } }`;
const REPOSITORY_QUERY = `query AppFactoryRepository($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id nameWithOwner url visibility isArchived description defaultBranchRef { name oid branchProtectionRule { id } } } }`;
const PULL_REQUEST_QUERY = `query AppFactoryPullRequest($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { id url state isDraft baseRefName baseRefOid headRefName headRefOid body merged mergeCommit { oid } mergedAt mergedBy { id } } } }`;
const CHECKS_QUERY = `query AppFactoryChecks($owner: String!, $name: String!, $oid: GitObjectID!, $cursor: String) { repository(owner: $owner, name: $name) { object(oid: $oid) { __typename ... on Commit { statusCheckRollup { contexts(first: 100, after: $cursor) { nodes { __typename ... on CheckRun { id name status conclusion detailsUrl app { slug } } } pageInfo { hasNextPage endCursor } } } } } } }`;
const COMMENTS_QUERY = `query AppFactoryComments($owner: String!, $name: String!, $number: Int!, $cursor: String) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { comments(first: 100, after: $cursor) { nodes { id url body updatedAt } pageInfo { hasNextPage endCursor } } } } }`;

export type ProviderClock = Readonly<{ now(): Date }>;

export type GitHubReadObserverOptions = Readonly<{
  transport: BoundedProviderHttpTransport;
  apiBaseUrl: string;
  apiVersion?: string;
  owner: string;
  ownerNodeId: string;
  credentialReference: CredentialReferenceV1;
  clock?: ProviderClock;
  requestTimeoutMs?: number;
  reconcileDelayMs?: number;
}>;

export type GitHubHttpAdapterOptions = GitHubReadObserverOptions &
  Readonly<{ payloadReader: EffectPayloadReader }>;

export type GitHubPullRequestCommentObservationV1 = Readonly<{
  schemaVersion: 1;
  repository: string;
  pullRequestNumber: number;
  nodeId: string;
  url: string;
  bodyDigest: `sha256:${string}`;
  operationMarker: string | null;
  updatedAt: string;
  providerRevision: string;
  observedAt: string;
}>;

export type GitHubReadObserver = Readonly<{
  observeRepository(repository: string, signal: AbortSignal): Promise<GitHubRepositorySnapshotV1>;
  observePullRequest(
    repository: string,
    number: number,
    signal: AbortSignal,
  ): Promise<GitHubPullRequestSnapshotV1>;
  observeChecks(
    repository: string,
    commitSha: string,
    signal: AbortSignal,
  ): Promise<readonly GitHubCheckSnapshotV1[]>;
  observePullRequestComments(
    repository: string,
    number: number,
    signal: AbortSignal,
  ): Promise<readonly GitHubPullRequestCommentObservationV1[]>;
  observeDelivery(
    repository: string,
    pullRequestNumber: number | null,
    signal: AbortSignal,
  ): Promise<GitHubDeliverySnapshotV1>;
}> &
  ReadOnlyCorrelationPort;

type GitHubContext = Readonly<{
  transport: BoundedProviderHttpTransport;
  base: URL;
  apiVersion: string;
  owner: string;
  ownerNodeId: string;
  credentialReference: CredentialReferenceV1;
  clock: ProviderClock;
  requestTimeoutMs: number;
  reconcileDelayMs: number;
}>;

type GitHubMutationContext = GitHubContext & Readonly<{ payloadReader: EffectPayloadReader }>;

type GraphqlResult = Readonly<{
  status: number;
  etag: string | null;
  value: Readonly<Record<string, unknown>>;
}>;

function boundedMilliseconds(value: number, label: string, maximum = 120_000): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > maximum) {
    fail(`${label} must be an integer from 100 through ${String(maximum)}`);
  }
  return value;
}

function githubOwner(value: unknown): string {
  const parsed = text(value, "GitHub owner", 39);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(parsed)) {
    fail("GitHub owner is invalid");
  }
  return parsed;
}

function createContext(options: GitHubReadObserverOptions): GitHubContext {
  return {
    transport: options.transport,
    base: providerBaseUrl(options.apiBaseUrl, "GitHub API base URL"),
    apiVersion: text(options.apiVersion ?? DEFAULT_API_VERSION, "GitHub API version", 40),
    owner: githubOwner(options.owner),
    ownerNodeId: boundedIdentifier(options.ownerNodeId, "GitHub owner node ID", 160),
    credentialReference: parseCredentialReference(options.credentialReference),
    clock: options.clock ?? { now: () => new Date() },
    requestTimeoutMs: boundedMilliseconds(
      options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "GitHub request timeout",
    ),
    reconcileDelayMs: boundedMilliseconds(
      options.reconcileDelayMs ?? DEFAULT_RECONCILE_DELAY_MS,
      "GitHub reconciliation delay",
      24 * 60 * 60 * 1_000,
    ),
  };
}

function createMutationContext(options: GitHubHttpAdapterOptions): GitHubMutationContext {
  return {
    ...createContext(options),
    payloadReader: requireEffectPayloadReader(options.payloadReader),
  };
}

function deadline(context: GitHubContext): IsoInstant {
  return IsoInstantSchema.parse(
    new Date(context.clock.now().getTime() + context.requestTimeoutMs).toISOString(),
  );
}

function later(context: GitHubContext): IsoInstant {
  return IsoInstantSchema.parse(
    new Date(context.clock.now().getTime() + context.reconcileDelayMs).toISOString(),
  );
}

function credentialsMatch(left: CredentialReferenceV1 | null, right: CredentialReferenceV1) {
  return (
    left !== null &&
    left.kind === right.kind &&
    left.schemaVersion === right.schemaVersion &&
    left.service === right.service &&
    left.account === right.account
  );
}

function headers(): readonly ProviderHttpHeaderV1[] {
  return [
    { name: "accept", value: "application/vnd.github+json" },
    { name: "content-type", value: "application/json" },
    { name: "x-github-api-version", value: DEFAULT_API_VERSION },
  ];
}

async function graphql(
  context: GitHubContext,
  input: Readonly<{
    query: string;
    variables: Readonly<Record<string, unknown>>;
    signal: AbortSignal;
    deadline: IsoInstant;
  }>,
): Promise<GraphqlResult> {
  const body = jsonBytes({ query: input.query, variables: input.variables });
  let response: ValidatedProviderHttpResponse | undefined;
  try {
    const request = createProviderHttpRequest({
      method: "POST",
      url: providerUrl(context.base, "/graphql"),
      headers: headers().map((header) =>
        header.name === "x-github-api-version" ? { ...header, value: context.apiVersion } : header,
      ),
      body,
      credentialReference: context.credentialReference,
      credentialOrigin: context.base.origin,
      deadline: input.deadline,
      signal: input.signal,
    });
    response = await performProviderHttpRequest(context.transport, request);
    if (response.status !== 200) {
      return { status: response.status, etag: headerValue(response, "etag"), value: {} };
    }
    const value = record(
      parseJsonBytes(response.body, "GitHub GraphQL response"),
      "GitHub response",
    );
    exactOneOf(value, [["data"], ["data", "errors"], ["errors"]], "GitHub response");
    if ("errors" in value) {
      array(value.errors, "GitHub GraphQL errors", 100);
    }
    return { status: response.status, etag: headerValue(response, "etag"), value };
  } finally {
    zeroBytes(body);
    if (response !== undefined) zeroBytes(response.body);
  }
}

function hasGraphqlErrors(result: GraphqlResult): boolean {
  return "errors" in result.value;
}

function data(result: GraphqlResult, label: string): Readonly<Record<string, unknown>> {
  if (result.status !== 200 || hasGraphqlErrors(result))
    fail(`${label} did not return usable data`);
  return record(result.value.data, `${label} data`);
}

function splitRepository(
  value: unknown,
): Readonly<{ owner: string; name: string; fullName: string }> {
  const fullName = repositoryName(value);
  const separator = fullName.indexOf("/");
  return {
    owner: githubOwner(fullName.slice(0, separator)),
    name: text(fullName.slice(separator + 1), "GitHub repository name", 100),
    fullName,
  };
}

type ParsedRepository = Readonly<{
  id: string;
  fullName: string;
  url: string;
  visibility: "private" | "public";
  archived: boolean;
  description: string | null;
  defaultBranch: string | null;
  defaultBranchSha: string | null;
  protected: boolean;
}>;

function parseRepositoryNode(value: unknown, includeBranch: boolean): ParsedRepository {
  const source = record(value, "GitHub repository node");
  exact(
    source,
    ["id", "nameWithOwner", "url", "visibility", "isArchived", "description", "defaultBranchRef"],
    "GitHub repository node",
  );
  let defaultBranch: string | null = null;
  let defaultBranchSha: string | null = null;
  let protectedBranch = false;
  if (source.defaultBranchRef !== null) {
    const branch = record(source.defaultBranchRef, "GitHub default branch");
    exact(
      branch,
      includeBranch ? ["name", "oid", "branchProtectionRule"] : ["name"],
      "GitHub default branch",
    );
    defaultBranch = text(branch.name, "GitHub default branch", 255);
    if (includeBranch) {
      defaultBranchSha = gitSha(branch.oid, "GitHub default branch SHA");
      if (branch.branchProtectionRule !== null) {
        const protection = record(branch.branchProtectionRule, "GitHub branch protection rule");
        exact(protection, ["id"], "GitHub branch protection rule");
        boundedIdentifier(protection.id, "GitHub branch protection rule ID", 160);
        protectedBranch = true;
      }
    }
  }
  return {
    id: boundedIdentifier(source.id, "GitHub repository node ID", 160),
    fullName: repositoryName(source.nameWithOwner),
    url: safeUrl(source.url, "GitHub repository URL"),
    visibility:
      enumeration(source.visibility, ["PRIVATE", "PUBLIC"] as const, "GitHub visibility") ===
      "PRIVATE"
        ? "private"
        : "public",
    archived: bool(source.isArchived, "GitHub archived state"),
    description:
      source.description === null
        ? null
        : possiblyEmptyText(source.description, "GitHub repository description", 350),
    defaultBranch,
    defaultBranchSha,
    protected: protectedBranch,
  };
}

function providerRevision(etag: string | null, body: unknown): string {
  return etag ?? digestCanonical(body);
}

function repositoryExpectation(value: {
  visibility: "private" | "public";
  defaultBranch: string | null;
  archived: boolean;
}) {
  return sha256Canonical({
    visibility: value.visibility,
    defaultBranch: value.defaultBranch,
    archived: value.archived,
  });
}

function markerDescription(
  effect: ExternalEffectV1,
  expectedResourceDigest: ExternalEffectV1["payloadDigest"],
): string {
  const description = `${MARKER_PREFIX}${effect.operationMarker}; intent: ${effect.payloadDigest}; expected: ${expectedResourceDigest}`;
  if (description.length > 350) fail("GitHub repository marker description is too long");
  return description;
}

function parseRepositoryMetadata(description: string | null) {
  if (description === null) fail("GitHub repository is missing App Factory metadata");
  const match = /^App Factory operation: ([^;]+); intent: ([^;]+); expected: ([^;]+)$/.exec(
    description,
  );
  if (match === null) fail("GitHub repository metadata is malformed");
  return {
    marker: operationMarker(match[1]),
    payloadDigest: Sha256DigestSchema.parse(match[2]),
    expectedResourceDigest: Sha256DigestSchema.parse(match[3]),
  };
}

function currentRepositoryMetadata(repository: ParsedRepository) {
  const metadata = parseRepositoryMetadata(repository.description);
  if (
    repository.defaultBranch === null ||
    repositoryExpectation(repository) !== metadata.expectedResourceDigest
  ) {
    fail("GitHub repository fields drifted from their bound metadata");
  }
  return metadata;
}

function resourceFor(
  effect: ExternalEffectV1,
  repository: ParsedRepository,
  revision: string,
  observedAt: IsoInstant,
): ExternalResourceV1 {
  return ExternalResourceV1Schema.parse({
    schemaVersion: 1,
    effectId: effect.effectId,
    target: effect.target,
    providerResourceId: repository.id,
    providerUrl: repository.url,
    providerVersion: revision,
    observedDigest: sha256Canonical({ repository, marker: effect.operationMarker }),
    observedAt,
  });
}

function detail(value: Readonly<Record<string, unknown>>): Uint8Array {
  return jsonBytes({ schemaVersion: 1, ...value });
}

function rejected(code: string, retryable = false): EffectSendResult {
  return {
    kind: "rejected",
    code: NamespacedCodeSchema.parse(code),
    retryable,
    detail: detail({ kind: "rejected", code }),
  };
}

function ambiguous(context: GitHubContext, code: string, correlationKey: string): EffectSendResult {
  return {
    kind: "ambiguous",
    correlationKey,
    reconcileAfter: later(context),
    detail: detail({ kind: "ambiguous", code }),
  };
}

function parseRepositoryPayload(value: unknown) {
  const source = record(value, "GitHub repository payload");
  exact(
    source,
    [
      "projectId",
      "projectSlug",
      "displayName",
      "owner",
      "repository",
      "visibility",
      "defaultBranch",
    ],
    "GitHub repository payload",
  );
  if (source.defaultBranch !== "main") fail("GitHub repository default branch is unsupported");
  const owner = githubOwner(source.owner);
  const repository = text(source.repository, "GitHub repository name", 100);
  repositoryName(`${owner}/${repository}`);
  return {
    projectId: boundedIdentifier(source.projectId, "project ID", 80),
    projectSlug: text(source.projectSlug, "project slug", 80),
    displayName: text(source.displayName, "project display name", 160),
    owner,
    repository,
    visibility: enumeration(source.visibility, ["private", "public"] as const, "GitHub visibility"),
  };
}

type RepositoryIntent = Readonly<{
  payload: ReturnType<typeof parseRepositoryPayload>;
  fullName: string;
  expectedResourceDigest: ExternalEffectV1["payloadDigest"];
}>;

function repositoryIntent(
  context: GitHubContext,
  effect: ExternalEffectV1,
  payload: ReturnType<typeof parseRepositoryPayload>,
): RepositoryIntent {
  const fullName = `${payload.owner}/${payload.repository}`;
  if (
    effect.action !== "github.repository.ensure" ||
    effect.target.resourceType !== "github.repository" ||
    payload.owner !== context.owner ||
    fullName !== effect.target.resourceKey ||
    payload.projectId !== effect.subject.projectId ||
    !effect.operationMarker.startsWith("app-factory:v1:github:repository.ensure:")
  ) {
    fail("GitHub repository payload does not match the effect intent");
  }
  return {
    payload,
    fullName,
    expectedResourceDigest: repositoryExpectation({
      visibility: payload.visibility,
      defaultBranch: "main",
      archived: false,
    }),
  };
}

async function readRepositoryPayload(
  context: GitHubMutationContext,
  effect: ExternalEffectV1,
  signal: AbortSignal,
  operationDeadline: IsoInstant,
): Promise<ReturnType<typeof parseRepositoryPayload>> {
  return parseRepositoryPayload(
    await readVerifiedEffectPayloadJson(context.payloadReader, {
      payloadDigest: effect.payloadDigest,
      deadline: operationDeadline,
      signal,
      label: "GitHub effect payload",
    }),
  );
}

async function findRepository(
  context: GitHubContext,
  fullName: string,
  signal: AbortSignal,
  operationDeadline: IsoInstant,
): Promise<Readonly<{ repository: ParsedRepository | null; revision: string }>> {
  const identity = splitRepository(fullName);
  const result = await graphql(context, {
    query: REPOSITORY_QUERY,
    variables: { owner: identity.owner, name: identity.name },
    signal,
    deadline: operationDeadline,
  });
  if (result.status === 404) return { repository: null, revision: "not-found" };
  const root = data(result, "GitHub repository query");
  exact(root, ["repository"], "GitHub repository query data");
  const repository = root.repository === null ? null : parseRepositoryNode(root.repository, true);
  if (repository !== null && repository.fullName !== identity.fullName) {
    fail("GitHub returned a different repository identity");
  }
  return { repository, revision: providerRevision(result.etag, root) };
}

async function reconcileRepository(
  context: GitHubMutationContext,
  input: EffectReconciliationInput,
  intent: RepositoryIntent,
): Promise<EffectReconciliationResult> {
  let found: Awaited<ReturnType<typeof findRepository>>;
  try {
    found = await findRepository(
      context,
      input.effect.target.resourceKey,
      input.signal,
      input.deadline,
    );
  } catch {
    return {
      kind: "ambiguous",
      correlationKey: input.effect.operationMarker,
      reconcileAfter: later(context),
      detail: detail({ kind: "ambiguous", code: "github.reconcile.read-failed" }),
    };
  }
  if (found.repository === null) {
    return {
      kind: "not-found",
      correlationKey: input.effect.operationMarker,
      reconcileAfter: later(context),
      detail: detail({ kind: "not-found", code: "github.repository.not-found" }),
    };
  }
  let metadata: ReturnType<typeof parseRepositoryMetadata>;
  try {
    metadata = parseRepositoryMetadata(found.repository.description);
  } catch {
    return {
      kind: "manual-intervention",
      code: NamespacedCodeSchema.parse("github.repository.marker-collision"),
      detail: detail({ kind: "manual-intervention", code: "github.repository.marker-collision" }),
    };
  }
  if (
    metadata.marker !== input.effect.operationMarker ||
    metadata.payloadDigest !== input.effect.payloadDigest
  ) {
    return {
      kind: "manual-intervention",
      code: NamespacedCodeSchema.parse("github.repository.marker-collision"),
      detail: detail({ kind: "manual-intervention", code: "github.repository.marker-collision" }),
    };
  }
  if (metadata.expectedResourceDigest !== intent.expectedResourceDigest) {
    return {
      kind: "manual-intervention",
      code: NamespacedCodeSchema.parse("github.repository.intent-drift"),
      detail: detail({ kind: "manual-intervention", code: "github.repository.intent-drift" }),
    };
  }
  if (found.repository.defaultBranch === null) {
    return {
      kind: "ambiguous",
      correlationKey: input.effect.operationMarker,
      reconcileAfter: later(context),
      detail: detail({ kind: "ambiguous", code: "github.repository.default-branch-pending" }),
    };
  }
  if (repositoryExpectation(found.repository) !== intent.expectedResourceDigest) {
    return {
      kind: "manual-intervention",
      code: NamespacedCodeSchema.parse("github.repository.intent-drift"),
      detail: detail({ kind: "manual-intervention", code: "github.repository.intent-drift" }),
    };
  }
  const observedAt = IsoInstantSchema.parse(context.clock.now().toISOString());
  return {
    kind: "observed",
    correlationKey: input.effect.operationMarker,
    resource: resourceFor(input.effect, found.repository, found.revision, observedAt),
    detail: detail({
      kind: "observed",
      resourceId: found.repository.id,
      revision: found.revision,
      marker: input.effect.operationMarker,
    }),
  };
}

function preflightCapabilities(authenticated: boolean, createAvailable: boolean) {
  const capabilities = [
    "github.repository.read",
    "github.repository.create",
    "github.branch.read",
    "github.pull-request.read",
    "github.checks.read",
    "github.merge.read",
  ] as const;
  return capabilities.map((capability) => {
    const available = capability === "github.repository.create" ? createAvailable : authenticated;
    return {
      capability: NamespacedCodeSchema.parse(capability),
      available,
      blockerCode: available ? null : NamespacedCodeSchema.parse("github.preflight.unavailable"),
      summary: available
        ? `${capability} authenticated through the injected bounded transport.`
        : `${capability} could not be authenticated by the injected bounded transport.`,
    };
  });
}

export function createGitHubHttpAdapter(
  options: GitHubHttpAdapterOptions,
): ExternalProviderAdapter {
  const context = createMutationContext(options);
  return {
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    provider: "github",
    async preflight(signal): Promise<AdapterPreflightReportV1> {
      let authenticated: boolean;
      let createAvailable: boolean;
      try {
        const result = await graphql(context, {
          query: PREFLIGHT_QUERY,
          variables: { owner: context.owner },
          signal,
          deadline: deadline(context),
        });
        const root = data(result, "GitHub preflight");
        exact(root, ["viewer", "repositoryOwner"], "GitHub preflight data");
        const viewer = record(root.viewer, "GitHub viewer");
        exact(viewer, ["id", "login"], "GitHub viewer");
        const viewerId = boundedIdentifier(viewer.id, "GitHub viewer node ID", 160);
        const viewerLogin = githubOwner(viewer.login);
        const owner = record(root.repositoryOwner, "GitHub repository owner");
        if (owner.__typename === "Organization") {
          exact(
            owner,
            ["__typename", "id", "viewerCanCreateRepositories"],
            "GitHub organization owner",
          );
          createAvailable =
            boundedIdentifier(owner.id, "GitHub owner node ID", 160) === context.ownerNodeId &&
            bool(owner.viewerCanCreateRepositories, "GitHub repository creation permission");
        } else if (owner.__typename === "User") {
          exact(owner, ["__typename", "id", "login"], "GitHub user owner");
          createAvailable =
            boundedIdentifier(owner.id, "GitHub owner node ID", 160) === context.ownerNodeId &&
            githubOwner(owner.login) === context.owner &&
            viewerId === context.ownerNodeId &&
            viewerLogin === context.owner;
        } else {
          fail("GitHub repository owner type is unsupported");
        }
        authenticated = true;
      } catch {
        authenticated = false;
        createAvailable = false;
      }
      return {
        schemaVersion: 1,
        adapterId: NamespacedCodeSchema.parse(ADAPTER_ID),
        adapterVersion: ADAPTER_VERSION,
        provider: "github",
        checkedAt: IsoInstantSchema.parse(context.clock.now().toISOString()),
        credentialReference: context.credentialReference,
        capabilities: preflightCapabilities(authenticated, createAvailable),
      };
    },
    async send(input): Promise<EffectSendResult> {
      if (!credentialsMatch(input.credentialReference, context.credentialReference)) {
        return rejected("github.credential-reference-mismatch");
      }
      const effect = input.effect;
      if (
        effect.action !== "github.repository.ensure" ||
        effect.target.resourceType !== "github.repository"
      ) {
        return rejected("github.action.unsupported");
      }
      let payload: ReturnType<typeof parseRepositoryPayload>;
      try {
        payload = await readRepositoryPayload(context, effect, input.signal, input.deadline);
      } catch {
        return rejected("github.payload-authority.unavailable");
      }
      let intent: RepositoryIntent;
      try {
        intent = repositoryIntent(context, effect, payload);
      } catch {
        return rejected("github.intent.mismatch");
      }
      const mutationBody = {
        name: payload.repository,
        ownerId: context.ownerNodeId,
        visibility: payload.visibility === "private" ? "PRIVATE" : "PUBLIC",
        description: markerDescription(effect, intent.expectedResourceDigest),
        clientMutationId: effect.operationMarker,
      };
      let result: GraphqlResult;
      try {
        await input.assertActive();
        result = await graphql(context, {
          query: CREATE_REPOSITORY_MUTATION,
          variables: { input: mutationBody },
          signal: input.signal,
          deadline: input.deadline,
        });
      } catch {
        return ambiguous(
          context,
          "github.repository.transport-or-response-unknown",
          effect.operationMarker,
        );
      }
      if (result.status === 401 || result.status === 403) {
        return rejected("github.authorization.denied");
      }
      if (result.status === 429) return rejected("github.rate-limited", true);
      if (result.status !== 200 || hasGraphqlErrors(result)) {
        return ambiguous(
          context,
          "github.repository.provider-outcome-unknown",
          effect.operationMarker,
        );
      }
      try {
        const root = data(result, "GitHub create repository");
        exact(root, ["createRepository"], "GitHub create repository data");
        const created = record(root.createRepository, "GitHub create repository result");
        exact(created, ["clientMutationId", "repository"], "GitHub create repository result");
        if (created.clientMutationId !== effect.operationMarker) {
          fail("GitHub did not echo the operation marker");
        }
        const repository = parseRepositoryNode(created.repository, false);
        if (
          repository.fullName !== intent.fullName ||
          repository.description !== mutationBody.description
        ) {
          fail("GitHub created repository does not match the effect intent");
        }
        if (repository.defaultBranch === null) {
          return ambiguous(
            context,
            "github.repository.default-branch-pending",
            effect.operationMarker,
          );
        }
        if (repositoryExpectation(repository) !== intent.expectedResourceDigest) {
          return ambiguous(
            context,
            "github.repository.success-response-intent-drift",
            effect.operationMarker,
          );
        }
        const revision = providerRevision(result.etag, root);
        const observedAt = IsoInstantSchema.parse(context.clock.now().toISOString());
        return {
          kind: "observed",
          correlationKey: effect.operationMarker,
          resource: resourceFor(effect, repository, revision, observedAt),
          detail: detail({
            kind: "observed",
            resourceId: repository.id,
            revision,
            marker: effect.operationMarker,
          }),
        };
      } catch {
        return ambiguous(
          context,
          "github.repository.success-response-invalid",
          effect.operationMarker,
        );
      }
    },
    async reconcile(input): Promise<EffectReconciliationResult> {
      if (!credentialsMatch(input.credentialReference, context.credentialReference)) {
        return {
          kind: "manual-intervention",
          code: NamespacedCodeSchema.parse("github.credential-reference-mismatch"),
          detail: detail({
            kind: "manual-intervention",
            code: "github.credential-reference-mismatch",
          }),
        };
      }
      if (
        input.effect.action !== "github.repository.ensure" ||
        input.effect.target.resourceType !== "github.repository"
      ) {
        return {
          kind: "manual-intervention",
          code: NamespacedCodeSchema.parse("github.action.unsupported"),
          detail: detail({ kind: "manual-intervention", code: "github.action.unsupported" }),
        };
      }
      let payload: ReturnType<typeof parseRepositoryPayload>;
      try {
        payload = await readRepositoryPayload(context, input.effect, input.signal, input.deadline);
      } catch {
        return {
          kind: "manual-intervention",
          code: NamespacedCodeSchema.parse("github.payload-authority.unavailable"),
          detail: detail({
            kind: "manual-intervention",
            code: "github.payload-authority.unavailable",
          }),
        };
      }
      let intent: RepositoryIntent;
      try {
        intent = repositoryIntent(context, input.effect, payload);
      } catch {
        return {
          kind: "manual-intervention",
          code: NamespacedCodeSchema.parse("github.intent.mismatch"),
          detail: detail({ kind: "manual-intervention", code: "github.intent.mismatch" }),
        };
      }
      return await reconcileRepository(context, input, intent);
    },
  };
}

function parseRepositoryQuery(result: GraphqlResult, fullName: string, observedAt: string) {
  const root = data(result, "GitHub repository observation");
  exact(root, ["repository"], "GitHub repository observation data");
  if (root.repository === null) fail("GitHub repository was not found");
  const repository = parseRepositoryNode(root.repository, true);
  if (repository.fullName !== fullName || repository.defaultBranch === null) {
    fail("GitHub repository observation is incomplete or has the wrong identity");
  }
  const metadata = currentRepositoryMetadata(repository);
  return parseGitHubRepositorySnapshot({
    schemaVersion: 1,
    nodeId: repository.id,
    fullName: repository.fullName,
    url: repository.url,
    visibility: repository.visibility,
    archived: repository.archived,
    defaultBranch: repository.defaultBranch,
    operationMarker: metadata.marker,
    providerRevision: providerRevision(result.etag, root),
    observedAt,
  });
}

function extractMarker(value: string | null): string | null {
  if (value === null) return null;
  const match = /app-factory:v1:github:[a-z0-9][a-z0-9:._-]+/.exec(value);
  if (match === null) return null;
  const candidate = match[0];
  try {
    return operationMarker(candidate);
  } catch {
    fail("GitHub resource contains a malformed App Factory marker");
  }
}

function parsePullRequestNode(
  value: unknown,
  fullName: string,
  number: number,
  revision: string,
  observedAt: string,
): Readonly<{
  pullRequest: GitHubPullRequestSnapshotV1;
  merge: GitHubDeliverySnapshotV1["merge"];
}> {
  const source = record(value, "GitHub pull request node");
  exact(
    source,
    [
      "id",
      "url",
      "state",
      "isDraft",
      "baseRefName",
      "baseRefOid",
      "headRefName",
      "headRefOid",
      "body",
      "merged",
      "mergeCommit",
      "mergedAt",
      "mergedBy",
    ],
    "GitHub pull request node",
  );
  const merged = bool(source.merged, "GitHub pull request merged state");
  const providerState = enumeration(
    source.state,
    ["OPEN", "CLOSED", "MERGED"] as const,
    "GitHub pull request state",
  );
  if (merged !== (providerState === "MERGED")) fail("GitHub pull request state is inconsistent");
  const pullRequest = parseGitHubPullRequestSnapshot({
    schemaVersion: 1,
    repository: fullName,
    number,
    nodeId: boundedIdentifier(source.id, "GitHub pull request node ID", 160),
    url: safeUrl(source.url, "GitHub pull request URL"),
    state: providerState === "OPEN" ? "open" : providerState === "MERGED" ? "merged" : "closed",
    draft: bool(source.isDraft, "GitHub pull request draft state"),
    baseRef: text(source.baseRefName, "GitHub base ref", 255),
    baseSha: gitSha(source.baseRefOid, "GitHub base SHA"),
    headRef: text(source.headRefName, "GitHub head ref", 255),
    headSha: gitSha(source.headRefOid, "GitHub head SHA"),
    mergeBaseSha: null,
    operationMarker: extractMarker(
      possiblyEmptyText(source.body, "GitHub pull request body", 65_536),
    ),
    providerRevision: revision,
    observedAt,
  });
  if (!merged) {
    if (source.mergeCommit !== null || source.mergedAt !== null || source.mergedBy !== null) {
      fail("an unmerged GitHub pull request contains merge metadata");
    }
    return { pullRequest, merge: null };
  }
  const commit = record(source.mergeCommit, "GitHub merge commit");
  exact(commit, ["oid"], "GitHub merge commit");
  const actor = record(source.mergedBy, "GitHub merge actor");
  exact(actor, ["id"], "GitHub merge actor");
  return {
    pullRequest,
    merge: {
      schemaVersion: 1,
      repository: fullName,
      pullRequestNumber: number,
      mergeCommitSha: gitSha(commit.oid, "GitHub merge commit SHA"),
      mergedAt: isoInstant(source.mergedAt, "GitHub merge time"),
      actorId: boundedIdentifier(actor.id, "GitHub merge actor ID", 160),
      providerRevision: revision,
      observedAt,
    },
  };
}

function parsePageInfo(
  value: unknown,
): Readonly<{ hasNextPage: boolean; endCursor: string | null }> {
  const source = record(value, "GitHub page info");
  exact(source, ["hasNextPage", "endCursor"], "GitHub page info");
  const hasNextPage = bool(source.hasNextPage, "GitHub next-page state");
  const endCursor = nullableText(source.endCursor, "GitHub page cursor", 500);
  if (hasNextPage !== (endCursor !== null)) fail("GitHub page cursor is inconsistent");
  return { hasNextPage, endCursor };
}

function parseCheckNode(
  value: unknown,
  fullName: string,
  sha: string,
  revision: string,
  observedAt: string,
): GitHubCheckSnapshotV1 {
  const source = record(value, "GitHub check node");
  exact(
    source,
    ["__typename", "id", "name", "status", "conclusion", "detailsUrl", "app"],
    "GitHub check node",
  );
  if (source.__typename !== "CheckRun") fail("GitHub returned an unsupported status context");
  boundedIdentifier(source.id, "GitHub check node ID", 160);
  const app = record(source.app, "GitHub check app");
  exact(app, ["slug"], "GitHub check app");
  const status = enumeration(
    source.status,
    ["QUEUED", "IN_PROGRESS", "COMPLETED"] as const,
    "GitHub check status",
  );
  const conclusion =
    source.conclusion === null
      ? null
      : enumeration(
          source.conclusion,
          [
            "SUCCESS",
            "FAILURE",
            "NEUTRAL",
            "CANCELLED",
            "SKIPPED",
            "TIMED_OUT",
            "ACTION_REQUIRED",
            "STALE",
          ] as const,
          "GitHub check conclusion",
        ).toLowerCase();
  return parseGitHubCheckSnapshot({
    schemaVersion: 1,
    repository: fullName,
    commitSha: sha,
    appSlug: boundedIdentifier(app.slug, "GitHub App slug", 100),
    name: text(source.name, "GitHub check name", 240),
    status: status.toLowerCase(),
    conclusion,
    detailsUrl:
      source.detailsUrl === null ? null : safeUrl(source.detailsUrl, "GitHub check details URL"),
    providerRevision: revision,
    observedAt,
  });
}

function parseCommentMarker(body: string): string | null {
  const candidates = body.match(/app-factory:v1:github:[a-z0-9][a-z0-9:._-]+/g) ?? [];
  if (candidates.length === 0) return null;
  if (new Set(candidates).size !== 1) fail("GitHub comment contains ambiguous operation markers");
  return operationMarker(candidates[0]);
}

export function createGitHubReadObserver(options: GitHubReadObserverOptions): GitHubReadObserver {
  const context = createContext(options);
  const observeRepository = async (
    repositoryValue: string,
    signal: AbortSignal,
  ): Promise<GitHubRepositorySnapshotV1> => {
    const identity = splitRepository(repositoryValue);
    const result = await graphql(context, {
      query: REPOSITORY_QUERY,
      variables: { owner: identity.owner, name: identity.name },
      signal,
      deadline: deadline(context),
    });
    return parseRepositoryQuery(result, identity.fullName, context.clock.now().toISOString());
  };

  const observePullRequest = async (
    repositoryValue: string,
    number: number,
    signal: AbortSignal,
  ): Promise<GitHubPullRequestSnapshotV1> => {
    if (!Number.isSafeInteger(number) || number < 1) fail("GitHub pull request number is invalid");
    const identity = splitRepository(repositoryValue);
    const result = await graphql(context, {
      query: PULL_REQUEST_QUERY,
      variables: { owner: identity.owner, name: identity.name, number },
      signal,
      deadline: deadline(context),
    });
    const root = data(result, "GitHub pull request observation");
    exact(root, ["repository"], "GitHub pull request observation data");
    const repository = record(root.repository, "GitHub pull request repository");
    exact(repository, ["pullRequest"], "GitHub pull request repository");
    if (repository.pullRequest === null) fail("GitHub pull request was not found");
    return parsePullRequestNode(
      repository.pullRequest,
      identity.fullName,
      number,
      providerRevision(result.etag, root),
      context.clock.now().toISOString(),
    ).pullRequest;
  };

  const observeChecks = async (
    repositoryValue: string,
    commitShaValue: string,
    signal: AbortSignal,
  ): Promise<readonly GitHubCheckSnapshotV1[]> => {
    const identity = splitRepository(repositoryValue);
    const commitSha = gitSha(commitShaValue, "GitHub checks commit SHA");
    const observations: GitHubCheckSnapshotV1[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await graphql(context, {
        query: CHECKS_QUERY,
        variables: { owner: identity.owner, name: identity.name, oid: commitSha, cursor },
        signal,
        deadline: deadline(context),
      });
      const root = data(result, "GitHub checks observation");
      exact(root, ["repository"], "GitHub checks observation data");
      const repository = record(root.repository, "GitHub checks repository");
      exact(repository, ["object"], "GitHub checks repository");
      const object = record(repository.object, "GitHub checks commit");
      exact(object, ["__typename", "statusCheckRollup"], "GitHub checks commit");
      if (object.__typename !== "Commit") fail("GitHub checks object is not a commit");
      if (object.statusCheckRollup === null) return observations;
      const rollup = record(object.statusCheckRollup, "GitHub checks rollup");
      exact(rollup, ["contexts"], "GitHub checks rollup");
      const contexts = record(rollup.contexts, "GitHub checks contexts");
      exact(contexts, ["nodes", "pageInfo"], "GitHub checks contexts");
      const revision = providerRevision(result.etag, root);
      const observedAt = context.clock.now().toISOString();
      observations.push(
        ...array(contexts.nodes, "GitHub check nodes", 100).map((node) =>
          parseCheckNode(node, identity.fullName, commitSha, revision, observedAt),
        ),
      );
      const pageInfo = parsePageInfo(contexts.pageInfo);
      if (!pageInfo.hasNextPage) return observations;
      cursor = pageInfo.endCursor;
    }
    fail("GitHub checks exceeded the pagination limit");
  };

  const observePullRequestComments = async (
    repositoryValue: string,
    number: number,
    signal: AbortSignal,
  ): Promise<readonly GitHubPullRequestCommentObservationV1[]> => {
    if (!Number.isSafeInteger(number) || number < 1) fail("GitHub pull request number is invalid");
    const identity = splitRepository(repositoryValue);
    const observations: GitHubPullRequestCommentObservationV1[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await graphql(context, {
        query: COMMENTS_QUERY,
        variables: { owner: identity.owner, name: identity.name, number, cursor },
        signal,
        deadline: deadline(context),
      });
      const root = data(result, "GitHub comments observation");
      exact(root, ["repository"], "GitHub comments observation data");
      const repository = record(root.repository, "GitHub comments repository");
      exact(repository, ["pullRequest"], "GitHub comments repository");
      const pullRequest = record(repository.pullRequest, "GitHub comments pull request");
      exact(pullRequest, ["comments"], "GitHub comments pull request");
      const comments = record(pullRequest.comments, "GitHub comments connection");
      exact(comments, ["nodes", "pageInfo"], "GitHub comments connection");
      const revision = providerRevision(result.etag, root);
      const observedAt = context.clock.now().toISOString();
      observations.push(
        ...array(comments.nodes, "GitHub comments", 100).map((value) => {
          const source = record(value, "GitHub comment");
          exact(source, ["id", "url", "body", "updatedAt"], "GitHub comment");
          const body = possiblyEmptyText(source.body, "GitHub comment body", 65_536);
          return {
            schemaVersion: 1 as const,
            repository: identity.fullName,
            pullRequestNumber: number,
            nodeId: boundedIdentifier(source.id, "GitHub comment node ID", 160),
            url: safeUrl(source.url, "GitHub comment URL"),
            bodyDigest: digestCanonical({ body }) as `sha256:${string}`,
            operationMarker: parseCommentMarker(body),
            updatedAt: isoInstant(source.updatedAt, "GitHub comment update time"),
            providerRevision: revision,
            observedAt,
          };
        }),
      );
      const pageInfo = parsePageInfo(comments.pageInfo);
      if (!pageInfo.hasNextPage) return observations;
      cursor = pageInfo.endCursor;
    }
    fail("GitHub comments exceeded the pagination limit");
  };

  return {
    observeRepository,
    observePullRequest,
    observeChecks,
    observePullRequestComments,
    async observeDelivery(repositoryValue, pullRequestNumber, signal) {
      const repository = await observeRepository(repositoryValue, signal);
      const identity = splitRepository(repositoryValue);
      const repositoryResult = await graphql(context, {
        query: REPOSITORY_QUERY,
        variables: { owner: identity.owner, name: identity.name },
        signal,
        deadline: deadline(context),
      });
      const repositoryRoot = data(repositoryResult, "GitHub delivery repository");
      exact(repositoryRoot, ["repository"], "GitHub delivery repository data");
      const parsed = parseRepositoryNode(repositoryRoot.repository, true);
      if (parsed.defaultBranch === null || parsed.defaultBranchSha === null) {
        fail("GitHub repository has no observable default branch");
      }
      const observedAt = context.clock.now().toISOString();
      const baseBranch = {
        schemaVersion: 1 as const,
        repository: repository.fullName,
        name: parsed.defaultBranch,
        headSha: parsed.defaultBranchSha,
        protected: parsed.protected,
        providerRevision: providerRevision(repositoryResult.etag, repositoryRoot),
        observedAt,
      };
      if (pullRequestNumber === null) {
        return parseGitHubDeliverySnapshot({
          schemaVersion: 1,
          repository,
          baseBranch,
          pullRequest: null,
          checks: [],
          merge: null,
        });
      }
      const result = await graphql(context, {
        query: PULL_REQUEST_QUERY,
        variables: { owner: identity.owner, name: identity.name, number: pullRequestNumber },
        signal,
        deadline: deadline(context),
      });
      const root = data(result, "GitHub delivery pull request");
      exact(root, ["repository"], "GitHub delivery pull request data");
      const pullRepository = record(root.repository, "GitHub delivery PR repository");
      exact(pullRepository, ["pullRequest"], "GitHub delivery PR repository");
      if (pullRepository.pullRequest === null) fail("GitHub pull request was not found");
      const pull = parsePullRequestNode(
        pullRepository.pullRequest,
        identity.fullName,
        pullRequestNumber,
        providerRevision(result.etag, root),
        observedAt,
      );
      const checks = await observeChecks(identity.fullName, pull.pullRequest.headSha, signal);
      return parseGitHubDeliverySnapshot({
        schemaVersion: 1,
        repository,
        baseBranch,
        pullRequest: pull.pullRequest,
        checks,
        merge: pull.merge,
      });
    },
    async findByCorrelation(query: CorrelationQueryV1, signal: AbortSignal) {
      if (
        query.schemaVersion !== 1 ||
        query.provider !== "github" ||
        query.resourceType !== "github.repository"
      ) {
        fail("GitHub correlation query is unsupported");
      }
      const fullName = repositoryName(`${query.containerKey}/${query.logicalKey}`);
      const found = await findRepository(context, fullName, signal, deadline(context));
      if (found.repository === null) return [];
      const metadata = parseRepositoryMetadata(found.repository.description);
      if (
        found.repository.defaultBranch !== null &&
        repositoryExpectation(found.repository) !== metadata.expectedResourceDigest
      ) {
        fail("GitHub correlation fields drifted from their bound metadata");
      }
      const observation: ProviderResourceObservationV1 = {
        schemaVersion: 1,
        provider: "github",
        resourceType: "github.repository",
        providerResourceId: found.repository.id,
        providerUrl: found.repository.url,
        providerRevision: found.revision,
        operationMarker: metadata.marker,
        containerKey: query.containerKey,
        logicalKey: query.logicalKey,
        observedAt: context.clock.now().toISOString(),
      };
      return [observation];
    },
  };
}
