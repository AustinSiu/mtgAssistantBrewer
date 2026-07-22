import { cardManaCost, cardManaValue, cardTypeLine } from "./scryfall";
import { WUBRGC } from "./colors";

/**
 * Mana-symbol and curve stats for a set of resolved Scryfall cards (nulls
 * ignored), for the Deck Brewer stats panel:
 *
 *   - `curve`     non-land cards bucketed by mana value (index 7 = 7+)
 *   - `pips`      count of each coloured/colourless mana symbol in the costs
 *   - `production` count of cards that can produce each colour (`produced_mana`)
 *   - `avgMv`     average mana value of the non-land cards
 *
 * Hybrid symbols ({W/U}) count toward each half; generic ({2}) counts toward
 * nothing.
 */
export function brewStats(cards) {
  const pips = Object.fromEntries(WUBRGC.map((c) => [c, 0]));
  const production = Object.fromEntries(WUBRGC.map((c) => [c, 0]));
  const curve = Array(8).fill(0);
  let mvSum = 0;
  let nonLand = 0;

  for (const card of cards) {
    if (!card) continue;

    for (const token of cardManaCost(card).match(/\{[^}]+\}/g) ?? []) {
      for (const ch of token.slice(1, -1).split("/")) {
        if (pips[ch] != null) pips[ch] += 1;
      }
    }

    for (const c of card.produced_mana ?? []) {
      if (production[c] != null) production[c] += 1;
    }

    if (!cardTypeLine(card).includes("Land")) {
      const mv = cardManaValue(card);
      curve[Math.min(7, Math.round(mv))] += 1;
      mvSum += mv;
      nonLand += 1;
    }
  }

  const totalColorPips = pips.W + pips.U + pips.B + pips.R + pips.G;

  return {
    curve,
    pips,
    production,
    totalColorPips,
    nonLand,
    avgMv: nonLand ? mvSum / nonLand : 0,
  };
}
