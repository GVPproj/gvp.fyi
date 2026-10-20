# Issues

Use GitHub Issues in `GVPproj/gvp.fyi` via `gh` from this clone. Skill references to publishing/fetching tickets mean creating/reading GitHub issues, including comments. PRs are not a request surface; if a number's type is unclear, try `gh pr view <number>` before `gh issue view <number>`.

- Read: `gh issue view <number> --comments`; for structured output use `--json title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
- Create: `gh issue create --title "..." --body-file -` with a heredoc for multiline bodies.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

## Triage

Canonical roles and tracker labels are identical:

| Label | Meaning |
| --- | --- |
| `needs-triage` | Maintainer evaluation needed |
| `needs-info` | Waiting on reporter information |
| `ready-for-agent` | Fully specified; ready for an AFK agent |
| `ready-for-human` | Requires human implementation |
| `wontfix` | Will not be actioned |

## Wayfinding

- Map: one `wayfinder:map` issue with Notes, Decisions-so-far and Fog.
- Children: GitHub sub-issues; fallback to a task list in the map and `Part of #<map>` in each child. Types: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`.
- Blockers: native issue dependencies. Get the blocker's database ID with `gh api repos/GVPproj/gvp.fyi/issues/<blocker> --jq .id`, then add it with `gh api --method POST repos/GVPproj/gvp.fyi/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Fallback: `Blocked by: #<number>` in the child body.
- Frontier: first open child in map order with no assignee or open blockers.
- Claim: `gh issue edit <number> --add-assignee @me` is the driving session's first write.
- Resolve: comment with the answer, close the child, and append a summary/link to the map's Decisions-so-far.
