# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `GVPproj/gvp.fyi`.
Use the `gh` CLI from this repository.

## Conventions

- Before creating an issue, verify the target with
  `gh repo view --json nameWithOwner`.
- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open`, with appropriate filters.
- Comment: `gh issue comment <number> --body "..."`.
- Labels: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- Close: post an explanation with `gh issue comment`, then
  `gh issue close <number>`. Comment separately even if already closed.
- Use native GitHub sub-issues and blocking dependencies when available.
  Otherwise use `Part of #<parent>` and `Blocked by: #<number>` in
  issue bodies. An issue is unblocked when every blocker is closed.
- File issues only in this project's repository, never the skills repository.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read the GitHub issue.

For wayfinding, use one issue labelled `wayfinder:map` and child issues
labelled `wayfinder:<type>` (`research`, `prototype`, `grilling`, or `task`).
Link children as sub-issues, or use a task list and `Part of #<map>`.
The frontier is the first open child in map order with no open blockers
and no assignee. Claim with `gh issue edit <number> --add-assignee @me`.
Resolve by commenting, closing, and adding a summary and link to the
map's Decisions-so-far.
