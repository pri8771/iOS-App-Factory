import { z } from "zod";

import { ExternalProviderV1Schema } from "./external-effect.js";
import {
  NamespacedCodeSchema,
  RelativePathSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
} from "./primitives.js";

export const ModuleManifestV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    moduleId: NamespacedCodeSchema,
    moduleVersion: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/),
    trusted: z.literal(true),
    entrypoint: RelativePathSchema,
    minimumKernelVersion: z.string().min(1).max(100),
    configSchemaDigest: Sha256DigestSchema,
    commands: z.array(NamespacedCodeSchema).max(100),
    consumesEvents: z.array(NamespacedCodeSchema).max(200),
    externalEffects: z
      .array(z.strictObject({ provider: ExternalProviderV1Schema, action: NamespacedCodeSchema }))
      .max(200),
    qualityGates: z.array(NamespacedCodeSchema).max(100),
    dashboardPanels: z.array(StableKeySchema).max(50),
  })
  .superRefine((manifest, context) => {
    const collections: readonly (readonly string[])[] = [
      manifest.commands,
      manifest.consumesEvents,
      manifest.externalEffects.map((effect) => `${effect.provider}\0${effect.action}`),
      manifest.qualityGates,
      manifest.dashboardPanels,
    ];
    if (collections.some((values) => new Set(values).size !== values.length)) {
      context.addIssue({ code: "custom", message: "module capabilities must be unique" });
    }
  });
export type ModuleManifestV1 = z.infer<typeof ModuleManifestV1Schema>;
