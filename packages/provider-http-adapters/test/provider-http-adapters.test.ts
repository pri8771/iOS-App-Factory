import { describe, expect, it, vi } from "vitest";

import {
  sha256Bytes,
  validateExternalProviderAdapter,
  type CredentialReferenceV1,
} from "@app-factory/adapter-sdk";
import type { ExternalEffectV1 } from "@app-factory/contracts";
import { digestCanonical } from "@app-factory/work-tracking-integrations";

import {
  ProviderHttpContractError,
  createGitHubHttpAdapter,
  createGitHubReadObserver,
  createJiraCloudHttpAdapter,
  createJiraReadObserver,
  createProviderHttpRequest,
  performProviderHttpRequest,
  providerBaseUrl,
  providerUrl,
  type BoundedProviderHttpTransport,
  type EffectPayloadReader,
  type ProviderHttpRequestV1,
  type ProviderHttpResponseV1,
} from "../src/index.js";

const T0 = "2026-08-11T12:00:00.000Z";
const T1 = "2026-08-11T12:01:00.000Z";
const PROJECT_ID = "a1000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "a1000000-0000-4000-8000-000000000002";
const POLICY = `sha256:${"a".repeat(64)}`;
const CREDENTIAL: CredentialReferenceV1 = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: "app-factory.github",
  account: "factory-bot",
};
const JIRA_CREDENTIAL: CredentialReferenceV1 = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: "app-factory.jira",
  account: "factory-bot@example.com",
};
const GITHUB_MARKER = `app-factory:v1:github:repository.ensure:${"b".repeat(64)}`;
const JIRA_PROJECT_MARKER = `app-factory:v1:jira:project.ensure:${"c".repeat(64)}`;
const JIRA_EPIC_MARKER = `app-factory:v1:jira:epic.ensure:${"d".repeat(64)}`;
const JIRA_TASK_MARKER = `app-factory:v1:jira:issue.ensure:${"e".repeat(64)}`;
const EFFECT_PAYLOADS = new Map<string, Uint8Array>();

const FIXTURE_PAYLOAD_READER: EffectPayloadReader = {
  read({ payloadDigest }) {
    const payload = EFFECT_PAYLOADS.get(payloadDigest);
    if (payload === undefined) throw new Error("fixture payload is missing");
    return Uint8Array.from(payload);
  },
};

function bytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function response(
  status: number,
  value: unknown,
  headers: readonly { name: string; value: string }[] = [],
): ProviderHttpResponseV1 {
  return {
    schemaVersion: 1,
    status,
    headers,
    body: value === null ? Buffer.alloc(0) : bytes(value),
  };
}

function effect(input: {
  provider: "jira" | "github";
  action: string;
  resourceType: string;
  resourceKey: string;
  marker: string;
  payload: Uint8Array;
}): ExternalEffectV1 {
  const payloadDigest = sha256Bytes(input.payload);
  EFFECT_PAYLOADS.set(payloadDigest, Uint8Array.from(input.payload));
  return {
    schemaVersion: 1,
    effectId:
      input.provider === "github"
        ? "a1000000-0000-4000-8000-000000000003"
        : "a1000000-0000-4000-8000-000000000004",
    attemptId: ATTEMPT_ID,
    action: input.action as ExternalEffectV1["action"],
    operationMarker: input.marker,
    target: {
      provider: input.provider,
      resourceType: input.resourceType as ExternalEffectV1["target"]["resourceType"],
      resourceKey: input.resourceKey,
    },
    subject: {
      projectId: PROJECT_ID,
      taskId: null,
      attemptId: ATTEMPT_ID,
      releaseId: null,
    },
    payloadDigest,
    policyDigest: POLICY as ExternalEffectV1["policyDigest"],
    approvalId: null,
    state: "sent",
    revision: 0,
    sendCount: 1,
    providerCorrelationKey: input.marker,
    createdAt: T0,
    updatedAt: T0,
    lastObservedAt: null,
    nextReconcileAt: null,
    detailDigest: null,
  };
}

function dispatchContext(credentialReference: CredentialReferenceV1) {
  return {
    credentialReference,
    claim: {
      ownerId: "effect-worker-1",
      fence: 1,
      outboxRevision: 0,
      effectRevision: 0,
      lockedUntil: T1,
    },
    deadline: T1,
    signal: new AbortController().signal,
    assertActive: vi.fn(async () => undefined),
  };
}

type RequestHandler = (request: ProviderHttpRequestV1) => unknown | Promise<unknown>;

function scriptedTransport(...handlers: readonly RequestHandler[]) {
  const requests: ProviderHttpRequestV1[] = [];
  const request = vi.fn(async (input: ProviderHttpRequestV1) => {
    requests.push({
      ...input,
      headers: input.headers.map((header) => ({ ...header })),
      body: input.body === null ? null : Uint8Array.from(input.body),
    });
    const handler = handlers[requests.length - 1];
    if (handler === undefined) throw new Error("unexpected HTTP request");
    return await handler(input);
  });
  return { transport: { request } satisfies BoundedProviderHttpTransport, request, requests };
}

function githubReadOptions(transport: BoundedProviderHttpTransport) {
  return {
    transport,
    apiBaseUrl: "https://api.github.test",
    owner: "factory-org",
    ownerNodeId: "O_factoryorg",
    credentialReference: CREDENTIAL,
    clock: { now: () => new Date(T0) },
  };
}

