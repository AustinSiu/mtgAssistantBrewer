# MTG Assistant Brewer

Process-driven Commander deck building. One 100-card deck = your commander +
up to 3 sub-decks of 33 cards built on a shared slot skeleton, so the deck's
composition (lands : ramp : removal : win conditions : …) stays deliberate
and consistent.

The methodology this tool supports — its core tenets, process, and how the
features map to it — is documented in
[`docs/33-card-strategy.md`](./docs/33-card-strategy.md).

## Features

### Deck Brewer

- Slot × sub-deck matrix: 33 shared slots, each with a free-form **note**
  (for you) and a **tag** (drives suggestions, mapped to
  [Scryfall functional oracle tags](https://tagger.scryfall.com/))
- Up to 3 color-coded sub-decks; card names autocomplete from Scryfall and
  only suggested names can be saved
- Per-slot alternatives driven by the main sub-deck (33 A): same tag, same
  mana value, inside the commander's color identity — take one into another
  sub-deck or a new one
- Changing a tag or a chosen card warns that same-row picks in other
  sub-decks may no longer fit, and flags them amber until reviewed
- Commander singleton enforced across all sub-decks (basic lands exempt)
- Composition-by-tag summary comparing sub-decks side by side
- Everything persists locally (localStorage)

### Land Draw Calculator

- Expected lands in the opening hand and each draw via the
  [hypergeometric distribution](https://en.wikipedia.org/wiki/Hypergeometric_distribution)
- Deck size presets for Standard (60) and Commander (100)
- Mulligan support (hand sizes 4-7), full probability distribution per draw

## Goal

- Optimize for the player and what they want, not for everyone. Go weird — don't just chase the ideas already sandblasted smooth by reality (e.g. EDHREC). Ref: Hank Green's ["Why Is Everything Boring Now?"](https://www.youtube.com/watch?v=NEDFUjqU7lE)

## Future Enhancements

- [ ] Integrate with collection apps/features to optionally filter
      suggestions on owned vs. not owned
- [x] Use the [Scryfall tagger](https://tagger.scryfall.com/) for similar
      cards instead of EDHREC for "high relevance" / "played together"
      suggestions — done: suggestions query `otag:` functional tags
      (EDHREC remains only as the result ordering, `order:edhrec`)
- [x] Deck builder (slot × sub-deck matrix) — done, see Features

## Getting Started

```
npm install
npm run dev
```

## Tests

```
npm test
```

## E2E & PR Screenshots

The Playwright suite drives the full customer journey against the production
build and writes the screenshots (`docs/screenshots/`) that every pull
request description must embed (see `.claude/skills/pr-screenshots/`):

```
npx playwright install chromium   # first time only
npm run build
npm run e2e
```

Scryfall responses are stubbed for determinism; set `SCRYFALL_LIVE=1` to hit
the real API.

## CLI Version

A standalone Python script is also included:

```
python3 land_draw_calculator.py -d 60 -l 24 --hand-size 6
```
