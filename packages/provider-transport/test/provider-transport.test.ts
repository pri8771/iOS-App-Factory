import { describe, expect, it, vi } from "vitest";

import type { CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import {
  createCredentialBroker,
  type CredentialCommandPort,
  type CredentialCommandRequest,
} from "@app-factory/credential-broker";
import {
  createProviderHttpRequest,
  performProviderHttpRequest,
  ProviderHttpContractError,
  type ProviderHttpRequestV1,
} from "@app-factory/provider-http-adapters";

import { createFetchProviderHttpTransport, ProviderTransportError } from "../src/index.js";

// Anchored to "now" (rather than a fixed past date) so the default deadline
// is always in the future regardless of when this suite runs.
const T0 = new Date(Date.now() + 60_000).toISOString();
const T1 = new Date(Date.now() + 120_000).toISOString();

const CREDENTIAL: CredentialReferenceV1 = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: "app-factory.github",
  account: "factory-bot",
};

function credentialCommandPort(
  secret = "test-secret-token",
): CredentialCommandPort & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async (request: CredentialCommandRequest) => {
      if (request.arguments.includes("-w")) {
        return {
          exitCode: 0,
          stdout: Uint8Array.from(Buffer.from(`${secret}\n`)),
          stderr: new Uint8Array(0),
          timedOut: false,
          outputLimitExceeded: false,
        };
      }
      return {
        exitCode: 0,
        stdout: Uint8Array.from(Buffer.from("metadata")),
        stderr: new Uint8Array(0),
        timedOut: false,
        outputLimitExceeded: false,
      };
    }),
  };
}

function baseRequestInput(
  overrides: Partial<Parameters<typeof createProviderHttpRequest>[0]> = {},
) {
  return {
    method: "GET" as const,
    url: "https://api.example.test/repos/owner/name",
    headers: [{ name: "accept", value: "application/vnd.github+json" }],
    body: null,
    credentialReference: CREDENTIAL,
    credentialOrigin: "https://api.example.test",
    deadline: T1,
    signal: new AbortController().signal,
    maximumResponseBytes: 1_024,
    ...overrides,
  };
}

function validRequest(
  overrides: Partial<Parameters<typeof createProviderHttpRequest>[0]> = {},
): ProviderHttpRequestV1 {
  return createProviderHttpRequest(baseRequestInput(overrides));
}

function jsonResponse(
  status: number,
  value: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
): Response {
  return new Response(Buffer.from(`${JSON.stringify(value)}\n`, "utf8"), { status, headers });
}

function streamedResponse(
  chunks: readonly Uint8Array[],
  status = 200,
): Readonly<{
  response: Response;
  fed: Uint8Array[];
}> {
  const fed: Uint8Array[] = [];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        fed.push(chunk);
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return { response: new Response(stream, { status }), fed };
}

