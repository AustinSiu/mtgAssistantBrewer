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

/** Scryfall oracle tag for a slot's category, or undefined if none maps. */
export function tagForCategory(category) {
  return TAG_BY_CATEGORY.get(category.trim().toLowerCase());
}

/**
 * The only cards exempt from the Commander singleton rule — the same basic
 * land may appear in any number of sub-decks.
 */
export const BASIC_LAND_NAMES = new Set(
  ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"].flatMap(
    (n) => [n.toLowerCase(), `snow-covered ${n.toLowerCase()}`]
  )
);

// Scryfall's collection endpoint takes at most 75 identifiers per request.
const COLLECTION_CHUNK = 75;

/**
 * Resolve the commander plus every unique card name in the matrix.
 *
 * Returns { commanderCard, cardsByName } where cardsByName maps the
 * lowercased input name to { card, matchType: "exact"|"fuzzy"|"none" }.
 */
export async function lookupDeckCards({ commander, names }) {
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];

  const chunks = [];
  for (let i = 0; i < unique.length; i += COLLECTION_CHUNK) {
    chunks.push(unique.slice(i, i + COLLECTION_CHUNK));
  }

  // The commander lookup and the batch lookups are independent.
  const [commanderCard, ...collections] = await Promise.all([
    lookupFuzzy(commander.trim()),
    ...chunks.map((chunk) => lookupCollection(chunk)),
  ]);

  const cardsByName = new Map();
  chunks.forEach((chunk, i) => {
    const { data = [], not_found: notFound = [] } = collections[i];
    const missed = new Set(notFound.map((id) => id.name.toLowerCase()));
    // `data` preserves request order for the names that were found, so
    // walk the requested chunk and consume it as a queue.
    const queue = [...data];
    for (const name of chunk) {
      const key = name.toLowerCase();
      if (missed.has(key)) {
        cardsByName.set(key, { card: null, matchType: "none" });
      } else {
        cardsByName.set(key, {
          card: queue.shift() ?? null,
          matchType: "exact",
        });
      }
    }
  });

  // Retry misses with fuzzy matching, one at a time to respect Scryfall's
  // rate-limit guidance. Names come from autocomplete so this should be
  // rare, but it still catches spellings the collection endpoint rejects
  // (e.g. single faces of double-faced cards).
  for (const [key, entry] of cardsByName) {
    if (entry.card) continue;
    await rateLimitDelay();
    const card = await lookupFuzzy(key);
    if (card) {
      cardsByName.set(key, { card, matchType: "fuzzy" });
    }
  }

  return { commanderCard, cardsByName };
}

// Similar-card results are stable per query; fetched once per session.
const similarCache = new Map();

/** Test hook: reset the module-level similar-cards cache between tests. */
export function clearSimilarCache() {
  similarCache.clear();
}

/**
 * Up to 3 alternatives filling the same role as `card`: same oracle tag,
 * same mana value, inside the commander's color identity — excluding names
 * already used anywhere in the deck (Commander singleton).
 */
export async function fetchSimilar({ card, tag, commanderCard, excludeNames }) {
  const query = buildSimilarQuery(tag, cardManaValue(card), commanderCard);
  if (!similarCache.has(query)) {
    const { data: found = [] } = await searchCards(query);
    similarCache.set(query, found);
  }
  return similarCache
    .get(query)
    .filter((s) => !excludeNames.has(s.name.toLowerCase()))
    .slice(0, 3);
}
