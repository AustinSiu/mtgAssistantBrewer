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
  `decklistModel.js`, `playtestEngine.js`, `scryfall.js`, `hypergeometric.js`.
- A component (`Playtest.jsx`) and its pure-logic sibling (`playtestEngine.js`)
  must **not** share a case-only name. Extensionless imports resolve `.js` before
  `.jsx`, so a `Playtest.jsx` + `playtest.js` pair makes `import Playtest from
  "./Playtest"` load the *logic* module on case-insensitive filesystems
  (macOS/Windows) — a blank page there while Linux CI stays green. CI guards this
  (the filename check in `ci.yml`).

## Building & testing

Commands and **when** to run them:

- `npm run dev` — Vite dev server, for local interactive work.
- `npm run lint` — ESLint. Before every commit/PR.
- `npx vitest run` — unit/component tests (jsdom + Testing Library). Fast; run
  constantly while working. jsdom has **no layout engine** (`getBoundingClientRect`
  returns 0), so it checks logic and rendered markup, not pixels or real drag
  geometry.
- `npm run build` — Vite production build. Run before e2e and before any PR.
- Playwright e2e — **build first**, then
  `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test`.
  It serves the built `dist/` via `npm run preview`, so a stale `dist/` silently
  tests old code. Regenerates `docs/screenshots/`.

**Before opening/updating a PR:** run all four green (lint → vitest → build → e2e),
then revert render-noise screenshot diffs and embed only the shots your change
affects. Don't open/update a PR on red.

**Blind spots the suite can't catch — verify these in a real browser (local `dev`
or a Cloudflare Pages PR preview):**

- **Scryfall is stubbed** everywhere (CI/sandbox can't reach `api.scryfall.com`).
  Real API behavior — card shapes, `all_parts`, rate limits — is only exercised
  against a real browser hitting the live API.
- **Case-sensitivity:** CI runs on Linux (case-sensitive); macOS/Windows aren't.
  See the filename rule under "Project shape". CI guards it, but a preview build
  (also Linux) will *not* reveal a case bug — only a local macOS/Windows build does.
- **Visual / layout / UX:** jsdom can't render and scripted e2e screenshots only
  approximate; judge visual polish and interaction feel in a real browser.

CI (`.github/workflows/ci.yml`) enforces this on every PR: `verify`
(lint → vitest → build → e2e), `require-tests` (a `src/*.{js,jsx}` change needs a
test change, or the `no-test-needed` label), and the filename-collision check.

## Working conventions

- **Verify before every PR:** run the full suite green — see "Building & testing"
  above. Don't open/update a PR on red.
- Follow the `pr-workflow` and `pr-screenshots` skills for all PRs (check a PR's
  state before editing; never stack new commits on merged history; regenerate +
  embed customer-journey screenshots, reverting render-noise diffs).

## Before you start

- **Start from current code.** Never branch off local `main` — `git fetch` moves
  `origin/main`, not your local `main`, so local `main` is often stale. Fetch, then
  branch off the remote tip: `git fetch origin && git switch -c <branch> origin/main`
  (equivalently `git checkout -B <branch> origin/main`).
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

CI enforces this: `.github/workflows/ci.yml` runs the verify suite and **fails a
PR that changes `src/*.{js,jsx}` without also changing a test**. For a genuine
no-behavior change (pure refactor, config), add the `no-test-needed` label to
opt out.
