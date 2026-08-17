import {
  IsoInstantSchema,
  type CommandRequestV1,
  type CommandResultV1,
  type IsoInstant,
} from "@app-factory/contracts";
import {
  buildMirrorProjectionV1,
  diffMirrorProjectionV1,
  readProjectDocsSnapshot,
} from "@app-factory/project-docs";

import { assertRepositoryPathIsUsable } from "./project-command-runtime.js";
import { CommandHandlerError } from "./unix-command-server.js";

export type MirrorPlanCommandRequestV1 = Extract<CommandRequestV1, { operation: "mirror.plan" }>;

/**
 * `mirror.plan` (mirror direction, contract only): rereads the project's current repo docs,
 * projects them onto the bounded `MirrorProjectionV1` shape a future Jira/Notion adapter may
 * receive, and diffs it against the caller-supplied `previousProjection`. No provider HTTP call, no
 * credential lookup, and no daemon-side persistence of "the last projection" happens here -- see
 * `@app-factory/project-docs`'s `mirror.ts` module doc comment. `previousProjection.projectId` must
 * match the request's `projectId`, mirroring `diffMirrorProjectionV1`'s own guard, so a caller cannot
 * accidentally diff one project's mirror state against another's.
 */
export async function executeMirrorPlanCommand(
  request: MirrorPlanCommandRequestV1,
  observedAt: IsoInstant,
): Promise<CommandResultV1> {
  const { projectId, repositoryRoot, previousProjection } = request.payload;
  if (previousProjection !== null && previousProjection.projectId !== projectId) {
    throw new CommandHandlerError(
      "mirror.previous-projection-project-mismatch",
      "previousProjection.projectId does not match the requested projectId.",
      false,
    );
  }
  await assertRepositoryPathIsUsable(repositoryRoot);
  const docsSnapshot = readProjectDocsSnapshot(repositoryRoot, IsoInstantSchema.parse(observedAt));
  const projection = buildMirrorProjectionV1(projectId, docsSnapshot);
  const diff = diffMirrorProjectionV1(previousProjection, projection);
  return { operation: "mirror.plan", projection, diff };
}
