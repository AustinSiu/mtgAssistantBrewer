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
- Data model: `commander` (string) + `slots` (33 shared `{id, note, tag}`) +
  `subDecks` (up to 3 × `{cards[33]}`). All of it persists to `localStorage`
  under `mtgBrewer.matrix.v1` (the Deck List tab uses `mtgBrewer.decklist.v1`),
  so a malformed persisted shape can blank the app on load — normalize
  defensively when reading it. Geometry constants live in `src/deckShape.js`;
  shared color tokens in `src/colors.js`.
- Key modules: `DeckBrewer.jsx` (matrix workspace), `CommanderPicker.jsx`,
  `WorkspaceHeader.jsx`, `ConsistencyRail.jsx`, `DeckStats.jsx`,
  `Playtest.jsx`; pure logic in `brew.js`, `brewFormat.js`, `brewStats.js`,
  `decklist.js`, `scryfall.js`, `hypergeometric.js`.

## Working conventions

- **Verify before every PR:** `npm run lint`, `npx vitest run`, `npm run build`,
  and Playwright e2e (`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
  npx playwright test`). Don't open/update a PR on red. Note the e2e runs against
  the built `dist/` via `npm run preview`, so **rebuild before running e2e** or it
  serves stale code.
- Follow the `pr-workflow` and `pr-screenshots` skills for all PRs (check a PR's
  state before editing; never stack new commits on merged history; regenerate +
  embed customer-journey screenshots, reverting render-noise diffs).

## Before you start

- **Check for existing work.** Look at open PRs and branches for the issue before
  opening a new one — don't ship a second PR for a problem another PR already
  addresses. One issue → one branch/PR.
- **Keep this file honest.** When you change the data model, persistence, or module
  layout, update "Project shape" in the same PR. This doc is the shared source of
  truth every agent loads first; a stale claim here is how two agents end up with
  different mental models of the same code.

## Diagnosing bugs (root-cause protocol)

A confident, wrong root cause is worse than none — it gets a plausible-but-useless
fix merged. Before claiming you've found the cause:

- **Reproduce it first.** A bug isn't understood until you can trigger it, ideally
  as a failing automated test. With no reproduction it's a *hypothesis* — say so,
  and don't dress it up as a conclusion.
- **Ship a regression test** with every bug fix: one that **fails without the fix
  and passes with it**. Prove it by temporarily reverting the fix and watching it
  go red. A fix with no failing-first test hasn't shown it addresses a real path.
- **Read the exact error; reason from its precise wording.** e.g. "Spread syntax
  requires ...iterable not be null or undefined" is the *null/undefined* case —
  **not** an empty array (`[...[]]` and `Math.max(...[])` don't throw). Guarding
  the wrong shape fixes nothing.
- **Verify factual claims against the code** (grep it). Never assert "there is no X
  here" from memory — e.g. this app *does* use `localStorage`.
- **Separate cause from symptom.** Resilience (error boundaries, guards, retries)
  is a different claim than a root-cause fix, with a different evidence bar. Keep
  them in different PRs.
