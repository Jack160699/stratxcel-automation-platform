import type { OwnerEventType } from "../types";

/** Pure connector-normalization helpers, split out so they're directly testable without a network call or a DB-touching import chain. See __tests__/connectors.test.ts. */

export function extractDomain(emailField: string): string {
  const match = emailField.match(/@([\w.-]+)/);
  return match ? match[1] : "unknown";
}

export function mapGitHubEventType(githubType: string): OwnerEventType | null {
  switch (githubType) {
    case "PushEvent":
      return "github_commit";
    case "PullRequestEvent":
    case "PullRequestReviewEvent":
      return "github_pull_request";
    case "IssuesEvent":
    case "IssueCommentEvent":
      return "github_issue";
    default:
      return null;
  }
}
