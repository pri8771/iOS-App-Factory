import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CommandRequestFrameV1Schema,
  CommandRequestV1Schema,
  CommandResponseV1Schema,
  type CommandRequestForOperationV1,
  type CommandResultForOperationV1,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const COMMAND_ID = "00000000-0000-4000-8000-000000000004";
const REQUEST_ID = "00000000-0000-4000-8000-000000000010";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000005";
const AUTHORIZATION = "test-authorization-token-32-bytes-minimum";

function request(operation: string, payload: unknown): unknown {
  return {
    schemaVersion: 1,
    commandId: COMMAND_ID,
    issuedAt: NOW,
    origin: "cli",
    operation,
    payload,
  };
}

describe("command protocol V1", () => {
  it.each([
    ["doctor", {}],
    ["attempt.status", { attemptId: ATTEMPT_ID }],
    ["attempt.events", { attemptId: ATTEMPT_ID, afterSequence: 0, limit: 100 }],
    ["attempt.list", { scope: "active", projectId: null, after: null, limit: 50 }],
    ["attempt.pause", { attemptId: ATTEMPT_ID, reason: null }],
    ["attempt.resume", { attemptId: ATTEMPT_ID, reason: "Continue." }],
    ["attempt.cancel", { attemptId: ATTEMPT_ID, reason: "Stop." }],
    ["daemon.reconcile", { attemptId: null }],
    ["evidence.list", { afterAttemptId: null, limit: 50 }],
    ["evidence.inspect", { attemptId: ATTEMPT_ID }],
    ["evidence.verify", { attemptId: ATTEMPT_ID }],
    ["portfolio.snapshot", {}],
  ])("accepts the strict %s request", (operation, payload) => {
    expect(CommandRequestV1Schema.safeParse(request(operation, payload)).success).toBe(true);
  });

  it("binds an authenticated frame to request and durable command IDs", () => {
    const parsed = CommandRequestFrameV1Schema.parse({
      protocolVersion: 1,
      requestId: REQUEST_ID,
      authorization: AUTHORIZATION,
      request: request("doctor", {}),
    });
    expect(parsed.requestId).toBe(REQUEST_ID);
    expect(parsed.request.commandId).toBe(COMMAND_ID);
  });

  it("rejects unknown fields and unbounded event queries", () => {
    expect(
      CommandRequestV1Schema.safeParse({ ...request("doctor", {}), pretendHealthy: true }).success,
    ).toBe(false);
    expect(
      CommandRequestV1Schema.safeParse(
        request("attempt.events", {
          attemptId: ATTEMPT_ID,
          afterSequence: 0,
          limit: 1_001,
        }),
      ).success,
    ).toBe(false);
    expect(
      CommandRequestV1Schema.safeParse(
        request("evidence.list", { afterAttemptId: null, limit: 101 }),
      ).success,
    ).toBe(false);
    expect(
      CommandRequestV1Schema.safeParse(
        request("attempt.list", {
          scope: "all",
          projectId: null,
          after: { updatedAt: NOW },
          limit: 50,
        }),
      ).success,
    ).toBe(false);
  });

  it("supports a nullable correlation ID only for protocol failures", () => {
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: null,
        ok: false,
        error: {
          code: "protocol.malformed-request",
          message: "Malformed request.",
          retryable: false,
        },
      }).success,
    ).toBe(true);
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: null,
        ok: true,
        result: {
          operation: "doctor",
          readiness: "ready",
          daemonVersion: "0.1.0",
          protocolVersion: 1,
          startedAt: NOW,
          issues: [],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded attempt-list page through the success envelope", () => {
    expect(
      CommandResponseV1Schema.parse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "attempt.list",
          page: { attempts: [], nextAfter: null, hasMore: false },
        },
      }),
    ).toMatchObject({ result: { operation: "attempt.list", page: { hasMore: false } } });
  });

  it("keeps operation-specific request and result types correlated", () => {
    expectTypeOf<CommandRequestForOperationV1<"attempt.pause">["payload"]>().toEqualTypeOf<{
      attemptId: string & { readonly __brand: "AttemptId" };
      reason: string | null;
    }>();
    expectTypeOf<
      CommandResultForOperationV1<"attempt.pause">["desiredState"]
    >().toEqualTypeOf<"paused">();
    expectTypeOf<CommandRequestForOperationV1<"portfolio.snapshot">["payload"]>().toEqualTypeOf<
      Record<string, never>
    >();
    expectTypeOf<CommandRequestForOperationV1<"attempt.list">["payload"]["scope"]>().toEqualTypeOf<
      "active" | "all"
    >();
    expectTypeOf<
      CommandResultForOperationV1<"attempt.list">["page"]["hasMore"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      CommandResultForOperationV1<"evidence.verify">["integrityVerified"]
    >().toEqualTypeOf<true>();
  });
});