function githubOptions(
  transport: BoundedProviderHttpTransport,
  payloadReader: EffectPayloadReader = FIXTURE_PAYLOAD_READER,
) {
  return { ...githubReadOptions(transport), payloadReader };
}

function jiraReadOptions(transport: BoundedProviderHttpTransport) {
  return {
    transport,
    siteUrl: "https://factory.atlassian.test",
    siteId: "cloud-123",
    credentialReference: JIRA_CREDENTIAL,
    projectLeadAccountId: "account-123",
    projectTemplateKey: "com.pyxis.greenhopper.jira:gh-scrum-template",
    clock: { now: () => new Date(T0) },
  };
}

function jiraOptions(
  transport: BoundedProviderHttpTransport,
  payloadReader: EffectPayloadReader = FIXTURE_PAYLOAD_READER,
) {
  return { ...jiraReadOptions(transport), payloadReader };
}

function githubRepositoryNode(input?: Partial<Record<string, unknown>>) {
  return {
    id: "R_factoryrepo",
    nameWithOwner: "factory-org/demo",
    url: "https://github.test/factory-org/demo",
    visibility: "PRIVATE",
    isArchived: false,
    description: `${"App Factory operation: "}${GITHUB_MARKER}; intent: sha256:${"7".repeat(64)}; expected: ${digestCanonical({ visibility: "private", defaultBranch: "main", archived: false })}`,
    defaultBranchRef: { name: "main" },
    ...input,
  };
}

function jiraIssue(input: {
  id: string;
  key: string;
  logicalKey: string;
  marker: string;
  issueType: "Epic" | "Story" | "Task" | "Bug";
  payloadDigest?: `sha256:${string}`;
  parentKey?: string | null;
  projectKey?: string;
  projectId?: string;
  summary?: string;
  description?: unknown;
  labels?: readonly string[];
}) {
  const description =
    "description" in input ? input.description : { type: "doc", version: 1, content: [] };
  const summary = input.summary ?? `${input.issueType} summary`;
  const parentKey = input.parentKey ?? null;
  const labels = input.labels ?? ["app-factory"];
  const expectedFieldsDigest = digestCanonical({
    summary,
    issueType: input.issueType.toLowerCase(),
    description,
    parentKey,
    hasFactoryLabel: labels.includes("app-factory"),
  });
  return {
    id: input.id,
    key: input.key,
    self: `https://factory.atlassian.test/rest/api/3/issue/${input.id}`,
    version: 3,
    fields: {
      project: { key: input.projectKey ?? "FACT" },
      summary,
      description,
      status: { name: "To Do" },
      labels,
      updated: T0,
      issuetype: { name: input.issueType },
      parent: parentKey === null ? null : { key: parentKey },
    },
    properties: {
      "com.app-factory.operation-marker": {
        schemaVersion: 1,
        marker: input.marker,
        resourceType: "jira.issue",
        projectId: input.projectId ?? PROJECT_ID,
        logicalKey: input.logicalKey,
        payloadDigest: input.payloadDigest ?? (`sha256:${"8".repeat(64)}` as const),
        expectedFieldsDigest,
      },
    },
  };
}

function jiraTaskPayload() {
  return {
    projectId: PROJECT_ID,
    projectKey: "FACT",
    epicLogicalId: "foundation",
    logicalId: "small-task",
    summary: "Small task",
    description: "Implement one small unit.",
    issueType: "task" as const,
    estimatePoints: 2,
    acceptanceCriteria: ["The unit is verified."],
    dependsOnLogicalIds: [] as string[],
  };
}

