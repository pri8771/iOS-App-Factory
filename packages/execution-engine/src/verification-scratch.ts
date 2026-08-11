import { basename, dirname, isAbsolute, resolve } from "node:path";

export const VERIFICATION_SCRATCH_TOKEN = "{verificationScratch}";

const UUID_V4_SUFFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function tokenCount(value: string): number {
  return value.split(VERIFICATION_SCRATCH_TOKEN).length - 1;
}

export function assertVerificationArgsTemplate(args: readonly string[]): void {
  for (const argument of args) {
    if (tokenCount(argument) > 1) {
      throw new TypeError("A verification argument may contain the scratch token at most once");
    }
  }
}

export function materializeVerificationArgs(
  args: readonly string[],
  scratchDirectory: string,
): readonly string[] {
  assertVerificationArgsTemplate(args);
  if (
    scratchDirectory.includes("\0") ||
    !isAbsolute(scratchDirectory) ||
    resolve(scratchDirectory) !== scratchDirectory
  ) {
    throw new TypeError("Verification scratch must be a normalized absolute path");
  }
  return args.map((argument) => argument.replace(VERIFICATION_SCRATCH_TOKEN, scratchDirectory));
}

/**
 * Evidence stores the reviewed argument template but the verifier records the
 * materialized argv. This proves the only substituted value is the
 * coordinator-owned attempt/fence/check identity.
 */
export function verificationArgvMatchesTemplate(
  actualArgv: readonly string[],
  template: Readonly<{ checkId: string; executable: string; args: readonly string[] }>,
  binding: Readonly<{ attemptId: string; fence: number; exactFence?: boolean }>,
): boolean {
  if (
    actualArgv.length !== template.args.length + 1 ||
    actualArgv[0] !== template.executable ||
    !Number.isSafeInteger(binding.fence) ||
    binding.fence < 0
  ) {
    return false;
  }
  try {
    assertVerificationArgsTemplate(template.args);
  } catch {
    return false;
  }

  let observedScratch: string | null = null;
  for (const [index, templateArgument] of template.args.entries()) {
    const actualArgument = actualArgv[index + 1];
    if (actualArgument === undefined) return false;
    const tokenIndex = templateArgument.indexOf(VERIFICATION_SCRATCH_TOKEN);
    if (tokenIndex < 0) {
      if (actualArgument !== templateArgument) return false;
      continue;
    }
    const prefix = templateArgument.slice(0, tokenIndex);
    const suffix = templateArgument.slice(tokenIndex + VERIFICATION_SCRATCH_TOKEN.length);
    if (
      !actualArgument.startsWith(prefix) ||
      !actualArgument.endsWith(suffix) ||
      actualArgument.length <= prefix.length + suffix.length
    ) {
      return false;
    }
    const scratch = actualArgument.slice(prefix.length, actualArgument.length - suffix.length);
    if (
      scratch.includes("\0") ||
      !isAbsolute(scratch) ||
      resolve(scratch) !== scratch ||
      (observedScratch !== null && observedScratch !== scratch)
    ) {
      return false;
    }
    observedScratch = scratch;
    if (actualArgument !== templateArgument.replace(VERIFICATION_SCRATCH_TOKEN, scratch)) {
      return false;
    }
  }

  if (observedScratch === null) return true;
  const identity = basename(observedScratch);
  const nonce = identity.slice(`${template.checkId}-`.length);
  const fenceMatch = /^fence-(0|[1-9][0-9]*)$/u.exec(basename(dirname(observedScratch)));
  const observedFence = fenceMatch === null ? -1 : Number(fenceMatch[1]);
  return (
    identity.startsWith(`${template.checkId}-`) &&
    UUID_V4_SUFFIX.test(nonce) &&
    Number.isSafeInteger(observedFence) &&
    observedFence >= 0 &&
    (binding.exactFence === true
      ? observedFence === binding.fence
      : observedFence <= binding.fence) &&
    basename(dirname(dirname(observedScratch))) === binding.attemptId &&
    basename(dirname(dirname(dirname(observedScratch)))) === "verification-scratch"
  );
}
