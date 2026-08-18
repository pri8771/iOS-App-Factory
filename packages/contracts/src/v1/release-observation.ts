import { z } from "zod";

import {
  AscAppV1Schema,
  AscReleaseProjectionV1Schema,
  MAX_ASC_LIST_ITEMS_V1,
} from "./app-store-connect-read-model.js";
import {
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";

/**
 * Studio Phase 6 step B: the release rail's wire model.
 *
 * `release.observe` asks the daemon's composed App Store Connect observer (`packages/asc-adapter`,
 * strictly GET-only, credential resolved just in time by the broker) for one fresh observation of
 * every app the team key can see, and persists it durably (`asc_release_observations`, migration
 * 0014). `release.projection` is the read-only view over that table: the latest persisted
 * observation, or an honest "nothing observed yet" plus the exact reason the daemon cannot observe
 * (no observer configured). Nothing here invents a date: every instant is Apple's own or the
 * daemon's clock at the moment the observation was taken, and the projection onto
 * `RELEASE_STAGE_ORDER_V1` is `projectAscReleaseStageV1` (`app-store-connect-read-model.ts`),
 * surfaced, not duplicated.
 *
 * Nothing secret crosses this wire: the key ID (Apple's public JWT `kid`), the issuer ID (a team
 * identifier, not a secret) and the Keychain item's service/account names are all that identify
 * the observer's source. The `.p8` never leaves the broker window.
 */

/** Apple's API key ID: the JWT `kid`. Ten upper-case alphanumerics. */
export const AscKeyIdSchema = z.string().regex(/^[A-Z0-9]{10}$/, "ten upper-case alphanumerics");
export type AscKeyId = z.infer<typeof AscKeyIdSchema>;

/** Apple's issuer ID: a lowercase UUID naming the team. Not a secret. */
export const AscIssuerIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "lowercase UUID");
export type AscIssuerId = z.infer<typeof AscIssuerIdSchema>;

/**
 * Where an observation's credential came from — by name only. Mirrors the shape of
 * `CredentialReferenceV1` (`adapter-sdk`) minus `schemaVersion`, so a Studio client can print
 * "which Keychain item" without any package outside `contracts` in its dependency graph.
 */
export const AscObserverSourceV1Schema = z.strictObject({
  keyId: AscKeyIdSchema,
  issuerId: AscIssuerIdSchema,
  keychainService: z.string().min(1).max(200),
  keychainAccount: z.string().min(1).max(200),
  origin: z.literal("https://api.appstoreconnect.apple.com"),
});
export type AscObserverSourceV1 = z.infer<typeof AscObserverSourceV1Schema>;

/**
 * The wire summary of an `AscReadOutcome` (`packages/asc-adapter`): `observed` carries the HTTP
 * status and page count; `denied` (401/403) and `ambiguous` (transport failure, redirect,
 * unexpected status, malformed body, page bound) carry the adapter's own code and detail. The
 * observed value itself lives next to this summary in the owning object, never inside it.
 */
export const AscReadOutcomeSummaryV1Schema = z
  .strictObject({
    kind: z.enum(["observed", "denied", "ambiguous"]),
    status: z.number().int().min(100).max(599).nullable(),
    pages: NonNegativeSafeIntegerSchema.nullable(),
    code: z.string().min(1).max(200).nullable(),
    detail: z.string().min(1).max(2_000).nullable(),
  })
  .superRefine((summary, context) => {
    if (summary.kind === "observed") {
      if (summary.status === null || summary.pages === null) {
        context.addIssue({
          code: "custom",
          message: "an observed outcome names its status and page count",
        });
      }
      if (summary.code !== null || summary.detail !== null) {
        context.addIssue({
          code: "custom",
          message: "an observed outcome carries no error code or detail",
        });
      }
    } else {
      if (summary.code === null || summary.detail === null) {
        context.addIssue({
          code: "custom",
          message: "a denied or ambiguous outcome names its code and detail",
        });
      }
      if (summary.pages !== null) {
        context.addIssue({
          code: "custom",
          path: ["pages"],
          message: "only an observed outcome counts pages",
        });
      }
      if (summary.kind === "denied" && summary.status !== 401 && summary.status !== 403) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "a denied outcome is exactly 401 or 403",
        });
      }
    }
  });
export type AscReadOutcomeSummaryV1 = z.infer<typeof AscReadOutcomeSummaryV1Schema>;

/**
 * One app as the observer saw it: the app record, the outcome of each of the two per-app reads,
 * and — only when both reads were observed — the projection onto `RELEASE_STAGE_ORDER_V1`.
 */
