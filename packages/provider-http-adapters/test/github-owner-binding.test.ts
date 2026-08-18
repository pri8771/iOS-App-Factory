import { describe, expect, it, vi } from "vitest";

import type { CredentialReferenceV1 } from "@app-factory/adapter-sdk";

import {
  ProviderResponseError,
  assertGitHubOwnerBindingCoversRepository,
  assertGitHubOwnerBindingMatches,
  createGitHubOwnerBinding,
  deriveGitHubBearerAuthorization,
  parseGitHubOwnerBinding,
  type BoundedProviderHttpTransport,
  type GitHubOwnerBindingV1,
  type ProviderHttpRequestV1,
  type ProviderHttpResponseV1,
} from "../src/index.js";

const T0 = "2026-08-17T22:00:00.000Z";
const CREDENTIAL: CredentialReferenceV1 = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: "app-factory-github-token",
  account: "app-factory",
};
const OWNER = "pri8771";
const OWNER_NODE_ID = "U_kgDOAbCdEf";
const REPOSITORIES = ["pri8771/iOS-App-Factory", "pri8771/hindsight"];

function bytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function response(
  status: number,
  value: unknown,
  headers: readonly { name: string; value: string }[] = [
    { name: "content-type", value: "application/json; charset=utf-8" },
    { name: "x-ratelimit-remaining", value: "4999" },
  ],
): ProviderHttpResponseV1 {
  return { schemaVersion: 1, status, headers, body: bytes(value) };
}

type RequestHandler = (request: ProviderHttpRequestV1) => unknown | Promise<unknown>;

function scriptedTransport(...handlers: readonly RequestHandler[]) {
  const requests: ProviderHttpRequestV1[] = [];
  const bodies: string[] = [];
  const request = vi.fn(async (input: ProviderHttpRequestV1) => {
    requests.push({ ...input, headers: input.headers.map((header) => ({ ...header })) });
    bodies.push(input.body === null ? "" : Buffer.from(input.body).toString("utf8"));
    const handler = handlers[requests.length - 1];
    if (handler === undefined) throw new Error("unexpected HTTP request");
    return await handler(input);
  });
  return {
    transport: { request } satisfies BoundedProviderHttpTransport,
    request,
    requests,
    bodies,
  };
}

function viewerData(overrides: Record<string, unknown> = {}) {
  return {
    viewer: { id: OWNER_NODE_ID, login: OWNER },
    repositoryOwner: { __typename: "User", id: OWNER_NODE_ID, login: OWNER },
    repository0: { id: "R_kgDOAAAA01", nameWithOwner: "pri8771/iOS-App-Factory", isPrivate: true },
    repository1: { id: "R_kgDOAAAA02", nameWithOwner: "pri8771/hindsight", isPrivate: true },
    ...overrides,
  };
}

function options(transport: BoundedProviderHttpTransport) {
  return {
    transport,
    apiBaseUrl: "https://api.github.com",
    owner: OWNER,
    enrolledRepositories: REPOSITORIES,
    credentialReference: CREDENTIAL,
    clock: { now: () => new Date(T0) },
  };
}

async function bind(transport: BoundedProviderHttpTransport): Promise<GitHubOwnerBindingV1> {
  return await createGitHubOwnerBinding(options(transport), new AbortController().signal);
}

