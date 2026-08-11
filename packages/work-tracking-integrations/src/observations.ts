import { digestCanonical, type Sha256Digest } from "./canonical.js";
import {
  array,
  boolean,
  enumeration,
  exact,
  fail,
  gitRef,
  gitSha,
  identifier,
  isoInstant,
  issueKey,
  nullableUrl,
  operationMarker,
  optionalText,
  projectKey,
  record,
  safeInteger,
  text,
  unique,
  url,
} from "./validation.js";

export type JiraProjectSnapshotV1 = Readonly<{
  schemaVersion: 1;
  siteId: string;
  projectId: string;
  key: string;
  name: string;
  projectType: "software";
  operationMarker: string | null;
  providerRevision: string;
  observedAt: string;
}>;

export type JiraIssueSnapshotV1 = Readonly<{
  schemaVersion: 1;
  siteId: string;
  issueId: string;
  key: string;
  projectKey: string;
  issueType: "epic" | "story" | "task" | "bug";
  summary: string;
  description: string | null;
  status: string;
  labels: readonly string[];
  operationMarker: string | null;
  version: number;
  providerRevision: string;
  updatedAt: string;
  observedAt: string;
}>;

export type JiraIssueRevisionPinV1 = Readonly<{
  schemaVersion: 1;
  siteId: string;
  issueKey: string;
  version: number;
  providerRevision: string;
  updatedAt: string;
  contentDigest: Sha256Digest;
}>;

export class JiraRevisionDriftError extends Error {
  public readonly code = "jira.issue.revision-changed";

  public constructor() {
    super("Jira issue no longer matches its pinned revision");
    this.name = "JiraRevisionDriftError";
  }
}

function nullableMarker(value: unknown): string | null {
  return value === null ? null : operationMarker(value);
}

function fullRepositoryName(value: unknown, label = "GitHub repository full name"): string {
  const parsed = text(value, label, 141);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/.test(parsed)) {
    fail(`${label} is invalid`);
  }
  const repository = parsed.slice(parsed.indexOf("/") + 1);
  if (repository === "." || repository === "..") fail(`${label} is invalid`);
  return parsed;
}

export function parseJiraProjectSnapshot(value: unknown): JiraProjectSnapshotV1 {
  const source = record(value, "Jira project snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "siteId",
      "projectId",
      "key",
      "name",
      "projectType",
      "operationMarker",
      "providerRevision",
      "observedAt",
    ],
    "Jira project snapshot",
  );
  if (source.schemaVersion !== 1 || source.projectType !== "software") {
    fail("Jira project snapshot contract is unsupported");
  }
  return {
    schemaVersion: 1,
    siteId: identifier(source.siteId, "Jira site ID", 160),
    projectId: identifier(source.projectId, "Jira project ID", 160),
    key: projectKey(source.key),
    name: text(source.name, "Jira project name", 160),
    projectType: "software",
    operationMarker: nullableMarker(source.operationMarker),
    providerRevision: text(source.providerRevision, "Jira project provider revision", 500),
    observedAt: isoInstant(source.observedAt, "Jira project observation time"),
  };
}

export function parseJiraIssueSnapshot(value: unknown): JiraIssueSnapshotV1 {
  const source = record(value, "Jira issue snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "siteId",
      "issueId",
      "key",
      "projectKey",
      "issueType",
      "summary",
      "description",
      "status",
      "labels",
      "operationMarker",
      "version",
      "providerRevision",
      "updatedAt",
      "observedAt",
    ],
    "Jira issue snapshot",
  );
  if (source.schemaVersion !== 1) fail("Jira issue snapshot schema version is unsupported");
  const labels = array(source.labels, "Jira issue labels", 100).map((item) =>
    identifier(item, "Jira issue label", 255),
  );
  unique(labels, "Jira issue labels");
  const key = issueKey(source.key);
  const parentKey = key.slice(0, key.indexOf("-"));
  const parsedProjectKey = projectKey(source.projectKey);
  if (parentKey !== parsedProjectKey) fail("Jira issue key does not belong to its project");
  return {
    schemaVersion: 1,
    siteId: identifier(source.siteId, "Jira site ID", 160),
    issueId: identifier(source.issueId, "Jira issue ID", 160),
    key,
    projectKey: parsedProjectKey,
    issueType: enumeration(
      source.issueType,
      ["epic", "story", "task", "bug"] as const,
      "Jira issue type",
    ),
    summary: text(source.summary, "Jira issue summary", 240),
    description: optionalText(source.description, "Jira issue description", 100_000),
    status: text(source.status, "Jira issue status", 80),
    labels: [...labels].sort(),
    operationMarker: nullableMarker(source.operationMarker),
    version: safeInteger(source.version, "Jira issue version", 1),
    providerRevision: text(source.providerRevision, "Jira issue provider revision", 500),
    updatedAt: isoInstant(source.updatedAt, "Jira issue update time"),
    observedAt: isoInstant(source.observedAt, "Jira issue observation time"),
  };
}

