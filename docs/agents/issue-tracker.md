# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `GVPproj/gvp.fyi`.
Use the `gh` CLI from this clone.

## Conventions

- Create: `gh issue create --title "..." --body-file -`, supplying a heredoc for multiline bodies.
- Read: `gh issue view <number> --comments`. Fetch structured details and labels with `--json title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`. Add label and state filters as needed.
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the issue and its comments.

New work belongs in GitHub Issues. The remaining local login/session ticket is active work; preserve it until explicitly migrated.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares issue and PR numbers. If the type is unclear, try
`gh pr view <number>` and fall back to `gh issue view <number>`.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- Child tickets: link as GitHub sub-issues. If unavailable, use a task
  list in the map and `Part of #<map>` in each child.
- Types: `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, or `wayfinder:task`.
- Blocking: use native GitHub issue dependencies. Add with
  `gh api --method POST repos/GVPproj/gvp.fyi/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Obtain the database ID with
  `gh api repos/GVPproj/gvp.fyi/issues/<blocker> --jq .id`.
  If dependencies are unavailable, record `Blocked by: #<number>` in
  the child body.
- Frontier: choose the first open child in map order with no assignee
  and no open blockers.
- Claim: `gh issue edit <number> --add-assignee @me`, the driving
  session's first write.
- Resolve: comment with the answer, close the child, and append a
  summary plus link to the map's Decisions-so-far.
