import {
  lookupCollection,
  lookupFuzzy,
  rateLimitDelay,
  cardManaValue,
  buildSimilarQuery,
  searchCards,
} from "./scryfall";

// Map user-facing categories to Scryfall functional oracle tags
export const CATEGORY_TO_TAG = {
  Ramp: "ramp",
  "Mana Rock": "mana-rock",
  "Card Draw": "card-draw",
  Tutor: "tutor",
  Removal: "targeted-removal",
  "Board Wipe": "board-wipe",
  Counterspell: "counterspell",
  Protection: "protection",
  "Token Generator": "token-generator",
  Reanimation: "reanimation",
  "Grave Hate": "grave-hate",
  Blink: "blink",
  "Cost Reducer": "cost-reducer",
  Aristocrat: "aristocrat",
  Anthem: "anthem",
};

export const CATEGORY_SUGGESTIONS = Object.keys(CATEGORY_TO_TAG);

// Case-insensitive category → tag lookup so "ramp" works as well as "Ramp".
const TAG_BY_CATEGORY = new Map(
  Object.entries(CATEGORY_TO_TAG).map(([label, tag]) => [
    label.toLowerCase(),
    tag,
  ])
);

/**
 * The full deck-brew lookup pipeline. Takes the commander name and the raw
 * form rows ({ name, category }) and returns:
 *
 *   commanderCard — the resolved commander (or null),
 *   results       — one entry per non-empty row: { index, name, category,
 *                   card, matchType: "exact"|"fuzzy"|"none",
 *                   similarCards?: Card[] (only on tagged rows) }
 */
export async function brewDeck({ commander, rows }) {
  const filled = rows
    .map((row, index) => ({
      index,
      name: row.name.trim(),
      category: row.category.trim(),
    }))
    .filter((row) => row.name);

  // The commander lookup and the batch lookup are independent.
  const [commanderCard, { data = [], not_found: notFound = [] }] =
    await Promise.all([
      lookupFuzzy(commander.trim()),
      lookupCollection(filled.map((row) => row.name)),
    ]);

  // `data` preserves request order for the names that were found, so
  // walk the requested rows and consume it as a queue.
  const missed = new Set(notFound.map((id) => id.name.toLowerCase()));
  const queue = [...data];
  const results = filled.map((row) => {
    if (missed.has(row.name.toLowerCase())) {
      return { ...row, card: null, matchType: "none" };
    }
    return { ...row, card: queue.shift() ?? null, matchType: "exact" };
  });

  // Retry misses with fuzzy matching, one at a time to respect Scryfall's
  // rate-limit guidance. Names come from autocomplete so this should be
  // rare, but it still catches spellings the collection endpoint rejects
  // (e.g. single faces of double-faced cards).
  for (const entry of results) {
    if (entry.card) continue;
    await rateLimitDelay();
    const card = await lookupFuzzy(entry.name);
    if (card) {
      entry.card = card;
      entry.matchType = "fuzzy";
    }
  }

  // For each tagged card, fetch up to 3 alternatives filling the same role.
  // Identical queries are only fetched once, and cards already in the deck
  // are not suggested.
  const deckNames = new Set(
    results.filter((e) => e.card).map((e) => e.card.name.toLowerCase())
  );
  const searchCache = new Map();
  for (const entry of results) {
    if (!entry.card) continue;
    const tag = TAG_BY_CATEGORY.get(entry.category.toLowerCase());
    if (!tag) continue;

    const query = buildSimilarQuery(tag, cardManaValue(entry.card), commanderCard);
    if (!searchCache.has(query)) {
      await rateLimitDelay();
      const { data: found = [] } = await searchCards(query);
      searchCache.set(query, found);
    }
    entry.similarCards = searchCache
      .get(query)
      .filter((s) => !deckNames.has(s.name.toLowerCase()))
      .slice(0, 3);
  }

  return { commanderCard, results };
}
