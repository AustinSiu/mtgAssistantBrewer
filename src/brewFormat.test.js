import { describe, it, expect } from "vitest";
import { toBrewFormat, parseBrewFormat } from "./brewFormat";
import { CARD_COUNT as SLOT_COUNT } from "./deckShape";

const slot = (tag = "", note = "") => ({ tag, note });
const sub = (cards) => ({
  cards: Array.from({ length: SLOT_COUNT }, (_, i) => cards[i] ?? ""),
});

describe("toBrewFormat", () => {
  it("lays the sub-decks out side by side with commander and headers", () => {
    const slots = [slot("Ramp", "early accel"), slot("Removal")];
    while (slots.length < SLOT_COUNT) slots.push(slot());
    const subDecks = [
      sub(["Sol Ring", "Swords to Plowshares"]),
      sub(["Arcane Signet", "Path to Exile"]),
    ];
    const text = toBrewFormat({
      commander: "Atraxa, Praetors' Voice",
      slots,
      subDecks,
      subDeckNames: ["33 A", "33 B"],
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Commander: Atraxa, Praetors' Voice");
    expect(lines[1]).toBe("#\tTag\tNote\t33 A\t33 B");
    expect(lines[2]).toBe("1\tRamp\tearly accel\tSol Ring\tArcane Signet");
    expect(lines[3]).toBe("2\tRemoval\t\tSwords to Plowshares\tPath to Exile");
    expect(lines).toHaveLength(2 + SLOT_COUNT); // commander + header + 33 rows
  });

  it("omits the commander line when there is none", () => {
    const slots = Array.from({ length: SLOT_COUNT }, () => slot());
    const text = toBrewFormat({ commander: "", slots, subDecks: [sub([])] });
    expect(text.split("\n")[0]).toBe("#\tTag\tNote\t33 A");
  });

  it("emits the plan (one line) and role-target lines when present", () => {
    const slots = Array.from({ length: SLOT_COUNT }, () => slot());
    const text = toBrewFormat({
      commander: "Krenko",
      plan: "Go wide with\ngoblins, then fling.",
      targets: { Ramp: 4, Removal: 3, Skip: 0 },
      slots,
      subDecks: [sub([])],
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Commander: Krenko");
    expect(lines[1]).toBe("Plan: Go wide with goblins, then fling."); // newline collapsed
    expect(lines[2]).toBe("Targets:\tRamp=4\tRemoval=3"); // zero target dropped
    expect(lines[3]).toBe("#\tTag\tNote\t33 A");
  });
});

describe("parseBrewFormat", () => {
  it("round-trips commander, slots, and sub-decks", () => {
    const slots = [slot("Ramp", "early accel"), slot("Removal", "spot")];
    while (slots.length < SLOT_COUNT) slots.push(slot());
    const subDecks = [
      sub(["Sol Ring", "Swords to Plowshares"]),
      sub(["Arcane Signet", "Path to Exile"]),
      sub(["Mind Stone", "Beast Within"]),
    ];
    const text = toBrewFormat({ commander: "Atraxa, Praetors' Voice", slots, subDecks });
    const parsed = parseBrewFormat(text);

    expect(parsed.commander).toBe("Atraxa, Praetors' Voice");
    expect(parsed.slots).toHaveLength(SLOT_COUNT);
    expect(parsed.slots[0]).toEqual({ tag: "Ramp", note: "early accel" });
    expect(parsed.slots[1]).toEqual({ tag: "Removal", note: "spot" });
    expect(parsed.subDecks).toHaveLength(3);
    expect(parsed.subDecks[0].cards.slice(0, 2)).toEqual(["Sol Ring", "Swords to Plowshares"]);
    expect(parsed.subDecks[2].cards.slice(0, 2)).toEqual(["Mind Stone", "Beast Within"]);
    parsed.subDecks.forEach((sd) => {
      expect(sd.cards).toHaveLength(SLOT_COUNT);
      expect(sd.flags).toHaveLength(SLOT_COUNT);
    });
  });

  it("round-trips the plan and role targets", () => {
    const slots = Array.from({ length: SLOT_COUNT }, () => slot());
    const text = toBrewFormat({
      commander: "Krenko",
      plan: "Go wide, then fling.",
      targets: { Ramp: 4, "Card Draw": 3 },
      slots,
      subDecks: [sub([])],
    });
    const parsed = parseBrewFormat(text);
    expect(parsed.plan).toBe("Go wide, then fling.");
    expect(parsed.targets).toEqual({ Ramp: 4, "Card Draw": 3 });
  });

  it("defaults plan and targets when absent", () => {
    const parsed = parseBrewFormat(
      ["Commander: Krenko", "#\tTag\tNote\t33 A", "1\tRamp\t\tSol Ring"].join("\n")
    );
    expect(parsed.plan).toBe("");
    expect(parsed.targets).toEqual({});
  });

  it("accepts a single sub-deck", () => {
    const parsed = parseBrewFormat(
      ["Commander: Krenko", "#\tTag\tNote\t33 A", "1\tRamp\t\tSol Ring"].join("\n")
    );
    expect(parsed.commander).toBe("Krenko");
    expect(parsed.subDecks).toHaveLength(1);
    expect(parsed.subDecks[0].cards[0]).toBe("Sol Ring");
    expect(parsed.slots).toHaveLength(SLOT_COUNT);
  });

  it("rejects text that isn't the sub-deck format", () => {
    expect(() => parseBrewFormat("1 Sol Ring\n2 Forest")).toThrow(/Deck Brewer/);
    expect(() => parseBrewFormat("")).toThrow();
  });
});
