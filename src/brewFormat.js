/**
 * Deck Brewer's own export/import format: a tab-separated table that lays the
 * 1–3 sub-decks out side by side so their composition is clear, and carries
 * enough (commander + game plan + role targets + per-slot tag/note + each
 * sub-deck's card) to reload the whole brew later.
 *
 *   Commander: Atraxa, Praetors' Voice
 *   Plan: Ramp into Atraxa by turn 4, grind value, win with proliferate.
 *   Targets: Ramp=4	Removal=3	Card Draw=3
 *   #	Tag	Note	33 A	33 B	33 C
 *   1	Ramp	early accel	Sol Ring	Arcane Signet	Mind Stone
 *   2	Removal		Swords to Plowshares	Path to Exile
 *   …33 rows
 */

import { CARD_COUNT as SLOT_COUNT, SUB_DECK_NAMES } from "./deckShape";

const cell = (s) => (s ?? "").replace(/\t/g, " ").trim();
// The plan is one line in the export, so collapse any internal newlines.
const oneLine = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Render the brew as the tab-separated sub-deck table. `subDecks` should be
 * pre-filtered to the sub-decks to include (1–3); `subDeckNames` labels them.
 * `plan` (string) and `targets` ({ [tag]: count }) are optional.
 */
export function toBrewFormat({
  commander,
  plan,
  targets,
  slots,
  subDecks,
  subDeckNames = SUB_DECK_NAMES,
}) {
  const names = subDeckNames.slice(0, subDecks.length);
  const lines = [];
  const cmdr = (commander ?? "").trim();
  if (cmdr) lines.push(`Commander: ${cmdr}`);
  const planLine = oneLine(plan);
  if (planLine) lines.push(`Plan: ${planLine}`);
  const targetPairs = Object.entries(targets ?? {})
    .filter(([, n]) => n > 0)
    .map(([tag, n]) => `${cell(tag)}=${n}`);
  if (targetPairs.length) lines.push(["Targets:", ...targetPairs].join("\t"));
  lines.push(["#", "Tag", "Note", ...names].join("\t"));
  slots.forEach((slot, i) => {
    lines.push(
      [
        String(i + 1),
        cell(slot.tag),
        cell(slot.note),
        ...subDecks.map((sd) => cell(sd.cards[i])),
      ].join("\t")
    );
  });
  return lines.join("\n");
}

/**
 * Some mobile clipboards percent-encode the tabs and newlines that hold this
 * format together, so a clean export pasted on a phone arrives as
 * "commander:%20Lathril%0A%23%09Tag…" — every structural tab (%09) and newline
 * (%0A) escaped, which parseBrewFormat then can't recognise. If the text
 * carries no literal tab but looks percent-encoded, decode it and keep the
 * result only when it actually recovers the tab-separated structure; a genuine
 * paste that merely happens to contain a "%" is left untouched.
 */
function decodePastedText(text) {
  const raw = text ?? "";
  if (raw.includes("\t") || !/%09|%0A/i.test(raw)) return raw;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.includes("\t") ? decoded : raw;
  } catch {
    return raw; // malformed % sequence — leave the original for the normal error
  }
}

/**
 * Parse the sub-deck table back into { commander, plan, targets, slots,
 * subDecks }. Slots are padded to SLOT_COUNT; each sub-deck's cards to
 * SLOT_COUNT. Throws when the text isn't in this format (import only accepts
 * the sub-deck format).
 */
export function parseBrewFormat(text) {
  const lines = decodePastedText(text).split(/\r?\n/);

  let commander = "";
  let plan = "";
  const targets = {};
  let headerIdx = -1;
  let subCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const cmdr = lines[i].match(/^\s*commander:\s*(.+?)\s*$/i);
    if (cmdr) {
      commander = cmdr[1];
      continue;
    }
    const planMatch = lines[i].match(/^\s*plan:\s*(.+?)\s*$/i);
    if (planMatch) {
      plan = planMatch[1];
      continue;
    }
    if (/^\s*targets:\t/i.test(lines[i])) {
      for (const pair of lines[i].split("\t").slice(1)) {
        const eq = pair.lastIndexOf("=");
        if (eq < 1) continue;
        const n = parseInt(pair.slice(eq + 1), 10);
        if (n > 0) targets[pair.slice(0, eq).trim()] = n;
      }
      continue;
    }
    const cells = lines[i].split("\t");
    if (
      cells.length >= 4 &&
      cells[0].trim() === "#" &&
      cells[1].trim().toLowerCase() === "tag" &&
      cells[2].trim().toLowerCase() === "note"
    ) {
      headerIdx = i;
      subCount = Math.min(SUB_DECK_NAMES.length, cells.length - 3);
      break;
    }
  }

  if (headerIdx === -1 || subCount < 1) {
    throw new Error(
      "That doesn't look like a Deck Brewer sub-deck export. Paste a list exported with the “Brewer sub-decks” format."
    );
  }

  const slots = [];
  const subDecks = Array.from({ length: subCount }, () => ({ cards: [] }));
  for (let i = headerIdx + 1; i < lines.length && slots.length < SLOT_COUNT; i++) {
    if (!lines[i].trim()) continue; // skip blank spacer lines
    const cells = lines[i].split("\t");
    slots.push({ tag: (cells[1] ?? "").trim(), note: (cells[2] ?? "").trim() });
    for (let s = 0; s < subCount; s++) {
      subDecks[s].cards.push((cells[3 + s] ?? "").trim());
    }
  }

  // Pad to a full 33-slot skeleton (slots and cards grow in lockstep above).
  while (slots.length < SLOT_COUNT) {
    slots.push({ tag: "", note: "" });
    for (const sd of subDecks) sd.cards.push("");
  }

  return { commander, plan, targets, slots, subDecks };
}
