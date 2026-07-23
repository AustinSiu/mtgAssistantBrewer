<!-- Keep these headings; delete any section that doesn't apply to this PR. -->

## Summary

<!-- What this change does, and why. -->

## Root cause & reproduction (bug fixes)

<!-- Bug fixes only — delete otherwise.
     - What was actually wrong, and where (file:line).
     - How you reproduced it. A confident wrong root cause is worse than none;
       see CLAUDE.md's "Diagnosing bugs" protocol.
     - If you couldn't reproduce it, say so — this is a hypothesis, not a fix. -->

## Regression test

<!-- Bug fixes: name the test that FAILS without this change and passes with it
     (verify by reverting the fix). If there isn't one, explain why. -->

## Testing

- [ ] `npm run lint`
- [ ] `npx vitest run`
- [ ] `npm run build`
- [ ] Playwright e2e — `CHROMIUM_PATH=… npx playwright test` (rebuild first)

## Screenshots

<!-- UI changes: embed the customer-journey screenshots (see the pr-screenshots
     skill). Omit for non-UI changes. -->
