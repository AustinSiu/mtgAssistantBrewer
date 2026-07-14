import { BASIC_LAND_NAMES } from "./brew";
import { cardPriceUsd, cardManaValue, cardTypeLine } from "./scryfall";

/** A Commander deck is 100 cards including the commander. */
export const COMMANDER_TARGET = 100;

// Section headers whose cards don't belong in the 100-card deck and are
// skipped entirely (as Moxfield's text export labels them).
const SKIP_SECTIONS = new Set([
  "sideboard",
  "maybeboard",
  "maybe",
  "considering",
  "tokens",
]);

/**
 * Parse a pasted decklist into { name, qty, commander } rows.
 *
 * Accepts the common formats:
 *   "1 Sol Ring", "1x Sol Ring", "Sol Ring" (qty defaults to 1),
 * and tolerates trailing set/collector info like "1 Sol Ring (C21) 263".
 *
 * Understands Moxfield's headered export (More → Export): a line with no
 * leading quantity that is either a "Section (12)" count or a bare section
 * keyword is treated as a header. The card under a "Commander" header is
 * flagged commander: true; cards under Sideboard/Maybeboard/Considering/
 * Tokens are dropped. Blank lines and `//`/`#` comments are ignored.
 */
export function parseDecklist(text) {
  const rows = new Map(); // lowername -> { name, qty, commander }
  let inCommander = false;
  let skipping = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("#")) continue;

    // A section header has no leading quantity and is either a "Name (12)"
    // count line or a bare, known section keyword.
    const header = line.match(/^([A-Za-z][A-Za-z ]*?)\s*\(\d+\)$/);
    const keyword = line.toLowerCase();
    const bareSection =
      !/^\d/.test(line) && (keyword === "commander" || SKIP_SECTIONS.has(keyword));
    if (header || bareSection) {
      const label = (header ? header[1] : keyword).trim().toLowerCase();
      inCommander = label.startsWith("commander");
      skipping = SKIP_SECTIONS.has(label);
      continue;
    }
    if (skipping) continue;

    const m = line.match(/^(?:(\d+)\s*[xX]?\s+)?(.+?)$/);
    if (!m) continue;
    const qty = m[1] ? parseInt(m[1], 10) : 1;
    // Strip a trailing " (SET) 123" or " (SET)" printing hint.
    const name = m[2].replace(/\s*\([^)]*\)\s*[\dA-Za-z-]*\s*$/, "").trim();
    if (!name) continue;
    // Ignore non-card residue such as a bare number line ("123").
    if (!/[a-zA-Z]/.test(name)) continue;

    const key = name.toLowerCase();
    const existing = rows.get(key);
    if (existing) {
      existing.qty += qty;
      if (inCommander) existing.commander = true;
    } else {
      rows.set(key, { name, qty, commander: inCommander });
    }
  }
  return [...rows.values()];
}

/** Basic lands (and snow basics) are exempt from the singleton rule. */
export function isBasicLand(name) {
  return BASIC_LAND_NAMES.has(name.trim().toLowerCase());
}

/**
 * Names (lowercased) that break Commander singleton: a non-basic card whose
 * total copies across `items` exceed one. Each item is { name, qty? }.
 */