function jiraTaskDescription(
  payload: ReturnType<typeof jiraTaskPayload>,
  marker = JIRA_TASK_MARKER,
) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `${payload.description}\n\nApp Factory operation: ${marker}`,
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Estimate: ${String(payload.estimatePoints)} points` }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Acceptance criteria" }],
      },
      {
        type: "bulletList",
        content: payload.acceptanceCriteria.map((criterion) => ({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: criterion }],
            },
          ],
        })),
      },
    ],
  };
}

function jiraProjectDescription(
  marker = JIRA_PROJECT_MARKER,
  name = "Factory",
  displayName = "Factory",
  payloadDigest: ExternalEffectV1["payloadDigest"] = `sha256:${"6".repeat(64)}`,
) {
  return `${displayName}\nApp Factory operation: ${marker}; intent: ${payloadDigest}; expected: ${digestCanonical(
    {
      key: "FACT",
      name,
      projectTypeKey: "software",
      displayName,
    },
  )}`;
}

describe("bounded provider HTTP contract", () => {
  it("rejects unbounded/unknown response fields and zeroizes provider-owned bodies", async () => {
    const rawBody = bytes({ ok: true });
    const transport: BoundedProviderHttpTransport = {
      async request() {
        return {
          schemaVersion: 1,
          status: 200,
          headers: [],
          body: rawBody,
          secret: "unexpected",
        };
      },
    };
    const request = createProviderHttpRequest({
      method: "GET",
      url: "https://api.github.test/graphql",
      headers: [{ name: "accept", value: "application/json" }],
      body: null,
      credentialReference: CREDENTIAL,
      credentialOrigin: "https://api.github.test",
      deadline: T1,
      signal: new AbortController().signal,
    });
    await expect(performProviderHttpRequest(transport, request)).rejects.toBeInstanceOf(
      ProviderHttpContractError,
    );
    expect([...rawBody]).toEqual(new Array(rawBody.length).fill(0));
  });

  it("never permits raw authorization material in request headers", () => {
    expect(() =>
      createProviderHttpRequest({
        method: "GET",
        url: "https://api.github.test/graphql",
        headers: [{ name: "authorization", value: "Bearer raw-token" }],
        body: null,
        credentialReference: CREDENTIAL,
        credentialOrigin: "https://api.github.test",
        deadline: T1,
        signal: new AbortController().signal,
      }),
    ).toThrow(/not allowed|credential values/);
  });

  it.each(["/../admin", "/%2e%2e/admin", "/safe%2fescape", "/safe%5cescape", "/%00"])(
    "rejects unsafe provider path %s before transport",
    (path) => {
      const base = providerBaseUrl("https://api.github.test", "test base");
      expect(() => providerUrl(base, path)).toThrow(/unsafe segment/);
    },
  );

  it("binds each credential reference to the configured provider origin", () => {
    expect(() =>
      createProviderHttpRequest({
        method: "GET",
        url: "https://evil.example.test/steal",
        headers: [{ name: "accept", value: "application/json" }],
        body: null,
        credentialReference: CREDENTIAL,
        credentialOrigin: "https://api.github.test",
        deadline: T1,
        signal: new AbortController().signal,
      }),
    ).toThrow(/credential scope/);
  });
});

describe("GitHub HTTP adapter", () => {
  it("reports repository creation unavailable when the authenticated owner denies it", async () => {
    const fake = scriptedTransport(() =>
      response(200, {
        data: {
          viewer: { id: "U_viewer", login: "factory-bot" },
          repositoryOwner: {
            __typename: "Organization",
            id: "O_factoryorg",
            viewerCanCreateRepositories: false,
          },
        },
      }),
    );
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(githubOptions(fake.transport)),
    );
    const report = await adapter.preflight(new AbortController().signal);
    expect(
      report.capabilities.find((item) => item.capability === "github.repository.read"),
    ).toMatchObject({ available: true, blockerCode: null });
    expect(
      report.capabilities.find((item) => item.capability === "github.repository.create"),
    ).toMatchObject({ available: false, blockerCode: "github.preflight.unavailable" });
  });

  it("creates one marker-bound repository through the validated adapter", async () => {
    let raw: ProviderHttpResponseV1 | undefined;
    const fake = scriptedTransport((request) => {
      const outbound = JSON.parse(new TextDecoder().decode(request.body ?? new Uint8Array())) as {
        variables: { input: { description: string } };
      };
      raw = response(
        200,
        {
          data: {
            createRepository: {
              clientMutationId: GITHUB_MARKER,
              repository: githubRepositoryNode({
                description: outbound.variables.input.description,
              }),
            },
          },
        },
        [{ name: "etag", value: '"repo-v1"' }],
      );
      return raw;
    });
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(githubOptions(fake.transport)),
    );
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "demo",
      displayName: "Demo",
      owner: "factory-org",
      repository: "demo",
      visibility: "private",
      defaultBranch: "main",
    });
    const created = await adapter.send({
      effect: effect({
        provider: "github",
        action: "github.repository.ensure",
        resourceType: "github.repository",
        resourceKey: "factory-org/demo",
        marker: GITHUB_MARKER,
        payload,
      }),
      payload,
      ...dispatchContext(CREDENTIAL),
    });

    expect(created).toMatchObject({
      kind: "observed",
      correlationKey: GITHUB_MARKER,
      resource: { providerResourceId: "R_factoryrepo", providerVersion: '"repo-v1"' },
    });
    expect(fake.request).toHaveBeenCalledOnce();
    expect(fake.requests[0]?.credentialReference).toEqual(CREDENTIAL);
    expect(fake.requests[0]?.headers.map((header) => header.name)).not.toContain("authorization");
    const outbound = JSON.parse(
      new TextDecoder().decode(fake.requests[0]?.body ?? new Uint8Array()),
    ) as { variables: { input: { clientMutationId: string; description: string } } };
    expect(outbound.variables.input.clientMutationId).toBe(GITHUB_MARKER);
    expect(outbound.variables.input.description).toContain(GITHUB_MARKER);
    expect(outbound.variables.input.description).toContain(`intent: ${sha256Bytes(payload)}`);
    expect(outbound.variables.input.description).toContain(
      `expected: ${digestCanonical({ visibility: "private", defaultBranch: "main", archived: false })}`,
    );
    expect(raw).toBeDefined();
    expect([...(raw?.body ?? [])]).toEqual(new Array(raw?.body.length ?? 0).fill(0));
  });

  it.each([
    {
      label: "has not created its default branch yet",
      defaultBranchRef: null,
      code: "github.repository.default-branch-pending",
    },
    {
      label: "created a different default branch",
      defaultBranchRef: { name: "master" },
      code: "github.repository.success-response-intent-drift",
    },
  ])("does not confirm a repository that $label", async ({ defaultBranchRef, code }) => {
    const fake = scriptedTransport((request) => {
      const outbound = JSON.parse(new TextDecoder().decode(request.body ?? new Uint8Array())) as {
        variables: { input: { description: string } };
      };
      return response(200, {
        data: {
          createRepository: {
            clientMutationId: GITHUB_MARKER,
            repository: githubRepositoryNode({
              description: outbound.variables.input.description,
              defaultBranchRef,
            }),
          },
        },
      });
    });
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(githubOptions(fake.transport)),
    );
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "demo",
      displayName: "Demo",
      owner: "factory-org",
      repository: "demo",
      visibility: "private",
      defaultBranch: "main",
    });

    const created = await adapter.send({
      effect: effect({
        provider: "github",
        action: "github.repository.ensure",
        resourceType: "github.repository",
        resourceKey: "factory-org/demo",
        marker: GITHUB_MARKER,
        payload,
      }),
      payload,
      ...dispatchContext(CREDENTIAL),
    });

    expect(created).toMatchObject({
      kind: "ambiguous",
      correlationKey: GITHUB_MARKER,
    });
    expect(JSON.parse(new TextDecoder().decode(created.detail))).toMatchObject({ code });
  });

  it("never redispatches after a lost response just because reconciliation finds nothing", async () => {
    const fake = scriptedTransport(
      () => {
        throw new Error("lost after provider accepted request");
      },
      () => response(200, { data: { repository: null } }),
    );
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(githubOptions(fake.transport)),
    );
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "demo",
      displayName: "Demo",
      owner: "factory-org",
      repository: "demo",
      visibility: "private",
      defaultBranch: "main",
    });
    const unknownEffect = effect({
      provider: "github",
      action: "github.repository.ensure",
      resourceType: "github.repository",
      resourceKey: "factory-org/demo",
      marker: GITHUB_MARKER,
      payload,
    });
    await expect(
      adapter.send({ effect: unknownEffect, payload, ...dispatchContext(CREDENTIAL) }),
    ).resolves.toMatchObject({ kind: "ambiguous" });
    await expect(
      adapter.reconcile({
        effect: { ...unknownEffect, state: "unknown", revision: 1 },
        ...dispatchContext(CREDENTIAL),
        claim: { ...dispatchContext(CREDENTIAL).claim, effectRevision: 1 },
      }),
    ).resolves.toMatchObject({ kind: "not-found" });
    expect(fake.request).toHaveBeenCalledTimes(2);
    const methods = fake.requests.map((item) => item.method);
    expect(methods).toEqual(["POST", "POST"]);
    const queries = fake.requests.map(
      (item) =>
        (JSON.parse(new TextDecoder().decode(item.body ?? new Uint8Array())) as { query: string })
          .query,
    );
    expect(queries.filter((query) => query.includes("mutation"))).toHaveLength(1);
  });

  it("requires manual intervention without the authoritative local payload", async () => {
    const fake = scriptedTransport();
    const payloadReader: EffectPayloadReader = {
      read() {
        throw new Error("payload was removed");
      },
    };
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(githubOptions(fake.transport, payloadReader)),
    );
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "demo",
      displayName: "Demo",
      owner: "factory-org",
      repository: "demo",
      visibility: "private",
      defaultBranch: "main",
    });
    const current = effect({
      provider: "github",
      action: "github.repository.ensure",
      resourceType: "github.repository",
      resourceKey: "factory-org/demo",
      marker: GITHUB_MARKER,
      payload,
    });

    await expect(
      adapter.reconcile({
        effect: { ...current, state: "unknown" },
        ...dispatchContext(CREDENTIAL),
      }),
    ).resolves.toMatchObject({
      kind: "manual-intervention",
      code: "github.payload-authority.unavailable",
    });
    expect(fake.request).not.toHaveBeenCalled();
  });

  it("zeroizes a verified authoritative payload after read-only reconciliation", async () => {
    const fake = scriptedTransport(() => response(200, { data: { repository: null } }));
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "demo",
      displayName: "Demo",
      owner: "factory-org",
      repository: "demo",
      visibility: "private",
      defaultBranch: "main",
    });
    const localCopy = Uint8Array.from(payload);
    const localLength = localCopy.byteLength;
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(
        githubOptions(fake.transport, {
          read: () => localCopy,
        }),
      ),
    );
    const current = effect({
      provider: "github",
      action: "github.repository.ensure",
      resourceType: "github.repository",
      resourceKey: "factory-org/demo",
      marker: GITHUB_MARKER,
      payload,
    });

    await expect(
      adapter.reconcile({
        effect: { ...current, state: "unknown" },
        ...dispatchContext(CREDENTIAL),
      }),
    ).resolves.toMatchObject({ kind: "not-found" });
    expect([...localCopy]).toEqual(new Array(localLength).fill(0));
    expect(fake.requests).toHaveLength(1);
    const query = (
      JSON.parse(new TextDecoder().decode(fake.requests[0]?.body ?? new Uint8Array())) as {
        query: string;
      }
    ).query;
    expect(query).not.toContain("mutation");
  });

  it("requires manual intervention when the repository name is occupied without the marker", async () => {
    const fake = scriptedTransport(() =>
      response(200, {
        data: {
          repository: githubRepositoryNode({
            description: "not managed by App Factory",
            defaultBranchRef: {
              name: "main",
              oid: "1".repeat(40),
              branchProtectionRule: null,
            },
          }),
        },
      }),
    );
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(githubOptions(fake.transport)),
    );
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "demo",
      displayName: "Demo",
      owner: "factory-org",
      repository: "demo",
      visibility: "private",
      defaultBranch: "main",
    });
    const unknownEffect = effect({
      provider: "github",
      action: "github.repository.ensure",
      resourceType: "github.repository",
      resourceKey: "factory-org/demo",
      marker: GITHUB_MARKER,
      payload,
    });
    await expect(
      adapter.reconcile({
        effect: { ...unknownEffect, state: "unknown" },
        ...dispatchContext(CREDENTIAL),
      }),
    ).resolves.toMatchObject({
      kind: "manual-intervention",
      code: "github.repository.marker-collision",
    });
  });

  it("fails closed after coordinated repository metadata and field drift", async () => {
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "demo",
      displayName: "Demo",
      owner: "factory-org",
      repository: "demo",
      visibility: "private",
      defaultBranch: "main",
    });
    const description = `App Factory operation: ${GITHUB_MARKER}; intent: ${sha256Bytes(payload)}; expected: ${digestCanonical(
      { visibility: "public", defaultBranch: "main", archived: false },
    )}`;
    const fake = scriptedTransport(() =>
      response(200, {
        data: {
          repository: githubRepositoryNode({
            visibility: "PUBLIC",
            description,
            defaultBranchRef: {
              name: "main",
              oid: "1".repeat(40),
              branchProtectionRule: null,
            },
          }),
        },
      }),
    );
    const adapter = validateExternalProviderAdapter(
      createGitHubHttpAdapter(githubOptions(fake.transport)),
    );
    const current = effect({
      provider: "github",
      action: "github.repository.ensure",
      resourceType: "github.repository",
      resourceKey: "factory-org/demo",
      marker: GITHUB_MARKER,
      payload,
    });

    await expect(
      adapter.reconcile({
        effect: { ...current, state: "unknown" },
        ...dispatchContext(CREDENTIAL),
      }),
    ).resolves.toMatchObject({
      kind: "manual-intervention",
      code: "github.repository.intent-drift",
    });
    expect(fake.requests.every((request) => request.method === "POST")).toBe(true);
    const query = (
      JSON.parse(new TextDecoder().decode(fake.requests[0]?.body ?? new Uint8Array())) as {
        query: string;
      }
    ).query;
    expect(query).not.toContain("mutation");
  });

  it("strictly observes repository, PR, paginated checks, and redacted comments", async () => {
    const repoNode = githubRepositoryNode({
      defaultBranchRef: {
        name: "main",
        oid: "1".repeat(40),
        branchProtectionRule: { id: "BPR_main" },
      },
    });
    const fake = scriptedTransport(
      () => response(200, { data: { repository: repoNode } }, [{ name: "etag", value: '"r1"' }]),
      () =>
        response(200, {
          data: {
            repository: {
              pullRequest: {
                id: "PR_7",
                url: "https://github.test/factory-org/demo/pull/7",
                state: "OPEN",
                isDraft: true,
                baseRefName: "main",
                baseRefOid: "1".repeat(40),
                headRefName: "factory/feature",
                headRefOid: "2".repeat(40),
                body: `Draft\n\nApp Factory operation: ${GITHUB_MARKER}`,
                merged: false,
                mergeCommit: null,
                mergedAt: null,
                mergedBy: null,
              },
            },
          },
        }),
      () =>
        response(200, {
          data: {
            repository: {
              object: {
                __typename: "Commit",
                statusCheckRollup: {
                  contexts: {
                    nodes: [
                      {
                        __typename: "CheckRun",
                        id: "CR_build",
                        name: "build",
                        status: "COMPLETED",
                        conclusion: "SUCCESS",
                        detailsUrl: "https://github.test/checks/build",
                        app: { slug: "github-actions" },
                      },
                    ],
                    pageInfo: { hasNextPage: true, endCursor: "checks-2" },
                  },
                },
              },
            },
          },
        }),
      () =>
        response(200, {
          data: {
            repository: {
              object: {
                __typename: "Commit",
                statusCheckRollup: {
                  contexts: {
                    nodes: [
                      {
                        __typename: "CheckRun",
                        id: "CR_test",
                        name: "test",
                        status: "IN_PROGRESS",
                        conclusion: null,
                        detailsUrl: null,
                        app: { slug: "github-actions" },
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            },
          },
        }),
      () =>
        response(200, {
          data: {
            repository: {
              pullRequest: {
                comments: {
                  nodes: [
                    {
                      id: "IC_1",
                      url: "https://github.test/factory-org/demo/pull/7#issuecomment-1",
                      body: `review note ${GITHUB_MARKER}`,
                      updatedAt: T0,
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: "comments-2" },
                },
              },
            },
          },
        }),
      () =>
        response(200, {
          data: {
            repository: {
              pullRequest: {
                comments: {
                  nodes: [
                    {
                      id: "IC_2",
                      url: "https://github.test/factory-org/demo/pull/7#issuecomment-2",
                      body: "human-only note",
                      updatedAt: T0,
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
    );
    const observer = createGitHubReadObserver(githubReadOptions(fake.transport));
    await expect(
      observer.observeRepository("factory-org/demo", new AbortController().signal),
    ).resolves.toMatchObject({
      fullName: "factory-org/demo",
      defaultBranch: "main",
      providerRevision: '"r1"',
    });
    await expect(
      observer.observePullRequest("factory-org/demo", 7, new AbortController().signal),
    ).resolves.toMatchObject({ number: 7, state: "open", headSha: "2".repeat(40) });
    await expect(
      observer.observeChecks("factory-org/demo", "2".repeat(40), new AbortController().signal),
    ).resolves.toMatchObject([
      { name: "build", status: "completed", conclusion: "success" },
      { name: "test", status: "in_progress", conclusion: null },
    ]);
    const comments = await observer.observePullRequestComments(
      "factory-org/demo",
      7,
      new AbortController().signal,
    );
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ operationMarker: GITHUB_MARKER });
    expect(comments[0]).not.toHaveProperty("body");
    expect(comments[1]).toMatchObject({ operationMarker: null });
    expect(fake.request).toHaveBeenCalledTimes(6);
  });
});

describe("Jira Cloud HTTP adapter", () => {
  it("keeps unrepresentable link capabilities blocked even when Jira grants permission", async () => {
    const permission = (key: string) => ({
      id: key,
      key,
      name: key,
      type: "PROJECT",
      description: `${key} permission`,
      havePermission: true,
    });
    const fake = scriptedTransport(() =>
      response(200, {
        permissions: {
          BROWSE_PROJECTS: permission("BROWSE_PROJECTS"),
          ADMINISTER_PROJECTS: permission("ADMINISTER_PROJECTS"),
          CREATE_ISSUES: permission("CREATE_ISSUES"),
          LINK_ISSUES: permission("LINK_ISSUES"),
        },
      }),
    );
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport)),
    );
    const report = await adapter.preflight(new AbortController().signal);
    expect(
      report.capabilities.find((item) => item.capability === "jira.issue.create"),
    ).toMatchObject({ available: true, blockerCode: null });
    expect(report.capabilities.find((item) => item.capability === "jira.issue.link")).toMatchObject(
      {
        available: false,
        blockerCode: "jira.issue-link.correlation-contract-unsupported",
      },
    );
    expect(
      report.capabilities.find((item) => item.capability === "jira.remote-link.create"),
    ).toMatchObject({
      available: false,
      blockerCode: "jira.remote-link.issue-target-required",
    });
  });

  it("creates a marker-bound project and retains only sanitized response detail", async () => {
    const raw = response(
      201,
      {
        id: "10001",
        key: "FACT",
        self: "https://factory.atlassian.test/rest/api/3/project/10001",
      },
      [{ name: "etag", value: '"project-v1"' }],
    );
    const fake = scriptedTransport(() => raw);
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport)),
    );
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "factory",
      displayName: "Factory",
      key: "FACT",
      name: "Factory",
      projectType: "software",
    });
    const created = await adapter.send({
      effect: effect({
        provider: "jira",
        action: "jira.project.ensure",
        resourceType: "jira.project",
        resourceKey: "cloud-123:FACT",
        marker: JIRA_PROJECT_MARKER,
        payload,
      }),
      payload,
      ...dispatchContext(JIRA_CREDENTIAL),
    });
    expect(created).toMatchObject({
      kind: "observed",
      resource: { providerResourceId: "10001", providerVersion: '"project-v1"' },
    });
    const outbound = JSON.parse(
      new TextDecoder().decode(fake.requests[0]?.body ?? new Uint8Array()),
    ) as { description: string; leadAccountId: string };
    expect(outbound.description).toContain(JIRA_PROJECT_MARKER);
    expect(outbound.description).toContain(`intent: ${sha256Bytes(payload)}`);
    expect(outbound.leadAccountId).toBe("account-123");
    expect(fake.requests[0]?.headers.map((header) => header.name)).not.toContain("authorization");
    expect(new TextDecoder().decode(created.detail)).not.toContain("leadAccountId");
    expect([...raw.body]).toEqual(new Array(raw.body.length).fill(0));
  });

  it("rejects tampered authoritative payload bytes before mutation and zeroizes them", async () => {
    const fake = scriptedTransport();
    const tampered = bytes({ projectId: PROJECT_ID, tampered: true });
    const tamperedLength = tampered.byteLength;
    const read = vi.fn(() => tampered);
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport, { read })),
    );
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "factory",
      displayName: "Factory",
      key: "FACT",
      name: "Factory",
      projectType: "software",
    });
    const current = effect({
      provider: "jira",
      action: "jira.project.ensure",
      resourceType: "jira.project",
      resourceKey: "cloud-123:FACT",
      marker: JIRA_PROJECT_MARKER,
      payload,
    });
    const context = dispatchContext(JIRA_CREDENTIAL);

    await expect(adapter.send({ effect: current, payload, ...context })).resolves.toMatchObject({
      kind: "rejected",
      retryable: false,
      code: "jira.payload-authority.unavailable",
    });
    expect(read).toHaveBeenCalledWith({
      payloadDigest: current.payloadDigest,
      deadline: T1,
      signal: context.signal,
    });
    expect([...tampered]).toEqual(new Array(tamperedLength).fill(0));
    expect(fake.request).not.toHaveBeenCalled();
  });

  it("creates an epic and resolves a task parent read-only before the fenced mutation", async () => {
    const epicCreate = response(201, {
      id: "20001",
      key: "FACT-1",
      self: "https://factory.atlassian.test/rest/api/3/issue/20001",
    });
    const parent = jiraIssue({
      id: "20001",
      key: "FACT-1",
      logicalKey: "foundation",
      marker: JIRA_EPIC_MARKER,
      issueType: "Epic",
    });
    const taskCreate = response(201, {
      id: "20002",
      key: "FACT-2",
      self: "https://factory.atlassian.test/rest/api/3/issue/20002",
    });
    const fake = scriptedTransport(
      () => epicCreate,
      () => response(200, { startAt: 0, maxResults: 50, total: 1, issues: [parent] }),
      () => taskCreate,
    );
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport)),
    );
    const epicPayload = bytes({
      projectId: PROJECT_ID,
      projectKey: "FACT",
      logicalId: "foundation",
      summary: "Foundation",
      description: "Build the foundation.",
    });
    const epicContext = dispatchContext(JIRA_CREDENTIAL);
    await expect(
      adapter.send({
        effect: effect({
          provider: "jira",
          action: "jira.epic.ensure",
          resourceType: "jira.issue",
          resourceKey: "cloud-123:FACT:epic:foundation",
          marker: JIRA_EPIC_MARKER,
          payload: epicPayload,
        }),
        payload: epicPayload,
        ...epicContext,
      }),
    ).resolves.toMatchObject({ kind: "observed" });
    const taskPayload = bytes({
      projectId: PROJECT_ID,
      projectKey: "FACT",
      epicLogicalId: "foundation",
      logicalId: "small-task",
      summary: "Small task",
      description: "Implement one small unit.",
      issueType: "task",
      estimatePoints: 2,
      acceptanceCriteria: ["The unit is verified."],
      dependsOnLogicalIds: [],
    });
    const taskContext = dispatchContext(JIRA_CREDENTIAL);
    await expect(
      adapter.send({
        effect: effect({
          provider: "jira",
          action: "jira.issue.ensure",
          resourceType: "jira.issue",
          resourceKey: "cloud-123:FACT:issue:small-task",
          marker: JIRA_TASK_MARKER,
          payload: taskPayload,
        }),
        payload: taskPayload,
        ...taskContext,
      }),
    ).resolves.toMatchObject({ kind: "observed" });
    // The SDK checks on adapter entry and the provider implementation checks
    // again immediately before the mutation after any prerequisite reads.
    expect(epicContext.assertActive).toHaveBeenCalledTimes(2);
    expect(taskContext.assertActive).toHaveBeenCalledTimes(2);
    expect(fake.requests.map((item) => item.method)).toEqual(["POST", "GET", "POST"]);
    const taskRequest = JSON.parse(
      new TextDecoder().decode(fake.requests[2]?.body ?? new Uint8Array()),
    ) as {
      fields: { parent: { key: string } };
      properties: { key: string; value: { marker: string } }[];
    };
    expect(taskRequest.fields.parent.key).toBe("FACT-1");
    expect(taskRequest.properties[0]?.value.marker).toBe(JIRA_TASK_MARKER);
    expect(taskRequest.properties[0]?.value).toMatchObject({
      projectId: PROJECT_ID,
      logicalKey: "small-task",
      payloadDigest: sha256Bytes(taskPayload),
    });
  });

  it("fails closed after coordinated project metadata and field drift", async () => {
    const payload = bytes({
      projectId: PROJECT_ID,
      projectSlug: "factory",
      displayName: "Factory",
      key: "FACT",
      name: "Factory",
      projectType: "software",
    });
    const fake = scriptedTransport(() =>
      response(200, {
        id: "10001",
        key: "FACT",
        name: "Renamed outside App Factory",
        projectTypeKey: "software",
        self: "https://factory.atlassian.test/rest/api/3/project/10001",
        description: jiraProjectDescription(
          JIRA_PROJECT_MARKER,
          "Renamed outside App Factory",
          "Factory",
          sha256Bytes(payload),
        ),
      }),
    );
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport)),
    );
    const current = effect({
      provider: "jira",
      action: "jira.project.ensure",
      resourceType: "jira.project",
      resourceKey: "cloud-123:FACT",
      marker: JIRA_PROJECT_MARKER,
      payload,
    });

    await expect(
      adapter.reconcile({
        effect: { ...current, state: "unknown" },
        ...dispatchContext(JIRA_CREDENTIAL),
      }),
    ).resolves.toMatchObject({
      kind: "manual-intervention",
      code: "jira.project.intent-drift",
    });
    expect(fake.requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("reconciles issue markers but never turns a missing read into a mutation", async () => {
    const task = jiraTaskPayload();
    const payload = bytes(task);
    const observed = jiraIssue({
      id: "20002",
      key: "FACT-2",
      logicalKey: "small-task",
      marker: JIRA_TASK_MARKER,
      issueType: "Task",
      payloadDigest: sha256Bytes(payload),
      parentKey: "FACT-1",
      summary: task.summary,
      description: jiraTaskDescription(task),
    });
    const parent = jiraIssue({
      id: "20001",
      key: "FACT-1",
      logicalKey: "foundation",
      marker: JIRA_EPIC_MARKER,
      issueType: "Epic",
    });
    const fake = scriptedTransport(
      () => response(200, { startAt: 0, maxResults: 50, total: 0, issues: [] }),
      () =>
        response(200, { startAt: 0, maxResults: 50, total: 1, issues: [observed] }, [
          { name: "etag", value: '"issue-search-v3"' },
        ]),
      () => response(200, { startAt: 0, maxResults: 50, total: 1, issues: [parent] }),
    );
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport)),
    );
    const base = effect({
      provider: "jira",
      action: "jira.issue.ensure",
      resourceType: "jira.issue",
      resourceKey: "cloud-123:FACT:issue:small-task",
      marker: JIRA_TASK_MARKER,
      payload,
    });
    await expect(
      adapter.reconcile({
        effect: { ...base, state: "unknown" },
        ...dispatchContext(JIRA_CREDENTIAL),
      }),
    ).resolves.toMatchObject({ kind: "not-found" });
    await expect(
      adapter.reconcile({
        effect: { ...base, state: "unknown" },
        ...dispatchContext(JIRA_CREDENTIAL),
      }),
    ).resolves.toMatchObject({
      kind: "observed",
      resource: { providerResourceId: "20002" },
    });
    expect(fake.requests.every((item) => item.method === "GET")).toBe(true);
  });

  it("fails closed after coordinated marker-property and issue-field drift", async () => {
    const task = jiraTaskPayload();
    const payload = bytes(task);
    const drifted = jiraIssue({
      id: "20002",
      key: "FACT-2",
      logicalKey: "small-task",
      marker: JIRA_TASK_MARKER,
      issueType: "Task",
      payloadDigest: sha256Bytes(payload),
      parentKey: "FACT-1",
      summary: "Changed outside App Factory",
      description: jiraTaskDescription(task),
    });
    const parent = jiraIssue({
      id: "20001",
      key: "FACT-1",
      logicalKey: "foundation",
      marker: JIRA_EPIC_MARKER,
      issueType: "Epic",
    });
    const fake = scriptedTransport(
      () => response(200, { startAt: 0, maxResults: 50, total: 1, issues: [drifted] }),
      () => response(200, { startAt: 0, maxResults: 50, total: 1, issues: [parent] }),
    );
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport)),
    );
    const current = effect({
      provider: "jira",
      action: "jira.issue.ensure",
      resourceType: "jira.issue",
      resourceKey: "cloud-123:FACT:issue:small-task",
      marker: JIRA_TASK_MARKER,
      payload,
    });

    await expect(
      adapter.reconcile({
        effect: { ...current, state: "unknown" },
        ...dispatchContext(JIRA_CREDENTIAL),
      }),
    ).resolves.toMatchObject({
      kind: "manual-intervention",
      code: "jira.issue.intent-drift",
    });
    expect(fake.requests.map((request) => request.method)).toEqual(["GET", "GET"]);
  });

  it("fails unsupported link and attachment intents before all transport I/O", async () => {
    const fake = scriptedTransport();
    const adapter = validateExternalProviderAdapter(
      createJiraCloudHttpAdapter(jiraOptions(fake.transport)),
    );
    const cases = [
      {
        action: "jira.issue-link.ensure",
        resourceType: "jira.issue-link",
        resourceKey: "cloud-123:FACT:link:a:blocks:b",
        marker: `app-factory:v1:jira:issue-link.ensure:${"f".repeat(64)}`,
        code: "jira.issue-link.correlation-contract-unsupported",
      },
      {
        action: "jira.github.attach",
        resourceType: "jira.remote-link",
        resourceKey: "cloud-123:FACT:repository:factory-org/demo",
        marker: `app-factory:v1:jira:github.attach:${"1".repeat(64)}`,
        code: "jira.remote-link.issue-target-required",
      },
    ] as const;
    for (const item of cases) {
      const payload = bytes({ approvedIntent: item.action });
      const current = effect({ provider: "jira", payload, ...item });
      await expect(
        adapter.send({ effect: current, payload, ...dispatchContext(JIRA_CREDENTIAL) }),
      ).resolves.toMatchObject({ kind: "rejected", retryable: false, code: item.code });
      await expect(
        adapter.reconcile({
          effect: { ...current, state: "unknown" },
          ...dispatchContext(JIRA_CREDENTIAL),
        }),
      ).resolves.toMatchObject({ kind: "manual-intervention", code: item.code });
    }
    expect(fake.request).not.toHaveBeenCalled();
  });

  it("observes strict project and issue snapshots with ETag/version provenance", async () => {
    const project = {
      id: "10001",
      key: "FACT",
      name: "Factory",
      projectTypeKey: "software",
      self: "https://factory.atlassian.test/rest/api/3/project/10001",
      description: jiraProjectDescription(),
    };
    const issue = jiraIssue({
      id: "20002",
      key: "FACT-2",
      logicalKey: "small-task",
      marker: JIRA_TASK_MARKER,
      issueType: "Task",
    });
    const fake = scriptedTransport(
      () => response(200, project, [{ name: "etag", value: '"project-v2"' }]),
      () => response(200, issue, [{ name: "etag", value: '"issue-v3"' }]),
    );
    const observer = createJiraReadObserver(jiraReadOptions(fake.transport));
    await expect(
      observer.observeProject("FACT", new AbortController().signal),
    ).resolves.toMatchObject({
      key: "FACT",
      operationMarker: JIRA_PROJECT_MARKER,
      providerRevision: '"project-v2"',
    });
    await expect(
      observer.observeIssue("FACT-2", new AbortController().signal),
    ).resolves.toMatchObject({
      key: "FACT-2",
      issueType: "task",
      version: 3,
      operationMarker: JIRA_TASK_MARKER,
      providerRevision: '"issue-v3"',
    });
  });

  it("bounds and follows Jira marker-search pagination deterministically", async () => {
    const first = jiraIssue({
      id: "20002",
      key: "FACT-2",
      logicalKey: "small-task",
      marker: JIRA_TASK_MARKER,
      issueType: "Task",
    });
    const second = jiraIssue({
      id: "20003",
      key: "FACT-3",
      logicalKey: "small-task",
      marker: JIRA_TASK_MARKER,
      issueType: "Task",
    });
    const fake = scriptedTransport(
      () => response(200, { startAt: 0, maxResults: 1, total: 2, issues: [first] }),
      () => response(200, { startAt: 1, maxResults: 1, total: 2, issues: [second] }),
    );
    const observer = createJiraReadObserver(jiraReadOptions(fake.transport));
    const observations = await observer.findByCorrelation(
      {
        schemaVersion: 1,
        provider: "jira",
        marker: JIRA_TASK_MARKER,
        resourceType: "jira.issue",
        containerKey: "cloud-123:FACT",
        logicalKey: "small-task",
      },
      new AbortController().signal,
    );
    expect(observations).toHaveLength(2);
    expect(fake.requests.map((item) => new URL(item.url).searchParams.get("startAt"))).toEqual([
      "0",
      "1",
    ]);
  });
});
