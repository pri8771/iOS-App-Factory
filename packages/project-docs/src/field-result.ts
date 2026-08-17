import type { ProjectDocsSourceRefV1 } from "@app-factory/contracts";

/** The pre-schema result of trying to extract one field: either a real value with its provenance,
 * or an honest reason it is unavailable. `reader.ts` converts this into the wire `docsField` shape
 * (`{ value, unavailableReason, sources }`). */
export type ParsedDocsField<Value> =
  | Readonly<{ available: true; value: Value; sources: readonly ProjectDocsSourceRefV1[] }>
  | Readonly<{ available: false; unavailableReason: string }>;

export function available<Value>(
  value: Value,
  sources: readonly ProjectDocsSourceRefV1[],
): ParsedDocsField<Value> {
  return { available: true, value, sources };
}

export function unavailable<Value>(reason: string): ParsedDocsField<Value> {
  return { available: false, unavailableReason: reason };
}
