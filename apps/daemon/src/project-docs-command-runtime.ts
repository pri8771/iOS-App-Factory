import {
  IsoInstantSchema,
  type CommandRequestV1,
  type CommandResultV1,
  type IsoInstant,
} from "@app-factory/contracts";
import { readProjectDocsSnapshot } from "@app-factory/project-docs";

import { assertRepositoryPathIsUsable } from "./project-command-runtime.js";

export type ProjectDocsSnapshotCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "project.docs.snapshot" }
>;

/**
 * `project.docs.snapshot`: reads one repository's mandated docs off disk, read-only, via
 * `@app-factory/project-docs`. Owner doctrine: this repository's own docs are the source of truth,
 * so this handler never mutates anything and never reaches out to Jira/Notion -- see
 * `mirror-command-runtime.ts` for the (also read-only, also contract-only) mirror projection.
 * Shares `project.scan`'s repository-path safety check (`assertRepositoryPathIsUsable`) so an
 * unnormalized or nonexistent path fails closed the same way for every `project.*` operation.
 */
export async function executeProjectDocsSnapshotCommand(
  request: ProjectDocsSnapshotCommandRequestV1,
  observedAt: IsoInstant,
): Promise<CommandResultV1> {
  const repositoryRoot = request.payload.repositoryRoot;
  await assertRepositoryPathIsUsable(repositoryRoot);
  const snapshot = readProjectDocsSnapshot(repositoryRoot, IsoInstantSchema.parse(observedAt));
  return { operation: "project.docs.snapshot", snapshot };
}
