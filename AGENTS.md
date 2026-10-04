## Coding standards

- Prefer native HTML and modern CSS over custom JavaScript. Use JavaScript only for behavior the platform cannot adequately provide.
- Reach for built-in features such as `<dialog>`, the Popover API, `<details>`/`<summary>`, native form validation, CSS anchor positioning, and container queries before implementing equivalents in JavaScript.
- Check browser support against the project's supported browsers before adopting newer features. Use progressive enhancement and small fallbacks where needed; ask if the browser support policy is unclear.
- Preserve accessibility: semantic markup, keyboard interaction, focus management, and reduced-motion preferences. Verify native behavior meets the interaction's needs.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues. See `docs/agents/issue-tracker.md` before reading or publishing tickets.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md` when triaging issues.

### Domain docs

Single-context layout. Read `docs/agents/domain.md` before exploring the codebase.
