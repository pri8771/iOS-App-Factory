import { digestCanonical, type Sha256Digest } from "./canonical.js";
import { parseJiraIssueRevisionPin, type JiraIssueRevisionPinV1 } from "./observations.js";
import {
  array,
  enumeration,
  exact,
  fail,
  identifier,
  projectKey,
  record,
  text,
  unique,
  uuid,
} from "./validation.js";

export type CrossProjectParticipantV1 = Readonly<{
  projectId: string;
  role: "coordinator" | "contributor";
  jiraSiteId: string;
  jiraProjectKey: string;
  githubRepository: string;
}>;

export type CrossProjectWorkItemV1 = Readonly<{
  logicalId: string;
  projectId: string;
  summary: string;
  expectedOutcome: string;
  dependsOnWorkItemIds: readonly string[];
  jiraIssuePin: JiraIssueRevisionPinV1 | null;
}>;

export type CrossProjectWorkPackageV1 = Readonly<{
  schemaVersion: 1;
  packageId: string;
  title: string;
  objective: string;
  participants: readonly CrossProjectParticipantV1[];
  workItems: readonly CrossProjectWorkItemV1[];
  packageDigest: Sha256Digest;
}>;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseRepository(value: unknown): string {
  const parsed = text(value, "cross-project GitHub repository", 141);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/.test(parsed)) {
    fail("cross-project GitHub repository is invalid");
  }
  const repository = parsed.slice(parsed.indexOf("/") + 1);
  if (repository === "." || repository === "..") {
    fail("cross-project GitHub repository is invalid");
  }
  return parsed;
}

function parseParticipant(value: unknown): CrossProjectParticipantV1 {
  const source = record(value, "cross-project participant");
  exact(
    source,
    ["projectId", "role", "jiraSiteId", "jiraProjectKey", "githubRepository"],
    "cross-project participant",
  );
  return {
    projectId: uuid(source.projectId, "participant project ID"),
    role: enumeration(
      source.role,
      ["coordinator", "contributor"] as const,
      "cross-project participant role",
    ),
    jiraSiteId: identifier(source.jiraSiteId, "participant Jira site ID", 160),
    jiraProjectKey: projectKey(source.jiraProjectKey, "participant Jira project key"),
    githubRepository: parseRepository(source.githubRepository),
  };
}

function parseWorkItem(value: unknown): CrossProjectWorkItemV1 {
  const source = record(value, "cross-project work item");
  exact(
    source,
    [
      "logicalId",
      "projectId",
      "summary",
      "expectedOutcome",
      "dependsOnWorkItemIds",
      "jiraIssuePin",
    ],
    "cross-project work item",
  );
  const dependsOnWorkItemIds = array(
    source.dependsOnWorkItemIds,
    "cross-project work item dependencies",
    80,
  ).map((item) => identifier(item, "work item dependency", 80));
  unique(dependsOnWorkItemIds, "cross-project work item dependencies");
  return {
    logicalId: identifier(source.logicalId, "cross-project work item logical ID", 80),
    projectId: uuid(source.projectId, "cross-project work item project ID"),
    summary: text(source.summary, "cross-project work item summary", 240),
    expectedOutcome: text(source.expectedOutcome, "cross-project expected outcome", 2_000),
    dependsOnWorkItemIds: [...dependsOnWorkItemIds].sort(compare),
    jiraIssuePin:
      source.jiraIssuePin === null ? null : parseJiraIssueRevisionPin(source.jiraIssuePin),
  };
}

function assertAcyclic(items: readonly CrossProjectWorkItemV1[]): void {
  const byId = new Map(items.map((item) => [item.logicalId, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) fail(`cross-project work contains a dependency cycle at ${id}`);
    if (visited.has(id)) return;
    const item = byId.get(id);
    if (item === undefined) fail(`cross-project dependency ${id} does not exist`);
    visiting.add(id);
    for (const dependency of item.dependsOnWorkItemIds) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const item of [...items].sort((a, b) => compare(a.logicalId, b.logicalId)))
    visit(item.logicalId);
}

export function parseCrossProjectWorkPackage(value: unknown): CrossProjectWorkPackageV1 {
  const source = record(value, "cross-project work package");
  exact(
    source,
    ["schemaVersion", "packageId", "title", "objective", "participants", "workItems"],
    "cross-project work package",
  );
  if (source.schemaVersion !== 1) fail("cross-project work package schema version is unsupported");
  const participants = array(source.participants, "cross-project participants", 20, 2).map(
    parseParticipant,
  );
  unique(
    participants.map((participant) => participant.projectId),
    "cross-project participant project IDs",
  );
  if (participants.filter((participant) => participant.role === "coordinator").length !== 1) {
    fail("a cross-project work package requires exactly one coordinator");
  }
  const workItems = array(source.workItems, "cross-project work items", 250, 1).map(parseWorkItem);
  unique(
    workItems.map((item) => item.logicalId),
    "cross-project work item logical IDs",
  );
  const participantsById = new Map(
    participants.map((participant) => [participant.projectId, participant]),
  );
  const workItemIds = new Set(workItems.map((item) => item.logicalId));
  for (const item of workItems) {
    const participant = participantsById.get(item.projectId);
    if (participant === undefined)
      fail(`work item ${item.logicalId} belongs to a non-participant project`);
    for (const dependency of item.dependsOnWorkItemIds) {
      if (dependency === item.logicalId)
        fail(`work item ${item.logicalId} cannot depend on itself`);
      if (!workItemIds.has(dependency))
        fail(`work item ${item.logicalId} has an unknown dependency`);
    }
    if (
      item.jiraIssuePin !== null &&
      (item.jiraIssuePin.siteId !== participant.jiraSiteId ||
        !item.jiraIssuePin.issueKey.startsWith(`${participant.jiraProjectKey}-`))
    ) {
      fail(`work item ${item.logicalId} Jira pin does not belong to its participant project`);
    }
  }
  for (const participant of participants) {
    if (!workItems.some((item) => item.projectId === participant.projectId)) {
      fail(`participant project ${participant.projectId} has no owned work item`);
    }
  }
  assertAcyclic(workItems);
  const body = {
    schemaVersion: 1 as const,
    packageId: uuid(source.packageId, "cross-project package ID"),
    title: text(source.title, "cross-project package title", 240),
    objective: text(source.objective, "cross-project objective", 5_000),
    participants: [...participants].sort((a, b) => compare(a.projectId, b.projectId)),
    workItems: [...workItems].sort((a, b) => compare(a.logicalId, b.logicalId)),
  };
  return { ...body, packageDigest: digestCanonical(body) };
}