describe("createGitHubOwnerBinding", () => {
  it("makes exactly one read-only GraphQL request bound to the credential origin and returns a digest-bound binding", async () => {
    const scripted = scriptedTransport(() => response(200, { data: viewerData() }));

    const binding = await bind(scripted.transport);

    expect(scripted.request).toHaveBeenCalledTimes(1);
    const request = scripted.requests[0];
    if (request === undefined) throw new Error("expected one recorded request");
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://api.github.com/graphql");
    expect(request.credentialOrigin).toBe("https://api.github.com");
    expect(request.credentialReference).toEqual(CREDENTIAL);
    expect(request.headers.map((header) => header.name).sort()).toEqual([
      "accept",
      "content-type",
      "x-github-api-version",
    ]);
    const body = JSON.parse(scripted.bodies[0] ?? "") as { query: string; variables: unknown };
    expect(body.query.startsWith("query AppFactoryOwnerBinding(")).toBe(true);
    expect(body.query).not.toContain("mutation");
    expect(body.query).toContain("viewer { id login }");
    expect(body.query).toContain("repositoryOwner(login: $owner)");
    expect(body.variables).toEqual({ owner: OWNER, name0: "iOS-App-Factory", name1: "hindsight" });

    expect(binding).toMatchObject({
      schemaVersion: 1,
      provider: "github",
      viewerLogin: OWNER,
      viewerNodeId: OWNER_NODE_ID,
      ownerLogin: OWNER,
      ownerNodeId: OWNER_NODE_ID,
      ownerType: "User",
      enrolledRepositories: REPOSITORIES,
      observedRepositories: [
        { fullName: "pri8771/iOS-App-Factory", nodeId: "R_kgDOAAAA01", visibility: "private" },
        { fullName: "pri8771/hindsight", nodeId: "R_kgDOAAAA02", visibility: "private" },
      ],
      credentialReference: CREDENTIAL,
      credentialOrigin: "https://api.github.com",
      boundAt: T0,
    });
    expect(binding.bindingDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(binding)).not.toContain("authorization");
    // Round-trips through the strict parser unchanged.
    expect(parseGitHubOwnerBinding(JSON.parse(JSON.stringify(binding)))).toEqual(binding);
  });

  it("records only the enrolled repositories the credential can see, tolerating GitHub's per-alias NOT_FOUND errors", async () => {
    const scripted = scriptedTransport(() =>
      response(200, {
        data: viewerData({ repository1: null }),
        errors: [
          {
            type: "NOT_FOUND",
            path: ["repository1"],
            message: "Could not resolve to a Repository with the name 'pri8771/hindsight'.",
          },
        ],
      }),
    );

    const binding = await bind(scripted.transport);
    expect(binding.observedRepositories.map((entry) => entry.fullName)).toEqual([
      "pri8771/iOS-App-Factory",
    ]);
    expect(binding.enrolledRepositories).toEqual(REPOSITORIES);
    expect(() => assertGitHubOwnerBindingCoversRepository(binding, "pri8771/hindsight")).toThrow(
      ProviderResponseError,
    );
    expect(
      assertGitHubOwnerBindingCoversRepository(binding, "PRI8771/ios-app-factory").nodeId,
    ).toBe("R_kgDOAAAA01");
  });

  it("fails closed on GraphQL errors that are not repository-visibility errors", async () => {
    const scripted = scriptedTransport(() =>
      response(200, {
        data: viewerData({ viewer: null }),
        errors: [{ type: "FORBIDDEN", path: ["viewer"], message: "Resource not accessible" }],
      }),
    );
    await expect(bind(scripted.transport)).rejects.toThrow(
      "returned an error outside repository visibility",
    );
  });

  it("fails closed when the credential authenticates as someone other than the enrolled user owner", async () => {
    const scripted = scriptedTransport(() =>
      response(200, { data: viewerData({ viewer: { id: "U_other", login: "someone-else" } }) }),
    );
    await expect(bind(scripted.transport)).rejects.toThrow(
      "authenticates as someone-else, not the enrolled user owner pri8771",
    );
  });

  it("fails closed when GitHub resolves a different owner, cannot resolve the owner, or returns the wrong repository", async () => {
    const wrongOwner = scriptedTransport(() =>
      response(200, {
        data: viewerData({
          repositoryOwner: { __typename: "User", id: "U_x", login: "not-pri8771" },
        }),
      }),
    );
    await expect(bind(wrongOwner.transport)).rejects.toThrow("resolved owner not-pri8771");

    const noOwner = scriptedTransport(() =>
      response(200, { data: viewerData({ repositoryOwner: null }) }),
    );
    await expect(bind(noOwner.transport)).rejects.toThrow("could not resolve the enrolled owner");

    const wrongRepository = scriptedTransport(() =>
      response(200, {
        data: viewerData({
          repository1: { id: "R_z", nameWithOwner: "pri8771/other", isPrivate: false },
        }),
      }),
    );
    await expect(bind(wrongRepository.transport)).rejects.toThrow(
      "returned repository pri8771/other for enrolled repository pri8771/hindsight",
    );
  });

  it("records both identities for an organization owner instead of requiring viewer equality", async () => {
    const scripted = scriptedTransport(() =>
      response(200, {
        data: {
          viewer: { id: "U_member", login: "member-login" },
          repositoryOwner: { __typename: "Organization", id: "O_org", login: "factory-org" },
          repository0: { id: "R_1", nameWithOwner: "factory-org/app", isPrivate: true },
        },
      }),
    );
    const binding = await createGitHubOwnerBinding(
      {
        ...options(scripted.transport),
        owner: "factory-org",
        enrolledRepositories: ["factory-org/app"],
      },
      new AbortController().signal,
    );
    expect(binding.ownerType).toBe("Organization");
    expect(binding.viewerLogin).toBe("member-login");
    expect(binding.ownerNodeId).toBe("O_org");
  });

  it("surfaces a non-200 answer (for example a 401 from a mis-provisioned credential) as a failure, never a binding", async () => {
    const scripted = scriptedTransport(() =>
      response(401, { message: "Bad credentials", documentation_url: "https://docs.github.com" }),
    );
    await expect(bind(scripted.transport)).rejects.toThrow("returned HTTP 401");
  });

  it("rejects enrolled repositories outside the owner and an empty enrollment before any request", async () => {
    const scripted = scriptedTransport();
    await expect(
      createGitHubOwnerBinding(
        { ...options(scripted.transport), enrolledRepositories: ["other/app"] },
        new AbortController().signal,
      ),
    ).rejects.toThrow("does not belong to pri8771");
    await expect(
      createGitHubOwnerBinding(
        { ...options(scripted.transport), enrolledRepositories: [] },
        new AbortController().signal,
      ),
    ).rejects.toThrow("at least one repository");
    expect(scripted.request).not.toHaveBeenCalled();
  });
});

