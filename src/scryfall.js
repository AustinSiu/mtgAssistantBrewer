const API_BASE = "https://api.scryfall.com";

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
  const res = await fetch(
    `${API_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  return res.json();
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
