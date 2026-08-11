import { digestCanonical, markerFor, type Sha256Digest } from "./canonical.js";
import {
  array,
  enumeration,
  exact,
  fail,
  identifier,
  projectKey,
  record,
  safeInteger,
  slug,
  text,
  unique,
  uuid,
} from "./validation.js";
import {
  requiredCapabilitiesForProvisioning,
  type Provider,
  type RequiredCapabilityV1,
} from "./preflight.js";

export type ProvisionAction =
  | "jira.project.ensure"
  | "github.repository.ensure"
  | "jira.epic.ensure"
  | "jira.issue.ensure"
  | "jira.issue-link.ensure"
  | "jira.github.attach";

export type ProjectEpicSpecV1 = Readonly<{
  logicalId: string;
  summary: string;
  description: string;
  tasks: readonly ProjectTaskSpecV1[];
}>;

export type ProjectTaskSpecV1 = Readonly<{
  logicalId: string;
  summary: string;
  description: string;
  issueType: "story" | "task" | "bug";
  estimatePoints: number;
  acceptanceCriteria: readonly string[];
  dependsOn: readonly string[];
}>;

export type ProjectProvisionSpecV1 = Readonly<{
  schemaVersion: 1;
  projectId: string;
  projectSlug: string;
  displayName: string;
  jira: Readonly<{
    siteId: string;
    projectKey: string;
    projectName: string;
    projectType: "software";
  }>;
  github: Readonly<{
    owner: string;
    repository: string;
    visibility: "private" | "public";
    defaultBranch: "main";
  }>;
  epics: readonly ProjectEpicSpecV1[];
}>;

export type CorrelationRuleV1 = Readonly<{
  schemaVersion: 1;
  provider: Provider;
  marker: string;
  resourceType:
    "jira.project" | "github.repository" | "jira.issue" | "jira.issue-link" | "jira.remote-link";
  containerKey: string;
  logicalKey: string;
  markerLocation: "jira-entity-property" | "github-resource-metadata";
}>;

export type ProvisionOperationV1 = Readonly<{
  schemaVersion: 1;
  operationId: string;
  provider: Provider;
  action: ProvisionAction;
  resourceKey: string;
  operationMarker: string;
  correlation: CorrelationRuleV1;
  dependsOnOperationIds: readonly string[];
  payload: Readonly<Record<string, unknown>>;
  payloadDigest: Sha256Digest;
}>;

export type ProjectProvisionPlanV1 = Readonly<{
  schemaVersion: 1;
  planId: Sha256Digest;
  projectId: string;
  projectSlug: string;
  displayName: string;
  requiredCapabilities: readonly RequiredCapabilityV1[];
  operations: readonly ProvisionOperationV1[];
}>;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function githubOwner(value: unknown): string {
  const parsed = text(value, "GitHub owner", 39);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(parsed)) {
    fail("GitHub owner is invalid");
  }
  return parsed;
}

function repositoryName(value: unknown): string {
  const parsed = text(value, "GitHub repository", 100);
  if (!/^[A-Za-z0-9._-]+$/.test(parsed) || parsed === "." || parsed === "..") {
    fail("GitHub repository is invalid");
  }
  return parsed;
}

function parseTask(value: unknown): ProjectTaskSpecV1 {
  const source = record(value, "project task");
  exact(
    source,
    [
      "logicalId",
      "summary",
      "description",
      "issueType",
      "estimatePoints",
      "acceptanceCriteria",
      "dependsOn",
    ],
    "project task",
  );
  const criteria = array(source.acceptanceCriteria, "acceptance criteria", 8, 1).map((item) =>
    text(item, "acceptance criterion", 500),
  );
  unique(criteria, "acceptance criteria");
  const dependsOn = array(source.dependsOn, "task dependencies", 40).map((item) =>
    identifier(item, "task dependency", 80),
  );
  unique(dependsOn, "task dependencies");
  return {
    logicalId: identifier(source.logicalId, "task logical ID", 80),
    summary: text(source.summary, "task summary", 240),
    description: text(source.description, "task description", 10_000),
    issueType: enumeration(source.issueType, ["story", "task", "bug"] as const, "issue type"),
    estimatePoints: safeInteger(source.estimatePoints, "task estimate", 1, 3),
    acceptanceCriteria: [...criteria].sort(compare),
    dependsOn: [...dependsOn].sort(compare),
  };
}

