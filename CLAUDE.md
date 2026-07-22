# MTG Assistant Brewer — working notes for Claude

## North star: the 33-card sub-deck strategy

This project exists to support one specific deck-building methodology: the
**33-card sub-deck strategy** (commander + 3 × 33-card slices built on a shared
slot skeleton, tuned for focus and reliability).

**Before proposing, designing, or evaluating any Deck Brewer feature, read
[`docs/33-card-strategy.md`](./docs/33-card-strategy.md).** It is the tie-breaker
when a design decision is ambiguous. In particular, check new work against the
"Product principles for new features" section — features should strengthen
focus, reason in **roles/quantities** (not just individual cards), keep **33 A
canonical** with the slices consistent, and make deck trends **countable**.

The README's Goal also stands: optimize for *this* player's weird plan and its
reliability, not for a globally "correct" list.

## Project shape

- React 19 + Vite SPA; state persists to `localStorage`.
- Data model: `commander` (string) + `slots` (33 shared `{note, tag}`) +
  `subDecks` (up to 3 × `{cards[33], flags}`). Geometry constants live in
  `src/deckShape.js`; shared color tokens in `src/colors.js`.
- Key modules: `DeckBrewer.jsx` (matrix workspace), `CommanderPicker.jsx`,
  `WorkspaceHeader.jsx`, `ConsistencyRail.jsx`, `DeckStats.jsx`,
  `Playtest.jsx`; pure logic in `brew.js`, `brewFormat.js`, `brewStats.js`,
  `decklist.js`, `scryfall.js`, `hypergeometric.js`.

## Working conventions

- **Verify before every PR:** `npm run lint`, `npx vitest run`, `npm run build`,
  and Playwright e2e (`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
  npx playwright test`). Don't open/update a PR on red.
- Follow the `pr-workflow` and `pr-screenshots` skills for all PRs (check a PR's
  state before editing; never stack new commits on merged history; regenerate +
  embed customer-journey screenshots, reverting render-noise diffs).