export const AscAppReleaseObservationV1Schema = z
  .strictObject({
    app: AscAppV1Schema,
    builds: AscReadOutcomeSummaryV1Schema,
    appStoreVersions: AscReadOutcomeSummaryV1Schema,
    projection: AscReleaseProjectionV1Schema.nullable(),
  })
  .superRefine((observation, context) => {
    const bothObserved =
      observation.builds.kind === "observed" && observation.appStoreVersions.kind === "observed";
    if (bothObserved !== (observation.projection !== null)) {
      context.addIssue({
        code: "custom",
        path: ["projection"],
        message: "a projection is present exactly when both per-app reads were observed",
      });
    }
    if (
      observation.projection !== null &&
      observation.projection.app.appId !== observation.app.appId
    ) {
      context.addIssue({
        code: "custom",
        path: ["projection", "app"],
        message: "the projection describes this observation's app",
      });
    }
  });
export type AscAppReleaseObservationV1 = z.infer<typeof AscAppReleaseObservationV1Schema>;

/** Derived deterministically from the `release.observe` command that took the observation. */
export const AscReleaseObservationIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "lowercase UUID")
  .brand<"AscReleaseObservationId">();
export type AscReleaseObservationId = z.infer<typeof AscReleaseObservationIdSchema>;

const AscReleaseObservationDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  observationId: AscReleaseObservationIdSchema,
  /** The daemon's clock when the observation began; never Apple's. */
  observedAt: IsoInstantSchema,
  source: AscObserverSourceV1Schema,
  /** Outcome of `GET /v1/apps`. Apps below are present only when this was observed. */
  apps: AscReadOutcomeSummaryV1Schema,
  /** Sorted by app name (case-insensitive), then `appId`, so the wire order is canonical. */
  appObservations: z.array(AscAppReleaseObservationV1Schema).max(MAX_ASC_LIST_ITEMS_V1),
  /** Total GETs the observer issued, including pagination. */
  requestCount: NonNegativeSafeIntegerSchema,
  /** HTTP statuses in request order; a transport failure has no status and is not listed. */
  statuses: z.array(z.number().int().min(100).max(599)).max(5_000),
};

export const AscReleaseObservationDigestInputV1Schema = z.strictObject(
  AscReleaseObservationDigestInputV1Shape,
);
export type AscReleaseObservationDigestInputV1 = z.infer<
  typeof AscReleaseObservationDigestInputV1Schema
>;

export const AscReleaseObservationV1Schema = z
  .strictObject({
    ...AscReleaseObservationDigestInputV1Shape,
    /** SHA-256 of the canonical JSON of every field above. */
    observationDigest: Sha256DigestSchema,
  })
  .superRefine((observation, context) => {
    if (observation.apps.kind !== "observed" && observation.appObservations.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["appObservations"],
        message: "no app can be observed when the apps list itself was not",
      });
    }
    const appIds = observation.appObservations.map(({ app }) => app.appId);
    if (new Set(appIds).size !== appIds.length) {
      context.addIssue({
        code: "custom",
        path: ["appObservations"],
        message: "appIds must be unique",
      });
    }
    const sortKey = (entry: (typeof observation.appObservations)[number]): string =>
      `${entry.app.name.toLowerCase()} ${entry.app.appId}`;
    const keys = observation.appObservations.map(sortKey);
    const canonical = [...keys].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    if (JSON.stringify(keys) !== JSON.stringify(canonical)) {
      context.addIssue({
        code: "custom",
        path: ["appObservations"],
        message: "appObservations must be sorted by app name (then appId)",
      });
    }
    if (observation.statuses.length > observation.requestCount) {
      context.addIssue({
        code: "custom",
        path: ["statuses"],
        message: "statuses cannot outnumber requests",
      });
    }
  });
export type AscReleaseObservationV1 = z.infer<typeof AscReleaseObservationV1Schema>;

/**
 * The returned object is the complete canonical SHA-256 input. Callers encode it as recursively
 * key-sorted JSON UTF-8 and exclude `observationDigest`. Mirrors
 * `roomParticipantsCatalogDigestInputV1`/`studioSnapshotDigestInputV1` exactly.
 */
