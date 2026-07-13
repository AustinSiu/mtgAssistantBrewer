// Shared Scryfall test fixtures for the Vitest unit suite and the
// Playwright e2e journey — one card shape and one autocomplete catalog,
// so the two suites can't drift apart.

/** Fake Scryfall card with sensible defaults; override per call site. */
export function card(name, overrides = {}) {
  return {
    name,
    mana_cost: "{1}{G}",
    type_line: "Creature — Elf Druid",
    cmc: 2,
    color_identity: ["G"],
    id: `id-${name}`,
    scryfall_uri: `https://scryfall.com/card/test/${encodeURIComponent(name)}`,
    ...overrides,
  };
}

/** Names served by the stubbed /cards/autocomplete endpoint. */
export const CATALOG = [
  "Atraxa, Grand Unifier",
  "Atraxa, Praetors' Voice",
  "Llanowar Elves",
  "Elvish Mystic",
  "Sol Ring",
  "Swords to Plowshares",
  "Counterspell",
  "Cultivate",
  "Rhystic Study",
  "Wrath of God",
  "Beast Within",
  "Not A Real Card",
];

/** The autocomplete response body for a partial query. */
export function catalogMatches(partial) {
  const q = partial.toLowerCase();
  return CATALOG.filter((n) => n.toLowerCase().includes(q));
}
