import { BASIC_LAND_NAMES } from "./brew";
import {
  cardPrimaryType,
  cardPriceUsd,
  cardManaValue,
  cardTypeLine,
} from "./scryfall";

/**
 * Parse a pasted decklist into { name, qty } rows.
 *
 * Accepts the common formats:
 *   "1 Sol Ring", "1x Sol Ring", "Sol Ring" (qty defaults to 1),
 * and tolerates trailing set/collector info like "1 Sol Ring (C21) 263"
 * and category headers / blank lines, which are skipped.
 */
export function parseDecklist(text) {
  const rows = new Map(); // lowername -> { name, qty }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Skip section headers like "// Sideboard" or a bare "Creatures (35)"
    // (a name with no quantity whose only parenthetical is a plain count).
    if (line.startsWith("//") || line.startsWith("#")) continue;
    if (/^[A-Za-z][A-Za-z ]*\(\d+\)$/.test(line)) continue;

    const m = line.match(/^(?:(\d+)\s*[xX]?\s+)?(.+?)$/);
    if (!m) continue;
    const qty = m[1] ? parseInt(m[1], 10) : 1;
    // Strip a trailing " (SET) 123" or " (SET)" printing hint.
    const name = m[2].replace(/\s*\([^)]*\)\s*[\dA-Za-z-]*\s*$/, "").trim();
    if (!name) continue;
    // A bare count-less header like "Creatures (35)" collapses to "Creatures";
    // require the name to contain a letter and not be a pure section word.
    if (!/[a-zA-Z]/.test(name)) continue;

    const key = name.toLowerCase();
    const existing = rows.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      rows.set(key, { name, qty });
    }
  }
  return [...rows.values()];
}

/** Basic lands (and snow basics) are exempt from the singleton rule. */
export function isBasicLand(name) {
  return BASIC_LAND_NAMES.has(name.trim().toLowerCase());
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
  const groups = new Map();
  const order = [];
  const ensure = (label) => {
    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
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

  const result = order.map((label) => {
    const groupEntries = groups.get(label);
    return {
      label,
      entries: sortEntries(groupEntries, mode),
      count: groupEntries.reduce((n, e) => n + e.qty, 0),
      price: groupEntries.reduce(
        (sum, e) => sum + e.qty * (e.card ? cardPriceUsd(e.card) ?? 0 : 0),
        0
      ),
    };
  });

  return sortGroups(result, mode);
}

const TYPE_PLURAL = {
  Creature: "Creatures",
  Instant: "Instants",
  Sorcery: "Sorceries",
  Artifact: "Artifacts",
  Enchantment: "Enchantments",
  Planeswalker: "Planeswalkers",
  Battle: "Battles",
  Land: "Lands",
  Other: "Other",
};
function pluralType(type) {
  return TYPE_PLURAL[type] ?? type;
}

// Display order for type groups (Commander/Unresolved handled separately).
const TYPE_GROUP_ORDER = [
  "Commander",
  "Creatures",
  "Planeswalkers",
  "Battles",
  "Instants",
  "Sorceries",
  "Artifacts",
  "Enchantments",
  "Lands",
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
