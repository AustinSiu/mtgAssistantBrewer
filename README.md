# MTG Land Draw Calculator

Calculate the expected number of lands in your opening hand and each subsequent draw using the [hypergeometric distribution](https://en.wikipedia.org/wiki/Hypergeometric_distribution).

## Features

- Deck size presets for Standard (60) and Commander (100)
- Adjustable land count with live percentage display
- Mulligan support (hand sizes 4-7)
- Per-turn expected lands and mana-screw probability
- Click any row to expand the full probability distribution

## Goal

- Optimize for the player and what they want, not for everyone. Go weird — don't just chase the ideas already sandblasted smooth by reality (e.g. EDHREC). Ref: Hank Green's ["Why Is Everything Boring Now?"](https://www.youtube.com/watch?v=NEDFUjqU7lE)

## Future Enhancements

- Use the [Scryfall tagger](https://tagger.scryfall.com/) for similar cards instead of EDHREC for "high relevance" / "played together" suggestions

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
