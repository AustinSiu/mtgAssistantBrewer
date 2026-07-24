const API_BASE = "https://api.scryfall.com";

// --- Rate limiting -----------------------------------------------------------
// Scryfall asks for ~50-100ms between requests and returns HTTP 429 on bursts.
// (Its 429 responses omit `Access-Control-Allow-Origin`, so a browser surfaces
// them as CORS errors.) Route EVERY request through here: reserve a start slot
// so requests are spaced ~REQUEST_SPACING_MS apart across all (parallel)
// callers, and retry a 429 with backoff. This keeps loading a populated brew —
// which fans out into many parallel lookups (per-card collection, per-(card,tag)
// otag searches, token art) — under Scryfall's limiter.
const REQUEST_SPACING_MS = 100;
const MAX_RETRIES = 3;

let nextSlot = 0;

function reserveSlot() {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + REQUEST_SPACING_MS;
  const wait = start - now;
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch() a Scryfall path through the shared rate limiter, retrying 429s. */
async function scryfallFetch(path, options) {
  for (let attempt = 0; ; attempt++) {
    await reserveSlot();
    const res = await fetch(`${API_BASE}${path}`, options);
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res;
    const retryAfter = Number(res.headers?.get?.("Retry-After"));
    await sleep(
      retryAfter > 0 ? retryAfter * 1000 : REQUEST_SPACING_MS * 2 ** (attempt + 1)
    );
  }
}

/** Test hook: reset the rate limiter so timing doesn't leak between tests. */
export function resetScryfallRateLimit() {
  nextSlot = 0;
}

/** GET a Scryfall API path with the standard headers (rate-limited). */
function scryfallGet(path) {
  return scryfallFetch(path, { headers: { Accept: "application/json" } });
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
  const res = await scryfallFetch(`/cards/collection`, {
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
 * The tokens a card can create, read from its Scryfall `all_parts` relation
 * (component "token"). Returns [{ id, name }], deduped, empty when none.
 */
export function cardTokenParts(card) {
  const seen = new Set();
  const parts = [];
  for (const p of card?.all_parts ?? []) {
    if (p.component === "token" && p.id && !seen.has(p.id)) {
      seen.add(p.id);
      parts.push({ id: p.id, name: p.name });
    }
  }
  return parts;
}

/** Fetch full cards by Scryfall id (chunked to the collection limit of 75). */
export async function lookupCardsByIds(ids) {
  const unique = [...new Set(ids)];
  const out = [];
  for (let i = 0; i < unique.length; i += 75) {
    const chunk = unique.slice(i, i + 75);
    const res = await scryfallFetch(`/cards/collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`Scryfall request failed (HTTP ${res.status})`);
    const json = await res.json();
    out.push(...(json.data ?? []));
  }
  return out;
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

/**
 * Type line without subtypes — just the supertypes and card types before the
 * em dash (e.g. "Legendary Creature — Angel" -> "Legendary Creature").
 */
export function cardTypeLabel(card) {
  return cardTypeLine(card)
    .split(" // ")
    .map((face) => face.split("—")[0].trim())
    .filter(Boolean)
    .join(" // ");
}

/** Color identity as a string: w,u,b,r,g,c (in WUBRG order) */
export function cardColorIdentity(card) {
  return (card.color_identity ?? []).join("");
}

// Priority order for classifying a card that carries several types
// (e.g. an "Artifact Creature" is primarily a Creature).
const PRIMARY_TYPE_ORDER = [
  "Battle",
  "Planeswalker",
  "Creature",
  "Sorcery",
  "Instant",
  "Artifact",
  "Enchantment",
  "Land",
];

/** Primary card type from the type line (before the em dash), or "Other". */
export function cardPrimaryType(card) {
  const line = cardTypeLine(card);
  for (const t of PRIMARY_TYPE_ORDER) {
    if (line.includes(t)) return t;
  }
  return "Other";
}

/** Cheapest USD price for the card (regular, else foil), or null. */
export function cardPriceUsd(card) {
  const usd = card.prices?.usd ?? card.prices?.usd_foil ?? null;
  return usd == null ? null : Number(usd);
}

/** Mana value (converted mana cost). */
export function cardManaValue(card) {
  return card.cmc ?? 0;
}

/**
 * Card image URL, handling double-faced cards. Prefers `normal` but falls
 * back through the other sizes so a card that happens to omit one still shows
 * an image; null only if the card carries no image at all.
 */
export function cardImageUrl(card) {
  const uris = card?.image_uris ?? card?.card_faces?.[0]?.image_uris;
  return uris?.normal ?? uris?.large ?? uris?.small ?? uris?.png ?? null;
}

/**
 * Query for cards filling the same functional role: same oracle tag, same
 * mana value, same primary card type (so a sorcery suggests sorceries, not
 * artifacts), and — when a commander is given — inside its color identity
 * (a colorless commander still restricts to id<=c).
 */
export function buildSimilarQuery(tag, manaValue, commanderCard, type) {
  const ci = commanderCard
    ? ` id<=${cardColorIdentity(commanderCard) || "c"}`
    : "";
  if (type === "Land") {
    // Lands share no functional oracle tag and are all mana value 0; suggest
    // other lands within the commander's color identity.
    return `t:land${ci} order:edhrec`;
  }
  const t = type && type !== "Other" ? ` t:${type.toLowerCase()}` : "";
  return `otag:${tag} mv:${manaValue}${t}${ci} order:edhrec`;
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
