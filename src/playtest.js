/**
 * Pure game-state logic for the Playtest simulator.
 *
 * State shape:
 *   {
 *     cards: { instId: { id, name, card, tapped, pos? } },  // card may be null
 *     zones: { library, hand, battlefield, graveyard, exile, command },
 *     life, turn, mulligans
 *   }
 * `pos` ({x, y} pixel offsets) exists only while a card is on the battlefield,
 * where zone order doubles as z-order.
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

/** Quick-add token choices for the Add Token menu. */
export const TOKEN_PRESETS = [
  "Treasure",
  "Clue",
  "Food",
  "1/1 Soldier",
  "1/1 Spirit",
  "2/2 Zombie",
  "3/3 Beast",
];

/** Player-level counters (Moxfield's Counters dropdown). */
export const PLAYER_COUNTERS = ["Poison", "Energy", "Experience"];

// Card box (px) — one size across every zone; kept in sync with the
// --pt-cw / --pt-ch custom properties on .playtest in App.css.
export const CARD_W = 120;
export const CARD_H = 168;

/**
 * Auto-placement for cards that land on the battlefield without a drop point
 * (menu Play, Cast, tokens): a gentle diagonal cascade that wraps before it
 * runs off the field. Not collision-perfect — just tidy.
 */
function cascadePosition(index) {
  const v = 16 + ((index * 24) % 320);
  return { x: v, y: v };
}

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
    nextId: seq, // for tokens created mid-game
    playerCounters: Object.fromEntries(PLAYER_COUNTERS.map((k) => [k, 0])),
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
 * Move an instance to a new index within its current zone — used to reorder
 * the hand. `toIndex` is measured against the zone with the card removed, and
 * is clamped into range.
 */
export function reorderInZone(state, id, toIndex) {
  const zone = findZone(state, id);
  if (!zone) return state;
  const without = state.zones[zone].filter((x) => x !== id);
  const i = Math.max(0, Math.min(toIndex, without.length));
  const next = [...without.slice(0, i), id, ...without.slice(i)];
  return { ...state, zones: { ...state.zones, [zone]: next } };
}

/**
 * Reposition a battlefield card to pixel offset {x, y} and bump it to the top
 * of the z-order (end of the battlefield array). Does NOT untap — sliding a
 * card around the field is not a zone change.
 */
export function setPosition(state, id, { x, y }) {
  if (!state.zones.battlefield.includes(id)) return state;
  const battlefield = [
    ...state.zones.battlefield.filter((cid) => cid !== id),
    id,
  ];
  return {
    ...state,
    zones: { ...state.zones, battlefield },
    cards: { ...state.cards, [id]: { ...state.cards[id], pos: { x, y } } },
  };
}

/**
 * Reposition several battlefield cards at once (multi-select drag). `moves` is
 * [{ id, pos }]; the moved cards bump to the top of the z-order in their
 * existing relative order. Does not untap.
 */
export function setPositions(state, moves) {
  const moving = moves.filter((m) => state.zones.battlefield.includes(m.id));
  if (!moving.length) return state;
  const byId = new Map(moving.map((m) => [m.id, m.pos]));
  const cards = { ...state.cards };
  for (const [id, pos] of byId) cards[id] = { ...cards[id], pos };
  const rest = state.zones.battlefield.filter((id) => !byId.has(id));
  const bumped = state.zones.battlefield.filter((id) => byId.has(id));
  return { ...state, cards, zones: { ...state.zones, battlefield: [...rest, ...bumped] } };
}

/** Set the tapped state of many cards at once (multi-select tap). */
export function tapMany(state, ids, tapped) {
  const cards = { ...state.cards };
  for (const id of ids) {
    if (cards[id]) cards[id] = { ...cards[id], tapped };
  }
  return { ...state, cards };
}

/**
 * Battlefield card ids whose box intersects a marquee rectangle (both in the
 * battlefield canvas's pixel coordinates). `rect` may have negative width or
 * height (dragged up/left); the card box is CARD_W × CARD_H at each card's pos.
 */
export function cardsInMarquee(state, rect) {
  const x1 = Math.min(rect.x, rect.x + rect.w);
  const y1 = Math.min(rect.y, rect.y + rect.h);
  const x2 = Math.max(rect.x, rect.x + rect.w);
  const y2 = Math.max(rect.y, rect.y + rect.h);
  return state.zones.battlefield.filter((id) => {
    const pos = state.cards[id]?.pos;
    if (!pos) return false;
    return pos.x < x2 && pos.x + CARD_W > x1 && pos.y < y2 && pos.y + CARD_H > y1;
  });
}

/**
 * Create a token directly onto the battlefield (auto-placed like a play).
 * `card` is the token's Scryfall card when known, so it renders real art;
 * a custom token passes none and falls back to the text frame.
 */
export function addToken(state, name, card = null) {
  const id = `t${state.nextId}`;
  const pos = cascadePosition(state.zones.battlefield.length);
  return {
    ...state,
    nextId: state.nextId + 1,
    cards: {
      ...state.cards,
      [id]: { id, name, card, tapped: false, token: true, pos },
    },
    zones: { ...state.zones, battlefield: [...state.zones.battlefield, id] },
  };
}

/** Remove an instance from the game entirely (tokens cease to exist). */
export function removeInstance(state, id) {
  const zone = findZone(state, id);
  if (!zone) return state;
  const cards = { ...state.cards };
  delete cards[id];
  return {
    ...state,
    cards,
    zones: { ...state.zones, [zone]: state.zones[zone].filter((x) => x !== id) },
  };
}

/** Add/remove +1/+1-style counters on a card (never below zero). */
export function addCounter(state, id, delta) {
  const inst = state.cards[id];
  if (!inst) return state;
  const counters = Math.max(0, (inst.counters ?? 0) + delta);
  return { ...state, cards: { ...state.cards, [id]: { ...inst, counters } } };
}

/** Adjust a player counter (poison, energy, …) — never below zero. */
export function addPlayerCounter(state, kind, delta) {
  const next = Math.max(0, (state.playerCounters?.[kind] ?? 0) + delta);
  return {
    ...state,
    playerCounters: { ...state.playerCounters, [kind]: next },
  };
}

/**
 * Move a card instance to another zone. `position` is either "end" (default;
 * bottom of library) or "start" (top of library) — or, when `toZone` is
 * "battlefield", an `{x, y}` drop point. Cards untap and drop any stored
 * board position when they change zones; a card entering the battlefield gets
 * a position (the drop point, or an auto-cascade when none is given). A token
 * leaving the battlefield ceases to exist (state-based action).
 */
export function moveCard(state, id, toZone, position = "end") {
  const fromZone = findZone(state, id);
  if (!fromZone || !ZONES.includes(toZone)) return state;
  if (state.cards[id]?.token && toZone !== "battlefield") {
    return removeInstance(state, id);
  }
  const coords = position && typeof position === "object" ? position : null;
  const zones = {
    ...state.zones,
    [fromZone]: state.zones[fromZone].filter((x) => x !== id),
  };
  const target = zones[toZone].filter((x) => x !== id);
  zones[toZone] = position === "start" ? [id, ...target] : [...target, id];

  const inst = state.cards[id];
  let next;
  if (toZone === "battlefield") {
    const pos = coords ?? cascadePosition(zones.battlefield.length - 1);
    next = { ...inst, tapped: false, pos };
  } else {
    // Leaving the battlefield (or moving between other zones): untap and shed
    // any board position.
    next = { ...inst, tapped: false };
    delete next.pos;
  }
  return { ...state, zones, cards: { ...state.cards, [id]: next } };
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