function jiraIssueRevisionBody(issue: JiraIssueSnapshotV1): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    siteId: issue.siteId,
    issueId: issue.issueId,
    key: issue.key,
    projectKey: issue.projectKey,
    issueType: issue.issueType,
    summary: issue.summary,
    description: issue.description,
    status: issue.status,
    labels: issue.labels,
    operationMarker: issue.operationMarker,
    version: issue.version,
    providerRevision: issue.providerRevision,
    updatedAt: issue.updatedAt,
  };
}

export function pinJiraIssueRevision(value: unknown): Readonly<{
  issue: JiraIssueSnapshotV1;
  pin: JiraIssueRevisionPinV1;
}> {
  const issue = parseJiraIssueSnapshot(value);
  return {
    issue,
    pin: {
      schemaVersion: 1,
      siteId: issue.siteId,
      issueKey: issue.key,
      version: issue.version,
      providerRevision: issue.providerRevision,
      updatedAt: issue.updatedAt,
      contentDigest: digestCanonical(jiraIssueRevisionBody(issue)),
    },
  };
}

export function parseJiraIssueRevisionPin(value: unknown): JiraIssueRevisionPinV1 {
  const source = record(value, "Jira issue revision pin");
  exact(
    source,
    [
      "schemaVersion",
      "siteId",
      "issueKey",
      "version",
      "providerRevision",
      "updatedAt",
      "contentDigest",
    ],
    "Jira issue revision pin",
  );
  if (source.schemaVersion !== 1) fail("Jira issue revision pin schema version is unsupported");
  const digest = text(source.contentDigest, "Jira issue revision content digest", 71);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) fail("Jira issue revision digest is invalid");
  return {
    schemaVersion: 1,
    siteId: identifier(source.siteId, "Jira site ID", 160),
    issueKey: issueKey(source.issueKey),
    version: safeInteger(source.version, "Jira issue version", 1),
    providerRevision: text(source.providerRevision, "Jira issue provider revision", 500),
    updatedAt: isoInstant(source.updatedAt, "Jira issue update time"),
    contentDigest: digest as Sha256Digest,
  };
}

/** Validates an untrusted fresh read against the exact revision selected for work. */
export function ingestPinnedJiraIssue(value: unknown, pinInput: unknown): JiraIssueSnapshotV1 {
  const issue = parseJiraIssueSnapshot(value);
  const pin = parseJiraIssueRevisionPin(pinInput);
  if (
    issue.siteId !== pin.siteId ||
    issue.key !== pin.issueKey ||
    issue.version !== pin.version ||
    issue.providerRevision !== pin.providerRevision ||
    issue.updatedAt !== pin.updatedAt ||
    digestCanonical(jiraIssueRevisionBody(issue)) !== pin.contentDigest
  ) {
    throw new JiraRevisionDriftError();
  }
  return issue;
}

export type GitHubRepositorySnapshotV1 = Readonly<{
  schemaVersion: 1;
  nodeId: string;
  fullName: string;
  url: string;
  visibility: "private" | "public";
  archived: boolean;
  defaultBranch: string;
  operationMarker: string | null;
  providerRevision: string;
  observedAt: string;
}>;

export type GitHubBranchSnapshotV1 = Readonly<{
  schemaVersion: 1;
  repository: string;
  name: string;
  headSha: string;
  protected: boolean;
  providerRevision: string;
  observedAt: string;
}>;

export type GitHubPullRequestSnapshotV1 = Readonly<{
  schemaVersion: 1;
  repository: string;
  number: number;
  nodeId: string;
  url: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  mergeBaseSha: string | null;
  operationMarker: string | null;
  providerRevision: string;
  observedAt: string;
}>;

export type GitHubCheckSnapshotV1 = Readonly<{
  schemaVersion: 1;
  repository: string;
  commitSha: string;
  appSlug: string;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | "stale"
    | null;
  detailsUrl: string | null;
  providerRevision: string;
  observedAt: string;
}>;

export type GitHubMergeSnapshotV1 = Readonly<{
  schemaVersion: 1;
  repository: string;
  pullRequestNumber: number;
  mergeCommitSha: string;
  mergedAt: string;
  actorId: string;
  providerRevision: string;
  observedAt: string;
}>;

