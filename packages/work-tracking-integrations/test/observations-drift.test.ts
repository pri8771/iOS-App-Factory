import { describe, expect, it } from "vitest";

import {
  decideGitHubBaseDrift,
  decideJiraIssueDrift,
  ingestPinnedJiraIssue,
  JiraRevisionDriftError,
  parseGitHubDeliverySnapshot,
  pinJiraIssueRevision,
} from "../src/index.js";
import { jiraIssue, SHA_A, SHA_B, SHA_C, T1 } from "./fixtures.js";

function githubDelivery(checksReversed = false) {
  const checks = [
    {
      schemaVersion: 1,
      repository: "priyansh/hindsight-ios",
      commitSha: SHA_B,
      appSlug: "github-actions",
      name: "unit",
      status: "completed",
      conclusion: "success",
      detailsUrl: "https://github.com/priyansh/hindsight-ios/actions/runs/1",
      providerRevision: "check-1",
      observedAt: T1,
    },
    {
      schemaVersion: 1,
      repository: "priyansh/hindsight-ios",
      commitSha: SHA_B,
      appSlug: "github-actions",
      name: "ui",
      status: "completed",
      conclusion: "success",
      detailsUrl: "https://github.com/priyansh/hindsight-ios/actions/runs/2",
      providerRevision: "check-2",
      observedAt: T1,
    },
  ];
  return {
    schemaVersion: 1,
    repository: {
      schemaVersion: 1,
      nodeId: "R_kgDOExample",
      fullName: "priyansh/hindsight-ios",
      url: "https://github.com/priyansh/hindsight-ios",
      visibility: "private",
      archived: false,
      defaultBranch: "main",
      operationMarker: `app-factory:v1:github:repository.ensure:${"e".repeat(64)}`,
      providerRevision: "repo-1",
      observedAt: T1,
    },
    baseBranch: {
      schemaVersion: 1,
      repository: "priyansh/hindsight-ios",
      name: "main",
      headSha: SHA_A,
      protected: true,
      providerRevision: "branch-1",
      observedAt: T1,
    },
    pullRequest: {
      schemaVersion: 1,
      repository: "priyansh/hindsight-ios",
      number: 12,
      nodeId: "PR_kwDOExample",
      url: "https://github.com/priyansh/hindsight-ios/pull/12",
      state: "open",
      draft: false,
      baseRef: "main",
      baseSha: SHA_A,
      headRef: "factory/quality",
      headSha: SHA_B,
      mergeBaseSha: SHA_C,
      operationMarker: `app-factory:v1:github:pr.ensure:${"f".repeat(64)}`,
      providerRevision: "pr-1",
      observedAt: T1,
    },
    checks: checksReversed ? checks.reverse() : checks,
    merge: null,
  };
}

describe("revision-pinned Jira ingestion", () => {
  it("accepts only the exact observed revision and content digest", () => {
    const pinned = pinJiraIssueRevision(jiraIssue());
    expect(ingestPinnedJiraIssue(jiraIssue(), pinned.pin)).toEqual(pinned.issue);
    expect(decideJiraIssueDrift(pinned.pin, jiraIssue()).kind).toBe("current");

    expect(() =>
      ingestPinnedJiraIssue(jiraIssue({ summary: "Changed without a version bump" }), pinned.pin),
    ).toThrow(JiraRevisionDriftError);
    expect(
      decideJiraIssueDrift(pinned.pin, jiraIssue({ version: 8, providerRevision: "etag-8" })),
    ).toEqual(
      expect.objectContaining({
        kind: "drifted",
        code: "jira.issue.revision-changed",
        safeToContinue: false,
        requiredAction: "repin-and-replan",
      }),
    );
  });

  it("rejects unexpected fields in provider snapshots", () => {
    expect(() => pinJiraIssueRevision(jiraIssue({ token: "must-not-be-ingested" }))).toThrow(
      /unexpected or missing fields/,
    );
  });
});

describe("GitHub delivery observation and base drift", () => {
  it("binds repository, branch, PR, checks, and merge state into one stable digest", () => {
    const first = parseGitHubDeliverySnapshot(githubDelivery());
    const reordered = parseGitHubDeliverySnapshot(githubDelivery(true));
    expect(reordered).toEqual(first);
    expect(first.checks.map((check) => check.name)).toEqual(["ui", "unit"]);
  });

  it("rejects checks from another commit and incoherent merge observations", () => {
    const wrongCheck = githubDelivery();
    const firstCheck = wrongCheck.checks[0];
    if (firstCheck === undefined) throw new Error("fixture has no GitHub check");
    firstCheck.commitSha = SHA_C;
    expect(() => parseGitHubDeliverySnapshot(wrongCheck)).toThrow(/pull request head/);

    const wrongMerge = {
      ...githubDelivery(),
      merge: {
        schemaVersion: 1,
        repository: "priyansh/hindsight-ios",
        pullRequestNumber: 12,
        mergeCommitSha: SHA_C,
        mergedAt: T1,
        actorId: "user-1",
        providerRevision: "merge-1",
        observedAt: T1,
      },
    };
    expect(() => parseGitHubDeliverySnapshot(wrongMerge)).toThrow(/unmerged/);
  });

  it("accepts a merge only when it is bound to the same repository and pull request", () => {
    const merged = githubDelivery();
    merged.pullRequest.state = "merged";
    const snapshot = parseGitHubDeliverySnapshot({
      ...merged,
      merge: {
        schemaVersion: 1,
        repository: "priyansh/hindsight-ios",
        pullRequestNumber: 12,
        mergeCommitSha: SHA_C,
        mergedAt: T1,
        actorId: "user-1",
        providerRevision: "merge-1",
        observedAt: T1,
      },
    });
    expect(snapshot.merge?.mergeCommitSha).toBe(SHA_C);
    expect(snapshot.pullRequest?.state).toBe("merged");
  });

  it("requires a rebase and complete re-verification when the base advances", () => {
    expect(
      decideGitHubBaseDrift({
        schemaVersion: 1,
        plannedBaseSha: SHA_A,
        observedBaseSha: SHA_B,
        relationship: "descendant",
      }),
    ).toEqual({
      schemaVersion: 1,
      kind: "drifted",
      code: "github.base.advanced",
      safeToContinue: false,
      requiredAction: "rebase-and-reverify",
    });
    expect(
      decideGitHubBaseDrift({
        schemaVersion: 1,
        plannedBaseSha: SHA_A,
        observedBaseSha: SHA_A,
        relationship: "same",
      }).safeToContinue,
    ).toBe(true);
  });
});