function parseEpic(value: unknown): ProjectEpicSpecV1 {
  const source = record(value, "project epic");
  exact(source, ["logicalId", "summary", "description", "tasks"], "project epic");
  const tasks = array(source.tasks, "epic tasks", 30, 1).map(parseTask);
  return {
    logicalId: identifier(source.logicalId, "epic logical ID", 80),
    summary: text(source.summary, "epic summary", 240),
    description: text(source.description, "epic description", 10_000),
    tasks,
  };
}

export function parseProjectProvisionSpec(value: unknown): ProjectProvisionSpecV1 {
  const source = record(value, "project provision specification");
  exact(
    source,
    ["schemaVersion", "projectId", "projectSlug", "displayName", "jira", "github", "epics"],
    "project provision specification",
  );
  if (source.schemaVersion !== 1) fail("project provision schema version is unsupported");
  const jiraSource = record(source.jira, "Jira project specification");
  exact(
    jiraSource,
    ["siteId", "projectKey", "projectName", "projectType"],
    "Jira project specification",
  );
  if (jiraSource.projectType !== "software") fail("only Jira software projects are supported");
  const githubSource = record(source.github, "GitHub repository specification");
  exact(
    githubSource,
    ["owner", "repository", "visibility", "defaultBranch"],
    "GitHub repository specification",
  );
  if (githubSource.defaultBranch !== "main") fail("the provisioned default branch must be main");
  const epics = array(source.epics, "project epics", 25, 1).map(parseEpic);
  unique(
    epics.map((epic) => epic.logicalId),
    "epic logical IDs",
  );
  const tasks = epics.flatMap((epic) => epic.tasks);
  if (tasks.length > 250) fail("a project provision plan cannot exceed 250 small tasks");
  unique(
    tasks.map((task) => task.logicalId),
    "task logical IDs",
  );
  const taskIds = new Set(tasks.map((task) => task.logicalId));
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency)) fail(`task ${task.logicalId} has an unknown dependency`);
      if (dependency === task.logicalId) fail(`task ${task.logicalId} cannot depend on itself`);
    }
  }
  assertAcyclic(tasks);
  return {
    schemaVersion: 1,
    projectId: uuid(source.projectId, "project ID"),
    projectSlug: slug(source.projectSlug, "project slug"),
    displayName: text(source.displayName, "project display name", 160),
    jira: {
      siteId: identifier(jiraSource.siteId, "Jira site ID", 160),
      projectKey: projectKey(jiraSource.projectKey),
      projectName: text(jiraSource.projectName, "Jira project name", 160),
      projectType: "software",
    },
    github: {
      owner: githubOwner(githubSource.owner),
      repository: repositoryName(githubSource.repository),
      visibility: enumeration(
        githubSource.visibility,
        ["private", "public"] as const,
        "GitHub repository visibility",
      ),
      defaultBranch: "main",
    },
    epics: epics
      .map((epic) => ({
        ...epic,
        tasks: [...epic.tasks].sort((a, b) => compare(a.logicalId, b.logicalId)),
      }))
      .sort((a, b) => compare(a.logicalId, b.logicalId)),
  };
}