export type GitHubDeliverySnapshotV1 = Readonly<{
  schemaVersion: 1;
  repository: GitHubRepositorySnapshotV1;
  baseBranch: GitHubBranchSnapshotV1;
  pullRequest: GitHubPullRequestSnapshotV1 | null;
  checks: readonly GitHubCheckSnapshotV1[];
  merge: GitHubMergeSnapshotV1 | null;
  observedDigest: Sha256Digest;
}>;

export function parseGitHubRepositorySnapshot(value: unknown): GitHubRepositorySnapshotV1 {
  const source = record(value, "GitHub repository snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "nodeId",
      "fullName",
      "url",
      "visibility",
      "archived",
      "defaultBranch",
      "operationMarker",
      "providerRevision",
      "observedAt",
    ],
    "GitHub repository snapshot",
  );
  if (source.schemaVersion !== 1) fail("GitHub repository schema version is unsupported");
  return {
    schemaVersion: 1,
    nodeId: text(source.nodeId, "GitHub repository node ID", 160),
    fullName: fullRepositoryName(source.fullName),
    url: url(source.url, "GitHub repository URL"),
    visibility: enumeration(source.visibility, ["private", "public"] as const, "visibility"),
    archived: boolean(source.archived, "GitHub archived state"),
    defaultBranch: gitRef(source.defaultBranch, "GitHub default branch"),
    operationMarker: nullableMarker(source.operationMarker),
    providerRevision: text(source.providerRevision, "GitHub repository revision", 500),
    observedAt: isoInstant(source.observedAt, "GitHub repository observation time"),
  };
}

export function parseGitHubBranchSnapshot(value: unknown): GitHubBranchSnapshotV1 {
  const source = record(value, "GitHub branch snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "repository",
      "name",
      "headSha",
      "protected",
      "providerRevision",
      "observedAt",
    ],
    "GitHub branch snapshot",
  );
  if (source.schemaVersion !== 1) fail("GitHub branch schema version is unsupported");
  return {
    schemaVersion: 1,
    repository: fullRepositoryName(source.repository),
    name: gitRef(source.name, "GitHub branch name"),
    headSha: gitSha(source.headSha, "GitHub branch head"),
    protected: boolean(source.protected, "GitHub branch protection state"),
    providerRevision: text(source.providerRevision, "GitHub branch revision", 500),
    observedAt: isoInstant(source.observedAt, "GitHub branch observation time"),
  };
}

export function parseGitHubPullRequestSnapshot(value: unknown): GitHubPullRequestSnapshotV1 {
  const source = record(value, "GitHub pull request snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "repository",
      "number",
      "nodeId",
      "url",
      "state",
      "draft",
      "baseRef",
      "baseSha",
      "headRef",
      "headSha",
      "mergeBaseSha",
      "operationMarker",
      "providerRevision",
      "observedAt",
    ],
    "GitHub pull request snapshot",
  );
  if (source.schemaVersion !== 1) fail("GitHub pull request schema version is unsupported");
  return {
    schemaVersion: 1,
    repository: fullRepositoryName(source.repository),
    number: safeInteger(source.number, "GitHub pull request number", 1),
    nodeId: text(source.nodeId, "GitHub pull request node ID", 160),
    url: url(source.url, "GitHub pull request URL"),
    state: enumeration(source.state, ["open", "closed", "merged"] as const, "pull request state"),
    draft: boolean(source.draft, "GitHub pull request draft state"),
    baseRef: gitRef(source.baseRef, "GitHub base ref"),
    baseSha: gitSha(source.baseSha, "GitHub pull request base SHA"),
    headRef: gitRef(source.headRef, "GitHub head ref"),
    headSha: gitSha(source.headSha, "GitHub pull request head SHA"),
    mergeBaseSha:
      source.mergeBaseSha === null
        ? null
        : gitSha(source.mergeBaseSha, "GitHub pull request merge base SHA"),
    operationMarker: nullableMarker(source.operationMarker),
    providerRevision: text(source.providerRevision, "GitHub pull request revision", 500),
    observedAt: isoInstant(source.observedAt, "GitHub pull request observation time"),
  };
}

