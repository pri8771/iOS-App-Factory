import { describe, expect, it, vi } from "vitest";

import {
  reconcileProvisionOperation,
  type CorrelationQueryV1,
  type ProvisionOperationV1,
  type ReadOnlyCorrelationPort,
} from "../src/index.js";
import { provisionPlan, resourceObservation } from "./fixtures.js";

function issueOperation(): ProvisionOperationV1 {
  const operation = provisionPlan().operations.find((item) => item.action === "jira.issue.ensure");
  if (operation === undefined) throw new Error("fixture has no issue operation");
  return operation;
}

class FakeProvider {
  public readonly observations: unknown[] = [];
  public readonly queries: CorrelationQueryV1[] = [];

  public async createThenTimeout(operation: ProvisionOperationV1): Promise<never> {
    this.observations.push(resourceObservation(operation));
    throw new Error("simulated timeout after provider committed the mutation");
  }

  public readonly port: ReadOnlyCorrelationPort = {
    findByCorrelation: async (query, signal) => {
      if (signal.aborted) throw new Error("cancelled");
      this.queries.push(query);
      return this.observations;
    },
  };
}

describe("read-only provider reconciliation", () => {
  it("recovers a timeout-after-mutation by exact stable marker without a second send", async () => {
    const operation = issueOperation();
    const provider = new FakeProvider();
    await expect(provider.createThenTimeout(operation)).rejects.toThrow(/timeout after/);

    const result = await reconcileProvisionOperation({
      operation,
      dispatchKnowledge: "ambiguous-timeout",
      port: provider.port,
      signal: new AbortController().signal,
    });

    expect(result).toEqual(
      expect.objectContaining({ kind: "observed", safeToDispatch: false, code: null }),
    );
    expect(provider.observations).toHaveLength(1);
    expect(provider.queries).toEqual([
      {
        schemaVersion: 1,
        provider: operation.provider,
        marker: operation.operationMarker,
        resourceType: operation.correlation.resourceType,
        containerKey: operation.correlation.containerKey,
        logicalKey: operation.correlation.logicalKey,
      },
    ]);
  });

  it("never permits a retry when an ambiguous send is not yet observable", async () => {
    const result = await reconcileProvisionOperation({
      operation: issueOperation(),
      dispatchKnowledge: "ambiguous-timeout",
      port: {
        async findByCorrelation() {
          return [];
        },
      },
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      schemaVersion: 1,
      kind: "pending",
      code: "reconcile.ambiguous-timeout",
      safeToDispatch: false,
      observation: null,
    });
  });

  it("permits dispatch only when no mutation was attempted or mutation absence is definitive", async () => {
    for (const dispatchKnowledge of ["not-attempted", "definitive-no-mutation"] as const) {
      const result = await reconcileProvisionOperation({
        operation: issueOperation(),
        dispatchKnowledge,
        port: {
          async findByCorrelation() {
            return [];
          },
        },
        signal: new AbortController().signal,
      });
      expect(result.kind).toBe("not-found");
      expect(result.safeToDispatch).toBe(true);
    }
  });

  it("fails closed when a marker resolves to duplicate resources or a different identity", async () => {
    const operation = issueOperation();
    const duplicates = await reconcileProvisionOperation({
      operation,
      dispatchKnowledge: "ambiguous-transport",
      port: {
        async findByCorrelation() {
          return [
            resourceObservation(operation, { providerResourceId: "10001" }),
            resourceObservation(operation, { providerResourceId: "10002" }),
          ];
        },
      },
      signal: new AbortController().signal,
    });
    expect(duplicates).toEqual(
      expect.objectContaining({
        kind: "manual-intervention",
        code: "reconcile.duplicate-marker",
        safeToDispatch: false,
      }),
    );

    const collision = await reconcileProvisionOperation({
      operation,
      dispatchKnowledge: "ambiguous-timeout",
      port: {
        async findByCorrelation() {
          return [resourceObservation(operation, { logicalKey: "another.logical-key" })];
        },
      },
      signal: new AbortController().signal,
    });
    expect(collision).toEqual(
      expect.objectContaining({
        kind: "manual-intervention",
        code: "reconcile.marker-collision",
      }),
    );
  });

  it("redacts read failures and malformed provider output into fail-closed decisions", async () => {
    const failure = await reconcileProvisionOperation({
      operation: issueOperation(),
      dispatchKnowledge: "ambiguous-timeout",
      port: {
        async findByCorrelation() {
          throw new Error("provider response contained secret-value");
        },
      },
      signal: new AbortController().signal,
    });
    expect(JSON.stringify(failure)).not.toContain("secret-value");
    expect(failure).toEqual(
      expect.objectContaining({
        kind: "pending",
        code: "reconcile.read-failed",
        safeToDispatch: false,
      }),
    );

    const malformed = await reconcileProvisionOperation({
      operation: issueOperation(),
      dispatchKnowledge: "not-attempted",
      port: {
        async findByCorrelation() {
          return { token: "secret-value" };
        },
      },
      signal: new AbortController().signal,
    });
    expect(malformed).toEqual(
      expect.objectContaining({ kind: "manual-intervention", code: "reconcile.invalid-response" }),
    );
  });

  it("does not invoke a mutation surface", async () => {
    const find = vi.fn(async () => [resourceObservation(issueOperation())]);
    await reconcileProvisionOperation({
      operation: issueOperation(),
      dispatchKnowledge: "ambiguous-timeout",
      port: { findByCorrelation: find },
      signal: new AbortController().signal,
    });
    expect(find).toHaveBeenCalledOnce();
  });
});
