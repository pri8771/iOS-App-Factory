import {
  parseJiraIssueRevisionPin,
  parseJiraIssueSnapshot,
  pinJiraIssueRevision,
  type JiraIssueRevisionPinV1,
  type JiraIssueSnapshotV1,
} from "./observations.js";
import { enumeration, exact, fail, gitSha, record } from "./validation.js";

export type DriftDecisionV1 =
  | Readonly<{
      schemaVersion: 1;
      kind: "current";
      code: null;
      safeToContinue: true;
      requiredAction: "none";
    }>
  | Readonly<{
      schemaVersion: 1;
      kind: "drifted";
      code:
        | "jira.issue.identity-changed"
        | "jira.issue.revision-changed"
        | "github.base.advanced"
        | "github.base.diverged"
        | "github.base.relationship-unknown";
      safeToContinue: false;
      requiredAction: "repin-and-replan" | "rebase-and-reverify" | "manual-review";
    }>;

export function decideJiraIssueDrift(pinInput: unknown, issueInput: unknown): DriftDecisionV1 {
  const pin: JiraIssueRevisionPinV1 = parseJiraIssueRevisionPin(pinInput);
  const issue: JiraIssueSnapshotV1 = parseJiraIssueSnapshot(issueInput);
  if (pin.siteId !== issue.siteId || pin.issueKey !== issue.key) {
    return {
      schemaVersion: 1,
      kind: "drifted",
      code: "jira.issue.identity-changed",
      safeToContinue: false,
      requiredAction: "manual-review",
    };
  }
  const freshPin = pinJiraIssueRevision(issue).pin;
  if (
    pin.version !== freshPin.version ||
    pin.providerRevision !== freshPin.providerRevision ||
    pin.updatedAt !== freshPin.updatedAt ||
    pin.contentDigest !== freshPin.contentDigest
  ) {
    return {
      schemaVersion: 1,
      kind: "drifted",
      code: "jira.issue.revision-changed",
      safeToContinue: false,
      requiredAction: "repin-and-replan",
    };
  }
  return {
    schemaVersion: 1,
    kind: "current",
    code: null,
    safeToContinue: true,
    requiredAction: "none",
  };
}

export type GitHubBaseDriftInputV1 = Readonly<{
  schemaVersion: 1;
  plannedBaseSha: string;
  observedBaseSha: string;
  relationship: "same" | "descendant" | "diverged" | "unknown";
}>;

function parseGitHubBaseDriftInput(value: unknown): GitHubBaseDriftInputV1 {
  const source = record(value, "GitHub base drift input");
  exact(
    source,
    ["schemaVersion", "plannedBaseSha", "observedBaseSha", "relationship"],
    "GitHub base drift input",
  );
  if (source.schemaVersion !== 1) fail("GitHub base drift schema is unsupported");
  const plannedBaseSha = gitSha(source.plannedBaseSha, "planned GitHub base SHA");
  const observedBaseSha = gitSha(source.observedBaseSha, "observed GitHub base SHA");
  const relationship = enumeration(
    source.relationship,
    ["same", "descendant", "diverged", "unknown"] as const,
    "GitHub base relationship",
  );
  if ((plannedBaseSha === observedBaseSha) !== (relationship === "same")) {
    fail("GitHub base relationship contradicts the observed SHAs");
  }
  return { schemaVersion: 1, plannedBaseSha, observedBaseSha, relationship };
}

/** Any movement after planning invalidates verification bound to the old base. */
export function decideGitHubBaseDrift(value: unknown): DriftDecisionV1 {
  const input = parseGitHubBaseDriftInput(value);
  if (input.relationship === "same") {
    return {
      schemaVersion: 1,
      kind: "current",
      code: null,
      safeToContinue: true,
      requiredAction: "none",
    };
  }
  if (input.relationship === "descendant") {
    return {
      schemaVersion: 1,
      kind: "drifted",
      code: "github.base.advanced",
      safeToContinue: false,
      requiredAction: "rebase-and-reverify",
    };
  }
  if (input.relationship === "diverged") {
    return {
      schemaVersion: 1,
      kind: "drifted",
      code: "github.base.diverged",
      safeToContinue: false,
      requiredAction: "manual-review",
    };
  }
  return {
    schemaVersion: 1,
    kind: "drifted",
    code: "github.base.relationship-unknown",
    safeToContinue: false,
    requiredAction: "manual-review",
  };
}
