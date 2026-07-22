/**
 * Deck Brewer geometry — the single source of truth for the matrix's shape, so
 * the workspace, the export/import format, and their tests can't disagree.
 *
 *   - `CARD_COUNT`     slots per sub-deck (the "33" in "33 A")
 *   - `MAX_SUB_DECKS`  how many sub-decks a brew can hold
 *   - `SUB_DECK_NAMES` their display labels, in order
 */
export const CARD_COUNT = 33;
export const MAX_SUB_DECKS = 3;
export const SUB_DECK_NAMES = ["33 A", "33 B", "33 C"];