describe("deriveGitHubBearerAuthorization", () => {
  it("prefixes the bare Keychain token with the Bearer scheme without mutating the secret buffer", () => {
    const secret = Uint8Array.from(Buffer.from("github_pat_example"));
    expect(deriveGitHubBearerAuthorization(secret)).toBe("Bearer github_pat_example");
    expect(Buffer.from(secret).toString("utf8")).toBe("github_pat_example");
  });
});

describe("parseGitHubOwnerBinding / assertGitHubOwnerBindingMatches", () => {
  async function fixture(): Promise<GitHubOwnerBindingV1> {
    return await bind(scriptedTransport(() => response(200, { data: viewerData() })).transport);
  }

  it("rejects a binding whose contents were edited after it was digested", async () => {
    const binding = await fixture();
    const tampered = { ...binding, boundAt: "2026-08-18T00:00:00.000Z" };
    expect(() => parseGitHubOwnerBinding(tampered)).toThrow("digest does not match");
    const bothIdsSwapped = { ...binding, ownerNodeId: "U_tampered", viewerNodeId: "U_tampered" };
    expect(() => parseGitHubOwnerBinding(bothIdsSwapped)).toThrow("digest does not match");
    const extraKey = { ...binding, note: "hello" };
    expect(() => parseGitHubOwnerBinding(extraKey)).toThrow("unexpected or missing fields");
    const notEnrolled = {
      ...binding,
      observedRepositories: [
        ...binding.observedRepositories,
        { fullName: "pri8771/extra", nodeId: "R_extra", visibility: "public" },
      ],
    };
    expect(() => parseGitHubOwnerBinding(notEnrolled)).toThrow("was not enrolled");
  });

  it("never accepts a binding that carries credential material", async () => {
    const binding = await fixture();
    const withValue = {
      ...binding,
      credentialReference: { ...binding.credentialReference, value: "ghp_secret" },
    };
    expect(() => parseGitHubOwnerBinding(withValue)).toThrow();
  });

  it("gates observer construction on the exact owner, node ID, credential reference, and origin", async () => {
    const binding = await fixture();
    const expected = {
      owner: OWNER,
      ownerNodeId: OWNER_NODE_ID,
      credentialReference: CREDENTIAL,
      credentialOrigin: "https://api.github.com",
    };
    expect(assertGitHubOwnerBindingMatches(binding, expected)).toEqual(binding);
    expect(() =>
      assertGitHubOwnerBindingMatches(binding, { ...expected, ownerNodeId: "U_other" }),
    ).toThrow("owner node ID does not match");
    expect(() =>
      assertGitHubOwnerBindingMatches(binding, { ...expected, owner: "someone" }),
    ).toThrow("owner login does not match");
    expect(() =>
      assertGitHubOwnerBindingMatches(binding, {
        ...expected,
        credentialReference: { ...CREDENTIAL, account: "other-account" },
      }),
    ).toThrow("credential reference does not match");
    expect(() =>
      assertGitHubOwnerBindingMatches(binding, {
        ...expected,
        credentialOrigin: "https://github.example.test",
      }),
    ).toThrow("credential origin does not match");
  });
});
