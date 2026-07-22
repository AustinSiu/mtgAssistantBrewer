/**
 * Deck Brewer's own export/import format: a tab-separated table that lays the
 * 1–3 sub-decks out side by side so their composition is clear, and carries
 * enough (commander + per-slot tag/note + each sub-deck's card) to reload the
 * whole brew later.
 *
 *   Commander: Atraxa, Praetors' Voice
 *   #	Tag	Note	33 A	33 B	33 C
 *   1	Ramp	early accel	Sol Ring	Arcane Signet	Mind Stone
 *   2	Removal		Swords to Plowshares	Path to Exile
 *   …33 rows
 */

export const SUB_DECK_NAMES = ["33 A", "33 B", "33 C"];
export const SLOT_COUNT = 33;

const cell = (s) => (s ?? "").replace(/\t/g, " ").trim();

/**
 * Render the brew as the tab-separated sub-deck table. `subDecks` should be
 * pre-filtered to the sub-decks to include (1–3); `subDeckNames` labels them.
 */
export function toBrewFormat({ commander, slots, subDecks, subDeckNames = SUB_DECK_NAMES }) {
  const names = subDeckNames.slice(0, subDecks.length);
  const lines = [];
  const cmdr = (commander ?? "").trim();
  if (cmdr) lines.push(`Commander: ${cmdr}`);
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
 * Parse the sub-deck table back into { commander, slots, subDecks }. Slots are
 * padded to SLOT_COUNT; each sub-deck's cards to SLOT_COUNT. Throws when the
 * text isn't in this format (import only accepts the sub-deck format).
 */
export function parseBrewFormat(text) {
  const lines = (text ?? "").split(/\r?\n/);

  let commander = "";
  let headerIdx = -1;
  let subCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const cmdr = lines[i].match(/^\s*commander:\s*(.+?)\s*$/i);
    if (cmdr && headerIdx === -1) {
      commander = cmdr[1];
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

  // Pad to a full 33-slot skeleton.
  while (slots.length < SLOT_COUNT) {
    slots.push({ tag: "", note: "" });
    for (const sd of subDecks) sd.cards.push("");
  }
  for (const sd of subDecks) {
    sd.cards = sd.cards.slice(0, SLOT_COUNT);
    while (sd.cards.length < SLOT_COUNT) sd.cards.push("");
    sd.flags = Array(SLOT_COUNT).fill(null);
  }

  return { commander, slots, subDecks };
}