export function parseGitHubCheckSnapshot(value: unknown): GitHubCheckSnapshotV1 {
  const source = record(value, "GitHub check snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "repository",
      "commitSha",
      "appSlug",
      "name",
      "status",
      "conclusion",
      "detailsUrl",
      "providerRevision",
      "observedAt",
    ],
    "GitHub check snapshot",
  );
  if (source.schemaVersion !== 1) fail("GitHub check schema version is unsupported");
  const status = enumeration(
    source.status,
    ["queued", "in_progress", "completed"] as const,
    "GitHub check status",
  );
  const conclusion =
    source.conclusion === null
      ? null
      : enumeration(
          source.conclusion,
          [
            "success",
            "failure",
            "neutral",
            "cancelled",
            "skipped",
            "timed_out",
            "action_required",
            "stale",
          ] as const,
          "GitHub check conclusion",
        );
  if ((status === "completed") !== (conclusion !== null)) {
    fail("a completed GitHub check requires a conclusion and an incomplete check cannot have one");
  }
  return {
    schemaVersion: 1,
    repository: fullRepositoryName(source.repository),
    commitSha: gitSha(source.commitSha, "GitHub check commit SHA"),
    appSlug: identifier(source.appSlug, "GitHub App slug", 100),
    name: text(source.name, "GitHub check name", 240),
    status,
    conclusion,
    detailsUrl: nullableUrl(source.detailsUrl, "GitHub check details URL"),
    providerRevision: text(source.providerRevision, "GitHub check revision", 500),
    observedAt: isoInstant(source.observedAt, "GitHub check observation time"),
  };
}

export function parseGitHubMergeSnapshot(value: unknown): GitHubMergeSnapshotV1 {
  const source = record(value, "GitHub merge snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "repository",
      "pullRequestNumber",
      "mergeCommitSha",
      "mergedAt",
      "actorId",
      "providerRevision",
      "observedAt",
    ],
    "GitHub merge snapshot",
  );
  if (source.schemaVersion !== 1) fail("GitHub merge schema version is unsupported");
  return {
    schemaVersion: 1,
    repository: fullRepositoryName(source.repository),
    pullRequestNumber: safeInteger(source.pullRequestNumber, "GitHub pull request number", 1),
    mergeCommitSha: gitSha(source.mergeCommitSha, "GitHub merge commit SHA"),
    mergedAt: isoInstant(source.mergedAt, "GitHub merge time"),
    actorId: identifier(source.actorId, "GitHub merge actor ID", 160),
    providerRevision: text(source.providerRevision, "GitHub merge revision", 500),
    observedAt: isoInstant(source.observedAt, "GitHub merge observation time"),
  };
}

/** Validates the cross-resource relationships in one read-only GitHub observation. */
export function parseGitHubDeliverySnapshot(value: unknown): GitHubDeliverySnapshotV1 {
  const source = record(value, "GitHub delivery snapshot");
  exact(
    source,
    ["schemaVersion", "repository", "baseBranch", "pullRequest", "checks", "merge"],
    "GitHub delivery snapshot",
  );
  if (source.schemaVersion !== 1) fail("GitHub delivery schema version is unsupported");
  const repository = parseGitHubRepositorySnapshot(source.repository);
  const baseBranch = parseGitHubBranchSnapshot(source.baseBranch);
  const pullRequest =
    source.pullRequest === null ? null : parseGitHubPullRequestSnapshot(source.pullRequest);
  const checks = array(source.checks, "GitHub checks", 200).map(parseGitHubCheckSnapshot);
  const merge = source.merge === null ? null : parseGitHubMergeSnapshot(source.merge);
  if (
    baseBranch.repository !== repository.fullName ||
    baseBranch.name !== repository.defaultBranch
  ) {
    fail("GitHub base branch does not match the observed repository default branch");
  }
  if (pullRequest === null) {
    if (checks.length !== 0 || merge !== null) {
      fail("GitHub checks and merge observations require a pull request");
    }
  } else {
    if (pullRequest.repository !== repository.fullName || pullRequest.baseRef !== baseBranch.name) {
      fail("GitHub pull request does not target the observed repository base branch");
    }
    for (const check of checks) {
      if (check.repository !== repository.fullName || check.commitSha !== pullRequest.headSha) {
        fail("GitHub check does not bind to the observed pull request head");
      }
    }
    unique(
      checks.map((check) => `${check.appSlug}:${check.name}`),
      "GitHub checks",
    );
    if (pullRequest.state === "merged") {
      if (
        merge === null ||
        merge.repository !== repository.fullName ||
        merge.pullRequestNumber !== pullRequest.number
      ) {
        fail("a merged pull request requires its matching merge observation");
      }
    } else if (merge !== null) {
      fail("an unmerged pull request cannot include a merge observation");
    }
  }
  const normalizedChecks = [...checks].sort((left, right) => {
    const leftKey = `${left.appSlug}:${left.name}`;
    const rightKey = `${right.appSlug}:${right.name}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const body = {
    schemaVersion: 1 as const,
    repository,
    baseBranch,
    pullRequest,
    checks: normalizedChecks,
    merge,
  };
  return { ...body, observedDigest: digestCanonical(body) };
}
