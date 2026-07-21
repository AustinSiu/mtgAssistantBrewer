import { describe, it, expect } from "vitest";
import {
  newGame,
  draw,
  shuffleLibrary,
  mulligan,
  moveCard,
  setPosition,
  reorderInZone,
  toggleTap,
  nextTurn,
  addLife,
  addToken,
  removeInstance,
  addCounter,
  addPlayerCounter,
  findZone,
  STARTING_LIFE,
  OPENING_HAND,
} from "./playtest";

// rng ≈ 1 makes Fisher-Yates the identity permutation → deterministic tests.
const noShuffle = () => 0.9999999;

const deckOf = (n) =>
  Array.from({ length: n }, (_, i) => ({ name: `Card ${i + 1}`, card: null }));

const start = (n = 10, commander = { name: "Atraxa", card: null }) =>
  newGame({ deck: deckOf(n), commander, rng: noShuffle });

describe("newGame", () => {
  it("shuffles up, puts the commander in the command zone, and draws 7", () => {
    const g = start(10);
    expect(g.zones.hand).toHaveLength(OPENING_HAND);
    expect(g.zones.library).toHaveLength(3);
    expect(g.zones.command).toHaveLength(1);
    expect(g.cards[g.zones.command[0]].name).toBe("Atraxa");
    expect(g.life).toBe(STARTING_LIFE);
    expect(g.turn).toBe(1);
  });

  it("supports no commander and decks smaller than a hand", () => {
    const g = newGame({ deck: deckOf(3), rng: noShuffle });
    expect(g.zones.command).toHaveLength(0);
    expect(g.zones.hand).toHaveLength(3);
    expect(g.zones.library).toHaveLength(0);
  });
});

describe("draw", () => {
  it("moves the top of the library to hand, capped at library size", () => {
    let g = start(10);
    const top = g.zones.library[0];
    g = draw(g);
    expect(g.zones.hand).toContain(top);
    expect(g.zones.library).toHaveLength(2);
    g = draw(g, 99);
    expect(g.zones.library).toHaveLength(0);
    expect(g.zones.hand).toHaveLength(10);
  });
});

describe("mulligan", () => {
  it("first mulligan is free (7 again); later ones draw one fewer", () => {
    let g = start(20);
    g = mulligan(g, noShuffle);
    expect(g.mulligans).toBe(1);
    expect(g.zones.hand).toHaveLength(7);
    g = mulligan(g, noShuffle);
    expect(g.zones.hand).toHaveLength(6);
    g = mulligan(g, noShuffle);
    expect(g.zones.hand).toHaveLength(5);
    // Nothing is lost: hand + library always total the deck.
    expect(g.zones.hand.length + g.zones.library.length).toBe(20);
  });
});

describe("moveCard", () => {
  it("moves between zones and untaps on the way out", () => {
    let g = start(10);
    const id = g.zones.hand[0];
    g = moveCard(g, id, "battlefield");
    expect(findZone(g, id)).toBe("battlefield");
    g = toggleTap(g, id);
    expect(g.cards[id].tapped).toBe(true);
    g = moveCard(g, id, "graveyard");
    expect(findZone(g, id)).toBe("graveyard");
    expect(g.cards[id].tapped).toBe(false);
  });

  it('position "start" puts a card on top of the library', () => {
    let g = start(10);
    const id = g.zones.hand[0];
    g = moveCard(g, id, "library", "start");
    expect(g.zones.library[0]).toBe(id);
    // and "end" on the bottom
    const id2 = g.zones.hand[0];
    g = moveCard(g, id2, "library", "end");
    expect(g.zones.library[g.zones.library.length - 1]).toBe(id2);
  });

  it("a commander can be cast and sent back to the command zone", () => {
    let g = start(10);
    const cmdr = g.zones.command[0];
    g = moveCard(g, cmdr, "battlefield");
    expect(findZone(g, cmdr)).toBe("battlefield");
    g = moveCard(g, cmdr, "command");
    expect(findZone(g, cmdr)).toBe("command");
  });

  it("stores a drop point when given {x, y}, else auto-cascades", () => {
    let g = start(10);
    const id = g.zones.hand[0];
    g = moveCard(g, id, "battlefield", { x: 140, y: 60 });
    expect(g.cards[id].pos).toEqual({ x: 140, y: 60 });

    // No coords → a cascade position is assigned automatically.
    const id2 = g.zones.hand[0];
    g = moveCard(g, id2, "battlefield");
    expect(g.cards[id2].pos).toEqual({ x: expect.any(Number), y: expect.any(Number) });
  });

  it("drops the board position when a card leaves the battlefield", () => {
    let g = start(10);
    const id = g.zones.hand[0];
    g = moveCard(g, id, "battlefield", { x: 100, y: 100 });
    expect(g.cards[id].pos).toBeDefined();
    g = moveCard(g, id, "hand");
    expect(g.cards[id].pos).toBeUndefined();
  });
});

