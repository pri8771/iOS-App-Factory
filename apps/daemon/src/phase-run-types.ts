/**
 * Shared between `phase-output-mirror.ts` and `phase-run-executor.ts`, in a module neither of them
 * owns: both files need `PhaseOutputFileV1` (one produces it, the other consumes it) and both also
 * exchange other port types across the same boundary (`PhaseInputsReaderPort`), so defining it in
 * either file directly would make that file import back from the other — a workspace-internal
 * import cycle `no-circular-workspace-dependencies` (dependency-cruiser) rejects even when the only
 * edge is a type-only import. This file exists purely to give the shared shape a home with no
 * dependencies of its own.
 */
export type PhaseOutputFileV1 = Readonly<{ path: string; content: string }>;