describe("createFetchProviderHttpTransport", () => {
  it("resolves the credential via credential-broker.withCredential just-in-time per request", async () => {
    const port = credentialCommandPort("secret-value-one");
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Headers).get("authorization")).toBe("secret-value-one");
      return jsonResponse(200, { ok: true });
    });
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    await performProviderHttpRequest(transport, validRequest());
    await performProviderHttpRequest(transport, validRequest());

    // Not cached: a fresh Keychain read happens for each dispatched request.
    const secretReads = port.run.mock.calls.filter((call) =>
      (call[0] as CredentialCommandRequest).arguments.includes("-w"),
    );
    expect(secretReads).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("attaches Authorization only when the URL origin matches credentialOrigin, else fails closed with no network call", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: true }));
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    // A well-formed request cannot itself carry a mismatched origin (the
    // contract constructor rejects that at build time), so the mismatch is
    // exercised the way a hostile or buggy caller could still reach the
    // transport directly: an object literal shaped like a validated request.
    const mismatched: ProviderHttpRequestV1 = {
      ...validRequest(),
      credentialOrigin: "https://not-the-request-origin.test",
    };

    await expect(transport.request(mismatched)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(port.run).not.toHaveBeenCalled();
  });

  it("hard-rejects a caller-supplied authorization header before any network call", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: true }));
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    const smuggled: ProviderHttpRequestV1 = {
      ...validRequest(),
      headers: [{ name: "authorization", value: "Bearer smuggled" }],
    };

    await expect(transport.request(smuggled)).rejects.toBeInstanceOf(ProviderTransportError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(port.run).not.toHaveBeenCalled();

    const smuggledCookie: ProviderHttpRequestV1 = {
      ...validRequest(),
      headers: [{ name: "cookie", value: "session=leak" }],
    };
    await expect(transport.request(smuggledCookie)).rejects.toBeInstanceOf(ProviderTransportError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-HTTPS URL before any network call", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: true }));
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    const insecure: ProviderHttpRequestV1 = {
      ...validRequest(),
      url: "http://api.example.test/repos/owner/name",
      credentialOrigin: "http://api.example.test",
    };

    await expect(transport.request(insecure)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("disables redirects", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe("manual");
      return jsonResponse(200, { ok: true });
    });
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    await performProviderHttpRequest(transport, validRequest());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fails closed with no network call when the deadline has already elapsed", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: true }));
    const transport = createFetchProviderHttpTransport({
      credentials: broker,
      fetch: fetchSpy,
      clock: { now: () => new Date(Date.parse(T1) + 1) },
    });

    await expect(transport.request(validRequest({ deadline: T1 }))).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(port.run).not.toHaveBeenCalled();
  });

  it("aborts an in-flight request once the deadline elapses", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return await new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        // Never resolves on its own within the test's lifetime; only the
        // deadline-driven abort settles this promise.
        setTimeout(() => undefined, 5_000).unref?.();
      });
    });
    const now = Date.parse(T0);
    const transport = createFetchProviderHttpTransport({
      credentials: broker,
      fetch: fetchSpy,
      clock: { now: () => new Date(now) },
    });

    const deadline = new Date(now + 20).toISOString();
    await expect(transport.request(validRequest({ deadline }))).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  }, 2_000);

  it("streams and counts response bytes, aborting once the declared cap is exceeded", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const chunkA = Uint8Array.from(Buffer.from("0123456789"));
    const chunkB = Uint8Array.from(Buffer.from("abcdefghij"));
    const { response, fed } = streamedResponse([chunkA, chunkB]);
    let capturedSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return response;
    });
    const transport = createFetchProviderHttpTransport({
      credentials: broker,
      fetch: fetchSpy,
    });

    await expect(transport.request(validRequest({ maximumResponseBytes: 15 }))).rejects.toThrow(
      /byte length/,
    );
    expect(capturedSignal?.aborted).toBe(true);
    // Every chunk fed into the stream must be zeroized once the cap trips.
    for (const chunk of fed) {
      expect([...chunk]).toEqual(new Array(chunk.length).fill(0));
    }
  });

  it("zeroizes the credential and the response body buffer after a successful call", async () => {
    const port = credentialCommandPort("zeroize-me");
    const broker = createCredentialBroker(port);
    let capturedSecretRead: Uint8Array | null = null;
    const originalRun = port.run.getMockImplementation();
    if (originalRun === undefined) throw new Error("expected a mock implementation");
    port.run.mockImplementation(async (request: CredentialCommandRequest) => {
      const result = await originalRun(request);
      if (request.arguments.includes("-w")) capturedSecretRead = result.stdout;
      return result;
    });

    const chunk = Uint8Array.from(Buffer.from('{"ok":true}\n'));
    const { response } = streamedResponse([chunk]);
    const fetchSpy = vi.fn(async () => response);
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    const result = await performProviderHttpRequest(transport, validRequest());
    expect(result.status).toBe(200);

    expect(capturedSecretRead).not.toBeNull();
    const secretBytes = capturedSecretRead as unknown as Uint8Array;
    expect([...secretBytes]).toEqual(new Array(secretBytes.length).fill(0));
    // The original streamed chunk is superseded by an owned copy inside the
    // transport, and is zeroized once copied.
    expect([...chunk]).toEqual(new Array(chunk.length).fill(0));
  });

  it("zeroizes partially-read response buffers when the call fails", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const chunk = Uint8Array.from(Buffer.from("some-bytes"));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
      },
      // Invoked once the first chunk above has been read and the consumer
      // pulls for more, guaranteeing the chunk is already in the
      // transport's accumulator before the stream errors.
      pull(controller) {
        controller.error(new Error("network reset"));
      },
    });
    const fetchSpy = vi.fn(async () => new Response(stream, { status: 200 }));
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    await expect(transport.request(validRequest())).rejects.toThrow();
    expect([...chunk]).toEqual(new Array(chunk.length).fill(0));
  });

  it("passes an allowlisted request header through and returns an allowlisted response header end-to-end", async () => {
    const port = credentialCommandPort("pass-through-token");
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Headers;
      expect(headers.get("accept")).toBe("application/vnd.github+json");
      expect(headers.get("authorization")).toBe("pass-through-token");
      return jsonResponse(
        200,
        { ok: true },
        { "content-type": "application/json", etag: '"abc123"' },
      );
    });
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    const result = await performProviderHttpRequest(transport, validRequest());
    expect(result.status).toBe(200);
    expect(result.headers.get("etag")).toBe('"abc123"');
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(Buffer.from(result.body).toString("utf8"))).toEqual({ ok: true });
  });

  it("surfaces the underlying contract error type when composed validation rejects a request", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: true }));
    const transport = createFetchProviderHttpTransport({ credentials: broker, fetch: fetchSpy });

    const disallowedHeader: ProviderHttpRequestV1 = {
      ...validRequest(),
      headers: [{ name: "x-not-on-the-allowlist", value: "nope" }],
    };
    await expect(transport.request(disallowedHeader)).rejects.toBeInstanceOf(
      ProviderHttpContractError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("exposes ProviderTransportError for transport-specific failures", async () => {
    const port = credentialCommandPort();
    const broker = createCredentialBroker(port);
    const fetchSpy = vi.fn(async () => jsonResponse(200, { ok: true }));
    const transport = createFetchProviderHttpTransport({
      credentials: broker,
      fetch: fetchSpy,
      clock: { now: () => new Date(Date.parse(T1) + 1) },
    });

    await expect(transport.request(validRequest({ deadline: T1 }))).rejects.toBeInstanceOf(
      ProviderTransportError,
    );
  });
});