export function ascReleaseObservationDigestInputV1(
  observation: AscReleaseObservationDigestInputV1 | AscReleaseObservationV1,
): AscReleaseObservationDigestInputV1 {
  return AscReleaseObservationDigestInputV1Schema.parse({
    schemaVersion: observation.schemaVersion,
    observationId: observation.observationId,
    observedAt: observation.observedAt,
    source: observation.source,
    apps: observation.apps,
    appObservations: observation.appObservations,
    requestCount: observation.requestCount,
    statuses: observation.statuses,
  });
}

function canonicalJson(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node !== null && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return node;
  };
  return JSON.stringify(normalize(value));
}

/** Canonical UTF-8 text to hash for `observationDigest`. */
export function canonicalAscReleaseObservationDigestInputV1(
  observation: AscReleaseObservationDigestInputV1 | AscReleaseObservationV1,
): string {
  return canonicalJson(ascReleaseObservationDigestInputV1(observation));
}

/**
 * The literal reason `release.projection` reports when the daemon has no App Store Connect
 * observer composed (`APP_FACTORY_ASC_OBSERVER_CONFIG` unset). One shared constant so every
 * "not configured" surface is byte-identical and grep-able, like `STUDIO_NOT_YET_WIRED_REASON_V1`.
 */
export const RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1 =
  "release observer not configured: no App Store Connect observer is composed (APP_FACTORY_ASC_OBSERVER_CONFIG unset), so release.observe cannot read and only previously persisted observations, if any, are served" as const;

/**
 * Whether `release.observe` can currently take a fresh observation, and if not, why. Independent of
 * whether older observations exist: an unconfigured daemon still serves what an earlier, configured
 * one persisted, badged with that observation's own `observedAt`.
 */
export const ReleaseObserverStatusV1Schema = z
  .strictObject({
    configured: z.boolean(),
    unavailableReason: z.string().min(1).max(500).nullable(),
    /** Present exactly when configured: the source a fresh observation would be taken from. */
    source: AscObserverSourceV1Schema.nullable(),
  })
  .superRefine((status, context) => {
    if (status.configured === (status.unavailableReason !== null)) {
      context.addIssue({
        code: "custom",
        path: ["unavailableReason"],
        message: "unavailableReason must be present exactly when the observer is not configured",
      });
    }
    if (status.configured !== (status.source !== null)) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "source must be present exactly when the observer is configured",
      });
    }
  });
export type ReleaseObserverStatusV1 = z.infer<typeof ReleaseObserverStatusV1Schema>;

const ReleaseProjectionDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  observer: ReleaseObserverStatusV1Schema,
  /** The newest persisted observation, or `null` when none has ever been taken on this runtime. */
  latest: AscReleaseObservationV1Schema.nullable(),
  /** How many observations this runtime has persisted in total. */
  observationCount: NonNegativeSafeIntegerSchema,
};

export const ReleaseProjectionDigestInputV1Schema = z.strictObject(
  ReleaseProjectionDigestInputV1Shape,
);
export type ReleaseProjectionDigestInputV1 = z.infer<typeof ReleaseProjectionDigestInputV1Schema>;

export const ReleaseProjectionV1Schema = z
  .strictObject({
    ...ReleaseProjectionDigestInputV1Shape,
    generatedAt: IsoInstantSchema,
    /** SHA-256 of the canonical JSON of every field above except `generatedAt` and this digest. */
    sourceDigest: Sha256DigestSchema,
  })
  .superRefine((projection, context) => {
    if ((projection.latest === null) !== (projection.observationCount === 0)) {
      context.addIssue({
        code: "custom",
        path: ["latest"],
        message: "latest is null exactly when no observation has been persisted",
      });
    }
    if (
      projection.latest !== null &&
      Date.parse(projection.latest.observedAt) > Date.parse(projection.generatedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["latest", "observedAt"],
        message: "the latest observation cannot postdate generatedAt",
      });
    }
  });
export type ReleaseProjectionV1 = z.infer<typeof ReleaseProjectionV1Schema>;

export function releaseProjectionDigestInputV1(
  projection: ReleaseProjectionDigestInputV1 | ReleaseProjectionV1,
): ReleaseProjectionDigestInputV1 {
  return ReleaseProjectionDigestInputV1Schema.parse({
    schemaVersion: projection.schemaVersion,
    observer: projection.observer,
    latest: projection.latest,
    observationCount: projection.observationCount,
  });
}

/** Canonical UTF-8 text to hash for `sourceDigest`. */
export function canonicalReleaseProjectionDigestInputV1(
  projection: ReleaseProjectionDigestInputV1 | ReleaseProjectionV1,
): string {
  return canonicalJson(releaseProjectionDigestInputV1(projection));
}
