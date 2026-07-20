/**
 * Pure game-state logic for the Playtest simulator.
 *
 * State shape:
 *   {
 *     cards: { instId: { id, name, card, tapped } },   // card may be null
 *     zones: { library, hand, battlefield, graveyard, exile, command },
 *     life, turn, mulligans
 *   }
 * Zones are arrays of instance ids; every function returns a new state.
 * Randomness is injected (rng) so tests can be deterministic.
 */

export const STARTING_LIFE = 40; // Commander
export const OPENING_HAND = 7;

export const ZONES = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
];

function fisherYates(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Start a game: shuffle the deck into the library, put the commander in the
 * command zone, and draw the opening hand.
 *
 * deck: [{ name, card }] (one entry per physical card; card may be null)
 * commander: { name, card } | null
 */
export function newGame({ deck, commander = null, rng = Math.random }) {
  const cards = {};
  let seq = 0;
  const add = ({ name, card = null }) => {
    const id = `c${seq++}`;
    cards[id] = { id, name, card, tapped: false };
    return id;
  };

  const library = fisherYates(deck.map(add), rng);
  const command = commander ? [add(commander)] : [];

  const state = {
    cards,
    zones: { library, hand: [], battlefield: [], graveyard: [], exile: [], command },
    life: STARTING_LIFE,
    turn: 1,
    mulligans: 0,
  };
  return draw(state, OPENING_HAND);
}

/** Draw up to n cards from the top of the library into hand. */
export function draw(state, n = 1) {
  const take = state.zones.library.slice(0, n);
  if (!take.length) return state;
  return {
    ...state,
    zones: {
      ...state.zones,
      library: state.zones.library.slice(take.length),
      hand: [...state.zones.hand, ...take],
    },
  };
}

export function shuffleLibrary(state, rng = Math.random) {
  return {
    ...state,
    zones: { ...state.zones, library: fisherYates(state.zones.library, rng) },
  };
}

/**
 * Mulligan, Commander style: the hand shuffles back and the first mulligan
 * redraws a full 7; each one after draws one fewer.
 */
export function mulligan(state, rng = Math.random) {
  const mulligans = state.mulligans + 1;
  const size = Math.max(
    0,
    mulligans <= 1 ? OPENING_HAND : OPENING_HAND + 1 - mulligans
  );
  const library = fisherYates(
    [...state.zones.library, ...state.zones.hand],
    rng
  );
  return draw(
    { ...state, mulligans, zones: { ...state.zones, library, hand: [] } },
    size
  );
}

/** The zone an instance currently sits in. */
export function findZone(state, id) {
  return ZONES.find((z) => state.zones[z].includes(id));
}

/**
 * Move a card instance to another zone. position: "end" (default; bottom of
 * library) or "start" (top of library). Cards untap when they change zones.
 */
export function moveCard(state, id, toZone, position = "end") {
  const fromZone = findZone(state, id);
  if (!fromZone || !ZONES.includes(toZone)) return state;
  const zones = {
    ...state.zones,
    [fromZone]: state.zones[fromZone].filter((x) => x !== id),
  };
  const target = zones[toZone].filter((x) => x !== id);
  zones[toZone] = position === "start" ? [id, ...target] : [...target, id];
  const cards = state.cards[id]?.tapped
    ? { ...state.cards, [id]: { ...state.cards[id], tapped: false } }
    : state.cards;
  return { ...state, zones, cards };
}

export function toggleTap(state, id) {
  const inst = state.cards[id];
  if (!inst) return state;
  return {
    ...state,
    cards: { ...state.cards, [id]: { ...inst, tapped: !inst.tapped } },
  };
}

/** Advance the turn: untap everything on the battlefield, then draw one. */
export function nextTurn(state) {
  const cards = { ...state.cards };
  for (const id of state.zones.battlefield) {
    cards[id] = { ...cards[id], tapped: false };
  }
  return draw({ ...state, cards, turn: state.turn + 1 }, 1);
}

export function addLife(state, delta) {
  return { ...state, life: state.life + delta };
}