describe("setPosition", () => {
  it("moves a card's pos, bumps z-order, and keeps it tapped", () => {
    let g = start(10);
    const a = g.zones.hand[0];
    g = moveCard(g, a, "battlefield");
    const b = g.zones.hand[0];
    g = moveCard(g, b, "battlefield");
    // a sits under b initially (older z-order).
    expect(g.zones.battlefield).toEqual([a, b]);

    g = toggleTap(g, a);
    g = setPosition(g, a, { x: 200, y: 80 });
    expect(g.cards[a].pos).toEqual({ x: 200, y: 80 });
    expect(g.cards[a].tapped).toBe(true); // repositioning never untaps
    expect(g.zones.battlefield).toEqual([b, a]); // a bumped to the top
  });

  it("ignores cards that aren't on the battlefield", () => {
    let g = start(10);
    const id = g.zones.hand[0];
    const before = g;
    g = setPosition(g, id, { x: 10, y: 10 });
    expect(g).toBe(before);
  });
});

describe("reorderInZone", () => {
  it("moves a hand card to a new index (clamped), among the others", () => {
    let g = start(10);
    const hand = [...g.zones.hand];
    const moved = hand[0];
    g = reorderInZone(g, moved, 6);
    expect(g.zones.hand).toEqual([...hand.slice(1), moved]);

    g = reorderInZone(g, moved, 99);
    expect(g.zones.hand[g.zones.hand.length - 1]).toBe(moved);
    g = reorderInZone(g, moved, -5);
    expect(g.zones.hand[0]).toBe(moved);
    expect([...g.zones.hand].sort()).toEqual([...hand].sort());
  });

  it("inserts before the card currently at the target index", () => {
    let g = start(10);
    const [a, b, c] = g.zones.hand;
    g = reorderInZone(g, c, 1);
    expect(g.zones.hand.slice(0, 3)).toEqual([a, c, b]);
  });
});

describe("nextTurn", () => {
  it("advances the turn, untaps the battlefield, and draws a card", () => {
    let g = start(10);
    const id = g.zones.hand[0];
    g = moveCard(g, id, "battlefield");
    g = toggleTap(g, id);
    const handBefore = g.zones.hand.length;
    g = nextTurn(g);
    expect(g.turn).toBe(2);
    expect(g.cards[id].tapped).toBe(false);
    expect(g.zones.hand).toHaveLength(handBefore + 1);
  });
});

describe("shuffleLibrary / addLife", () => {
  it("shuffle keeps the same cards; life adjusts by delta", () => {
    let g = start(10);
    const before = [...g.zones.library].sort();
    g = shuffleLibrary(g, noShuffle);
    expect([...g.zones.library].sort()).toEqual(before);
    g = addLife(g, -3);
    expect(g.life).toBe(STARTING_LIFE - 3);
  });
});

describe("tokens", () => {
  it("creates a token on the battlefield", () => {
    let g = start(10);
    g = addToken(g, "Treasure");
    expect(g.zones.battlefield).toHaveLength(1);
    const id = g.zones.battlefield[0];
    expect(g.cards[id]).toMatchObject({ name: "Treasure", token: true });
  });

  it("a token leaving the battlefield ceases to exist", () => {
    let g = start(10);
    g = addToken(g, "Clue");
    const id = g.zones.battlefield[0];
    g = moveCard(g, id, "graveyard");
    expect(g.cards[id]).toBeUndefined();
    expect(g.zones.graveyard).toHaveLength(0);
    expect(g.zones.battlefield).toHaveLength(0);
  });

  it("removeInstance deletes a token outright", () => {
    let g = start(10);
    g = addToken(g, "Food");
    const id = g.zones.battlefield[0];
    g = removeInstance(g, id);
    expect(g.cards[id]).toBeUndefined();
    expect(g.zones.battlefield).toHaveLength(0);
  });
});

describe("counters", () => {
  it("card counters accumulate and never go below zero", () => {
    let g = start(10);
    const id = g.zones.hand[0];
    g = moveCard(g, id, "battlefield");
    g = addCounter(g, id, 1);
    g = addCounter(g, id, 1);
    expect(g.cards[id].counters).toBe(2);
    g = addCounter(g, id, -5);
    expect(g.cards[id].counters).toBe(0);
  });

  it("player counters adjust per kind and floor at zero", () => {
    let g = start(10);
    g = addPlayerCounter(g, "Poison", 1);
    g = addPlayerCounter(g, "Poison", 1);
    g = addPlayerCounter(g, "Energy", 3);
    expect(g.playerCounters.Poison).toBe(2);
    expect(g.playerCounters.Energy).toBe(3);
    g = addPlayerCounter(g, "Poison", -9);
    expect(g.playerCounters.Poison).toBe(0);
  });
});
