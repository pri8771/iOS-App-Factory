import type {
  CommandRequestV1,
  CommandResultV1,
  EvidenceManifestDescriptorV1,
} from "@app-factory/contracts";
import type { EvidenceManifestRecord, EvidenceStore } from "@app-factory/evidence-store";

import { CommandHandlerError } from "./unix-command-server.js";

export type EvidenceCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "evidence.list" | "evidence.inspect" | "evidence.verify" }
>;

function descriptor(record: EvidenceManifestRecord): EvidenceManifestDescriptorV1 {
  return {
    attemptId: record.manifest.attemptId,
    createdAt: record.manifest.createdAt,
    manifestDigest: record.digest,
    subject: record.manifest.subject,
    entryCount: record.manifest.entries.length,
    requiredKinds: record.manifest.requiredKinds,
  };
}

function readStore<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CommandHandlerError) throw error;
    throw new CommandHandlerError(
      "evidence.integrity-failed",
      "The private evidence store could not be read and verified.",
      false,
    );
  }
}

function requireManifest(store: EvidenceStore, request: EvidenceCommandRequestV1) {
  if (request.operation === "evidence.list") {
    throw new TypeError("evidence.list does not identify one manifest");
  }
  const record = readStore(() => store.findManifestRecord(request.payload.attemptId));
  if (record === null) {
    throw new CommandHandlerError(
      "evidence.not-found",
      `No evidence manifest exists for attempt ${request.payload.attemptId}.`,
      false,
    );
  }
  return record;
}

export function executeEvidenceCommand(
  store: EvidenceStore,
  request: EvidenceCommandRequestV1,
): CommandResultV1 {
  switch (request.operation) {
    case "evidence.list": {
      const page = readStore(() =>
        store.listManifests({
          afterAttemptId: request.payload.afterAttemptId,
          limit: request.payload.limit,
        }),
      );
      return {
        operation: "evidence.list",
        manifests: page.records.map(descriptor),
        nextAfterAttemptId: page.nextAfterAttemptId,
        hasMore: page.hasMore,
      };
    }
    case "evidence.inspect": {
      const record = requireManifest(store, request);
      return {
        operation: "evidence.inspect",
        manifest: record.manifest,
        manifestDigest: record.digest,
      };
    }
    case "evidence.verify": {
      const record = requireManifest(store, request);
      const verified = readStore(() => store.verify(record.manifest.attemptId));
      if (verified.manifestDigest !== record.digest) {
        throw new CommandHandlerError(
          "evidence.integrity-failed",
          "The evidence manifest changed while it was being verified.",
          false,
        );
      }
      return {
        operation: "evidence.verify",
        integrityVerified: true,
        manifest: descriptor(record),
        evidence: verified.evidence.map((evidence, index) => {
          const entry = verified.manifest.entries[index];
          if (entry === undefined || entry.evidenceId !== evidence.evidenceId) {
            throw new CommandHandlerError(
              "evidence.integrity-failed",
              "Verified evidence order does not match its immutable manifest.",
              false,
            );
          }
          return {
            evidenceId: evidence.evidenceId,
            digest: entry.digest,
            kind: evidence.kind,
            createdAt: evidence.createdAt,
            producer: evidence.producer,
            artifactCount: evidence.artifacts.length,
          };
        }),
        artifactCount: verified.artifactCount,
      };
    }
  }
}