function assertAcyclic(tasks: readonly ProjectTaskSpecV1[]): void {
  const byId = new Map(tasks.map((task) => [task.logicalId, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) fail(`task dependency graph contains a cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const task = byId.get(id);
    if (task === undefined) fail(`task dependency ${id} is missing`);
    for (const dependency of task.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of [...tasks].sort((a, b) => compare(a.logicalId, b.logicalId))) {
    visit(task.logicalId);
  }
}

function makeOperation(input: {
  provider: Provider;
  action: ProvisionAction;
  projectId: string;
  containerKey: string;
  logicalKey: string;
  resourceKey: string;
  dependsOnOperationIds: readonly string[];
  payload: Readonly<Record<string, unknown>>;
}): ProvisionOperationV1 {
  const resourceType = resourceTypeFor(input.action);
  const markerAction = input.action.replace(`${input.provider}.`, "");
  const logicalIdentity = {
    projectId: input.projectId,
    action: input.action,
    containerKey: input.containerKey,
    logicalKey: input.logicalKey,
  };
  const operationMarker = markerFor(input.provider, markerAction, logicalIdentity);
  const operationId = `op_${digestCanonical(logicalIdentity).slice("sha256:".length, "sha256:".length + 32)}`;
  return {
    schemaVersion: 1,
    operationId,
    provider: input.provider,
    action: input.action,
    resourceKey: input.resourceKey,
    operationMarker,
    correlation: {
      schemaVersion: 1,
      provider: input.provider,
      marker: operationMarker,
      resourceType,
      containerKey: input.containerKey,
      logicalKey: input.logicalKey,
      markerLocation:
        input.provider === "jira" ? "jira-entity-property" : "github-resource-metadata",
    },
    dependsOnOperationIds: [...input.dependsOnOperationIds].sort(compare),
    payload: input.payload,
    payloadDigest: digestCanonical(input.payload),
  };
}

function resourceTypeFor(action: ProvisionAction): CorrelationRuleV1["resourceType"] {
  switch (action) {
    case "jira.project.ensure":
      return "jira.project";
    case "github.repository.ensure":
      return "github.repository";
    case "jira.epic.ensure":
    case "jira.issue.ensure":
      return "jira.issue";
    case "jira.issue-link.ensure":
      return "jira.issue-link";
    case "jira.github.attach":
      return "jira.remote-link";
  }
}

/** Returns declarative effects only. It never calls Jira or GitHub. */
export function createProjectProvisionPlan(value: unknown): ProjectProvisionPlanV1 {
  const spec = parseProjectProvisionSpec(value);
  const jiraContainer = `${spec.jira.siteId}:${spec.jira.projectKey}`;
  const githubContainer = `${spec.github.owner}/${spec.github.repository}`;
  const projectOperation = makeOperation({
    provider: "jira",
    action: "jira.project.ensure",
    projectId: spec.projectId,
    containerKey: spec.jira.siteId,
    logicalKey: spec.jira.projectKey,
    resourceKey: jiraContainer,
    dependsOnOperationIds: [],
    payload: {
      projectId: spec.projectId,
      projectSlug: spec.projectSlug,
      displayName: spec.displayName,
      key: spec.jira.projectKey,
      name: spec.jira.projectName,
      projectType: spec.jira.projectType,
    },
  });
  const repositoryOperation = makeOperation({
    provider: "github",
    action: "github.repository.ensure",
    projectId: spec.projectId,
    containerKey: spec.github.owner,
    logicalKey: spec.github.repository,
    resourceKey: githubContainer,
    dependsOnOperationIds: [],
    payload: {
      projectId: spec.projectId,
      projectSlug: spec.projectSlug,
      displayName: spec.displayName,
      owner: spec.github.owner,
      repository: spec.github.repository,
      visibility: spec.github.visibility,
      defaultBranch: spec.github.defaultBranch,
    },
  });
  const epicOperations = new Map<string, ProvisionOperationV1>();
  for (const epic of spec.epics) {
    epicOperations.set(
      epic.logicalId,
      makeOperation({
        provider: "jira",
        action: "jira.epic.ensure",
        projectId: spec.projectId,
        containerKey: jiraContainer,
        logicalKey: epic.logicalId,
        resourceKey: `${jiraContainer}:epic:${epic.logicalId}`,
        dependsOnOperationIds: [projectOperation.operationId],
        payload: {
          projectId: spec.projectId,
          projectKey: spec.jira.projectKey,
          logicalId: epic.logicalId,
          summary: epic.summary,
          description: epic.description,
        },
      }),
    );
  }
  const taskToEpic = new Map<string, string>();
  for (const epic of spec.epics) {
    for (const task of epic.tasks) taskToEpic.set(task.logicalId, epic.logicalId);
  }
  const taskOperationIdentities = new Map<string, string>();
  for (const task of spec.epics.flatMap((epic) => epic.tasks)) {
    const logicalIdentity = {
      projectId: spec.projectId,
      action: "jira.issue.ensure",
      containerKey: jiraContainer,
      logicalKey: task.logicalId,
    };
    taskOperationIdentities.set(
      task.logicalId,
      `op_${digestCanonical(logicalIdentity).slice("sha256:".length, "sha256:".length + 32)}`,
    );
  }
  const linkOperations: ProvisionOperationV1[] = [];
  for (const task of spec.epics.flatMap((epic) => epic.tasks)) {
    const targetOperationId = taskOperationIdentities.get(task.logicalId);
    if (targetOperationId === undefined) fail("task link construction failed");
    for (const dependency of task.dependsOn) {
      const dependencyOperationId = taskOperationIdentities.get(dependency);
      if (dependencyOperationId === undefined) fail("task link construction failed");
      linkOperations.push(
        makeOperation({
          provider: "jira",
          action: "jira.issue-link.ensure",
          projectId: spec.projectId,
          containerKey: jiraContainer,
          logicalKey: `${dependency}->${task.logicalId}:blocks`,
          resourceKey: `${jiraContainer}:link:${dependency}:blocks:${task.logicalId}`,
          dependsOnOperationIds: [dependencyOperationId, targetOperationId],
          payload: {
            projectId: spec.projectId,
            projectKey: spec.jira.projectKey,
            inwardLogicalId: dependency,
            outwardLogicalId: task.logicalId,
            linkType: "blocks",
          },
        }),
      );
    }
  }
  const taskOperations: ProvisionOperationV1[] = [];
  for (const epic of spec.epics) {
    const epicOperation = epicOperations.get(epic.logicalId);
    if (epicOperation === undefined) fail("epic operation construction failed");
    for (const task of epic.tasks) {
      const epicLogicalId = taskToEpic.get(task.logicalId);
      if (epicLogicalId === undefined) fail("task parent construction failed");
      const dependencyOperationIds = task.dependsOn.map((dependency) => {
        const operationId = taskOperationIdentities.get(dependency);
        if (operationId === undefined) fail("task operation construction failed");
        return operationId;
      });
      taskOperations.push(
        makeOperation({
          provider: "jira",
          action: "jira.issue.ensure",
          projectId: spec.projectId,
          containerKey: jiraContainer,
          logicalKey: task.logicalId,
          resourceKey: `${jiraContainer}:issue:${task.logicalId}`,
          dependsOnOperationIds: [epicOperation.operationId, ...dependencyOperationIds],
          payload: {
            projectId: spec.projectId,
            projectKey: spec.jira.projectKey,
            epicLogicalId,
            logicalId: task.logicalId,
            summary: task.summary,
            description: task.description,
            issueType: task.issueType,
            estimatePoints: task.estimatePoints,
            acceptanceCriteria: task.acceptanceCriteria,
            dependsOnLogicalIds: task.dependsOn,
          },
        }),
      );
    }
  }
  const attachmentOperation = makeOperation({
    provider: "jira",
    action: "jira.github.attach",
    projectId: spec.projectId,
    containerKey: jiraContainer,
    logicalKey: githubContainer,
    resourceKey: `${jiraContainer}:repository:${githubContainer}`,
    dependsOnOperationIds: [projectOperation.operationId, repositoryOperation.operationId],
    payload: {
      projectId: spec.projectId,
      projectKey: spec.jira.projectKey,
      repository: githubContainer,
    },
  });
  const operations = [
    projectOperation,
    repositoryOperation,
    ...epicOperations.values(),
    ...taskOperations,
    ...linkOperations,
    attachmentOperation,
  ].sort((left, right) =>
    compare(`${left.action}:${left.resourceKey}`, `${right.action}:${right.resourceKey}`),
  );
  unique(
    operations.map((operation) => operation.operationId),
    "provision operation IDs",
  );
  unique(
    operations.map((operation) => operation.operationMarker),
    "provision operation markers",
  );
  const planBody = {
    schemaVersion: 1 as const,
    projectId: spec.projectId,
    projectSlug: spec.projectSlug,
    displayName: spec.displayName,
    requiredCapabilities: requiredCapabilitiesForProvisioning(),
    operations,
  };
  return { ...planBody, planId: digestCanonical(planBody) };
}
