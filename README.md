# MTG Land Draw Calculator

Calculate the expected number of lands in your opening hand and each subsequent draw using the [hypergeometric distribution](https://en.wikipedia.org/wiki/Hypergeometric_distribution).

## Features

- Deck size presets for Standard (60) and Commander (100)
- Adjustable land count with live percentage display
- Mulligan support (hand sizes 4-7)
- Per-turn expected lands and mana-screw probability
- Click any row to expand the full probability distribution

## Getting Started

```
npm install
npm run dev
```

## Tests

```
npm test
```

## CLI Version

A standalone Python script is also included:

```
python3 land_draw_calculator.py -d 60 -l 24 --hand-size 6
```
