# Domain Docs

## Layout

Single-context: root `CONTEXT.md` and root `docs/adr/`.

## Before exploring

Read `CONTEXT.md` and any ADRs in `docs/adr/` relevant to the area
being explored.

If these files or directories are absent, proceed silently.
Domain modeling creates them lazily when terms or decisions are resolved.

## Use the glossary's vocabulary

Use the terms defined in `CONTEXT.md` when naming domain concepts,
including issue titles, proposals, hypotheses, and tests. Respect its
explicitly avoided synonyms.

If a needed concept is missing, reconsider whether it belongs or note
the gap for domain modeling.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR,
and explain why reopening that decision may be worthwhile.
