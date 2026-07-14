const API_BASE = "https://api.scryfall.com";

/** GET a Scryfall API path with the standard headers. */
function scryfallGet(path) {
  return fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
}

/**
 * Look up a batch of card names (up to 75) in a single request using
 * Scryfall's collection endpoint. Names must match exactly
 * (case-insensitive).
 *
 * Returns { data: Card[], not_found: Identifier[] } where `data` preserves
 * the order of the requested identifiers.
 */
export async function lookupCollection(names) {
  const res = await fetch(`${API_BASE}/cards/collection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ identifiers: names.map((name) => ({ name })) }),
  });
  if (!res.ok) {
    throw new Error(`Scryfall request failed (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fuzzy single-card lookup, used as a fallback for names the collection
 * endpoint couldn't match exactly. Returns the card, or null if Scryfall
 * finds no (or an ambiguous) match.
 */
export async function lookupFuzzy(name) {
  const res = await scryfallGet(`/cards/named?fuzzy=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  return res.json();
}

// Autocomplete results for a given partial are stable, so identical queries
// (same field re-typed, or any of the 34 name fields) are served from memory.
const autocompleteCache = new Map();

/**
 * Card-name autocompletion. Returns up to 20 catalog names matching the
 * partial input (Scryfall requires at least 2 characters), or [] on any
 * failure — suggestions are best-effort.
 */
export async function autocompleteCardNames(partial) {
  const key = partial.toLowerCase();
  if (autocompleteCache.has(key)) return autocompleteCache.get(key);
  const res = await scryfallGet(
    `/cards/autocomplete?q=${encodeURIComponent(partial)}`
  );
  if (!res.ok) return []; // failures are not cached
  const json = await res.json();
  const names = json.data ?? [];
  autocompleteCache.set(key, names);
  return names;
}

/** Test hook: reset the module-level autocomplete cache between tests. */
export function clearAutocompleteCache() {
  autocompleteCache.clear();
}

/** Scryfall asks for 50-100ms between requests. */
export function rateLimitDelay(ms = 100) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mana cost display, handling double-faced/split cards. */
export function cardManaCost(card) {
  if (card.mana_cost) return card.mana_cost;
  if (card.card_faces?.length) {
    return card.card_faces
      .map((face) => face.mana_cost)
      .filter(Boolean)
      .join(" // ");
  }
  return "";
}

/** Type line display, handling double-faced cards. */
export function cardTypeLine(card) {
  if (card.type_line) return card.type_line;
  if (card.card_faces?.length) {
    return card.card_faces
      .map((face) => face.type_line)
      .filter(Boolean)
      .join(" // ");
  }
  return "";
}

/** Color identity as a string: w,u,b,r,g,c (in WUBRG order) */
export function cardColorIdentity(card) {
  return (card.color_identity ?? []).join("");
}

/** Cheapest USD price for the card (regular, else foil), or null. */
export function cardPriceUsd(card) {
  const usd = card.prices?.usd ?? card.prices?.usd_foil ?? null;
  return usd == null ? null : Number(usd);
}

/** Combined mana cost string, both faces of a DFC joined with " // ". */
export function cardManaCostAll(card) {
  if (card.mana_cost != null && card.mana_cost !== "") return card.mana_cost;
  if (card.card_faces?.length) {
    return card.card_faces
      .map((f) => f.mana_cost)
      .filter((m) => m)
      .join(" // ");
  }
  return "";
}

/**
 * Primary card type (Creature, Instant, Land, …) derived from the type line,
 * for grouping. Returns "Other" when nothing matches.
 */
const TYPE_ORDER = [
  "Battle",
  "Planeswalker",
  "Creature",
  "Sorcery",
  "Instant",
  "Artifact",
  "Enchantment",
  "Land",
];
export function cardPrimaryType(card) {
  const line = cardTypeLine(card);
  // A card can be several types (e.g. Artifact Creature); pick by priority.
  for (const t of TYPE_ORDER) {
    if (line.includes(t)) return t;
  }
  return "Other";
}

/** Mana value (converted mana cost). */
export function cardManaValue(card) {
  return card.cmc ?? 0;
}

/**
 * Query for cards filling the same functional role: same oracle tag, same
 * mana value, and (when a commander is given) inside its color identity —
 * a colorless commander still restricts to id<=c.
 */
export function buildSimilarQuery(tag, manaValue, commanderCard) {
  const ci = commanderCard
    ? ` id<=${cardColorIdentity(commanderCard) || "c"}`
    : "";
  return `otag:${tag} mv:${manaValue}${ci} order:edhrec`;
}

/** Search Scryfall for cards matching criteria using advanced query syntax. */
export async function searchCards(query) {
  const res = await scryfallGet(
    `/cards/search?q=${encodeURIComponent(query)}&unique=cards`
  );
  if (!res.ok) {
    if (res.status === 404) return { data: [] };
    throw new Error(`Scryfall search failed (HTTP ${res.status})`);
  }
  const json = await res.json();
  return { data: json.data ?? [] };
}