export function duplicateNonBasics(items) {
  const counts = new Map();
  for (const { name, qty = 1 } of items) {
    const key = name.trim().toLowerCase();
    if (!key || isBasicLand(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + qty);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
}

/**
 * Group resolved entries for display.
 *
 * entries: [{ id, name, qty, tag, commander, card }]  (card may be null)
 * mode: "type" | "tag"
 *
 * Returns [{ label, entries, count, price }] in a stable, meaningful order.
 * The commander (if any) is always its own leading group.
 */
export function groupEntries(entries, mode) {
  // A Map keeps its groups in insertion order for free.
  const groups = new Map();
  const ensure = (label) => {
    if (!groups.has(label)) groups.set(label, []);
    return groups.get(label);
  };

  // Commander first, always.
  const commander = entries.find((e) => e.commander);
  if (commander) ensure("Commander").push(commander);

  for (const e of entries) {
    if (e.commander) continue;
    let label;
    if (!e.card) {
      label = "Unresolved";
    } else if (mode === "tag") {
      label = e.tag.trim() || "Untagged";
    } else {
      label = pluralType(cardPrimaryType(e.card));
    }
    ensure(label).push(e);
  }

  const result = [...groups.entries()].map(([label, groupEntries]) => ({
    label,
    entries: sortEntries(groupEntries, mode),
    count: groupEntries.reduce((n, e) => n + e.qty, 0),
    price: groupEntries.reduce(
      (sum, e) => sum + e.qty * (e.card ? cardPriceUsd(e.card) ?? 0 : 0),
      0
    ),
  }));

  return sortGroups(result, mode);
}

// The card-type taxonomy lives here in the domain layer. Two orderings that
// legitimately differ: DETECTION priority (a card can be several types — an
// "Artifact Creature" classifies as Creature) and the group DISPLAY order.
const CARD_TYPES = [
  { type: "Creature", plural: "Creatures" },
  { type: "Planeswalker", plural: "Planeswalkers" },
  { type: "Battle", plural: "Battles" },
  { type: "Instant", plural: "Instants" },
  { type: "Sorcery", plural: "Sorceries" },
  { type: "Artifact", plural: "Artifacts" },
  { type: "Enchantment", plural: "Enchantments" },
  { type: "Land", plural: "Lands" },
];

// Detection priority when a card carries several types.
const DETECTION_ORDER = [
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
function cardPrimaryType(card) {
  const line = cardTypeLine(card);
  for (const t of DETECTION_ORDER) {
    if (line.includes(t)) return t;
  }
  return "Other";
}

const TYPE_PLURAL = Object.fromEntries(
  CARD_TYPES.map(({ type, plural }) => [type, plural])
);
function pluralType(type) {
  return TYPE_PLURAL[type] ?? type;
}

// Display order for type groups (Commander/Unresolved handled separately).
const TYPE_GROUP_ORDER = [
  "Commander",
  ...CARD_TYPES.map((t) => t.plural),
  "Other",
  "Unresolved",
];

function sortGroups(groups, mode) {
  if (mode === "type") {
    return groups.sort(
      (a, b) => rank(TYPE_GROUP_ORDER, a.label) - rank(TYPE_GROUP_ORDER, b.label)
    );
  }
  // tag mode: Commander first, Untagged and Unresolved last, else alphabetical.
  const weight = (label) =>
    label === "Commander" ? 0 : label === "Untagged" ? 2 : label === "Unresolved" ? 3 : 1;
  return groups.sort(
    (a, b) => weight(a.label) - weight(b.label) || a.label.localeCompare(b.label)
  );
}

function rank(orderArr, label) {
  const i = orderArr.indexOf(label);
  return i === -1 ? orderArr.length : i;
}

function sortEntries(entries, mode) {
  return [...entries].sort((a, b) => {
    if (a.commander !== b.commander) return a.commander ? -1 : 1;
    // Within a group, order by mana value then name.
    const mvA = a.card ? cardManaValue(a.card) : 99;
    const mvB = b.card ? cardManaValue(b.card) : 99;
    if (mode !== "tag" && mvA !== mvB) return mvA - mvB;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Deck-wide stats for the summary panel.
 * Returns { total, price, colors: {W,U,B,R,G,C}, curve: number[8] (0..7+) }.
 */
export function deckStats(entries) {
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const curve = Array(8).fill(0); // index 7 = 7+
  let total = 0;
  let price = 0;

  for (const e of entries) {
    total += e.qty;
    if (!e.card) continue;
    price += e.qty * (cardPriceUsd(e.card) ?? 0);

    const ci = e.card.color_identity ?? [];
    if (ci.length === 0) colors.C += e.qty;
    else for (const c of ci) if (colors[c] != null) colors[c] += e.qty;

    // Curve excludes lands (mana value there isn't meaningful).
    if (!cardTypeLine(e.card).includes("Land")) {
      const mv = Math.min(7, Math.round(cardManaValue(e.card)));
      curve[mv] += e.qty;
    }
  }

  return { total, price, colors, curve };
}
