import { sha256Bytes } from "@app-factory/adapter-sdk";
import {
  IsoInstantSchema,
  Sha256DigestSchema,
  type IsoInstant,
  type Sha256Digest,
} from "@app-factory/contracts";

import { fail, parseJsonBytes, zeroBytes } from "./validation.js";

export const MAX_EFFECT_PAYLOAD_BYTES = 256 * 1_024;

export type EffectPayloadReadRequest = Readonly<{
  payloadDigest: Sha256Digest;
  deadline: IsoInstant;
  signal: AbortSignal;
}>;

/**
 * Local trusted payload authority used by mutation adapters. Implementations
 * must return a disposable byte copy and honor the supplied deadline/signal.
 */
export type EffectPayloadReader = Readonly<{
  read(input: EffectPayloadReadRequest): Promise<Uint8Array> | Uint8Array;
}>;

export function requireEffectPayloadReader(value: EffectPayloadReader): EffectPayloadReader {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as Partial<EffectPayloadReader>).read !== "function"
  ) {
    fail("effect payload reader is required");
  }
  return value;
}

export async function readVerifiedEffectPayloadJson(
  reader: EffectPayloadReader,
  input: EffectPayloadReadRequest & Readonly<{ label: string }>,
): Promise<unknown> {
  const payloadDigest = Sha256DigestSchema.parse(input.payloadDigest);
  const operationDeadline = IsoInstantSchema.parse(input.deadline);
  if (!(input.signal instanceof AbortSignal) || input.signal.aborted) {
    fail(`${input.label} read was aborted`);
  }

  let readerBytes: unknown;
  let verifiedBytes: Uint8Array | undefined;
  try {
    readerBytes = await reader.read({
      payloadDigest,
      deadline: operationDeadline,
      signal: input.signal,
    });
    if (!(readerBytes instanceof Uint8Array)) {
      fail(`${input.label} reader returned invalid bytes`);
    }
    if (readerBytes.byteLength < 1 || readerBytes.byteLength > MAX_EFFECT_PAYLOAD_BYTES) {
      fail(`${input.label} exceeds the bounded payload size`);
    }
    verifiedBytes = Uint8Array.from(readerBytes);
    zeroBytes(readerBytes);
    if (input.signal.aborted) fail(`${input.label} read was aborted`);
    if (sha256Bytes(verifiedBytes) !== payloadDigest) {
      fail(`${input.label} does not match its persisted digest`);
    }
    return parseJsonBytes(verifiedBytes, input.label);
  } finally {
    if (readerBytes instanceof Uint8Array) zeroBytes(readerBytes);
    if (verifiedBytes !== undefined) zeroBytes(verifiedBytes);
  }
}
