# Domain Docs

## Before exploring

Read root `GLOSSARY.md` and relevant ADRs in `docs/adr/`.

If these files do not exist, proceed silently. Do not suggest creating
them upfront; domain-modeling creates them when terms or decisions
are resolved.

## Layout

This is a single-context repository:

- `GLOSSARY.md`: domain vocabulary.
- `docs/adr/`: architectural decisions.

## Vocabulary

Use the glossary's terms in issues, proposals, hypotheses, and tests.
Avoid synonyms the glossary explicitly rejects. Flag missing domain
concepts for domain-modeling.

## ADR conflicts

Explicitly identify any conflict with an existing ADR and explain why
it might be worth reopening. Never silently override a recorded decision.
