import { describe, it, expect } from "vitest";
import { parseDecklist, groupEntries, deckStats, isBasicLand } from "./decklist";
import { card } from "../test/fixtures";

describe("parseDecklist", () => {
  it("parses quantities and names in common formats", () => {
    const out = parseDecklist(
      ["1 Sol Ring", "2x Llanowar Elves", "Cultivate"].join("\n")
    );
    expect(out).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Llanowar Elves", qty: 2 },
      { name: "Cultivate", qty: 1 },
    ]);
  });

  it("strips set/collector suffixes and skips headers/blank lines", () => {
    const out = parseDecklist(
      ["// Commander", "", "1 Sol Ring (C21) 263", "Creatures (35)"].join("\n")
    );
    expect(out).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("merges duplicate names by summing quantities", () => {
    const out = parseDecklist(["1 Forest", "3 Forest"].join("\n"));
    expect(out).toEqual([{ name: "Forest", qty: 4 }]);
  });
});

describe("isBasicLand", () => {
  it("recognises basics and snow basics, rejects others", () => {
    expect(isBasicLand("Forest")).toBe(true);
    expect(isBasicLand("snow-covered island")).toBe(true);
    expect(isBasicLand("Sol Ring")).toBe(false);
  });
});

const entry = (name, overrides, extra = {}) => ({
  id: name,
  name,
  qty: 1,
  tag: "",
  commander: false,
  card: card(name, overrides),
  ...extra,
});

describe("groupEntries", () => {
  it("groups by card type in canonical order, commander first", () => {
    const entries = [
      entry("Sol Ring", { type_line: "Artifact", cmc: 1 }),
      entry("Llanowar Elves", { type_line: "Creature — Elf Druid", cmc: 1 }),
      entry("Forest", { type_line: "Basic Land — Forest", cmc: 0 }),
      { ...entry("Atraxa", { type_line: "Legendary Creature — Angel" }), commander: true },
    ];
    const groups = groupEntries(entries, "type");
    expect(groups.map((g) => g.label)).toEqual([
      "Commander",
      "Creatures",
      "Artifacts",
      "Lands",
    ]);
  });

  it("groups by tag with Untagged last, and puts unresolved cards in their own group", () => {
    const entries = [
      entry("Sol Ring", { type_line: "Artifact" }, { tag: "Mana Rock" }),
      entry("Wastes", { type_line: "Basic Land" }),
      { ...entry("Fake", {}), card: null },
    ];
    const groups = groupEntries(entries, "tag");
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Mana Rock");
    expect(labels).toContain("Untagged");
    expect(labels[labels.length - 1]).toBe("Unresolved");
  });

  it("counts and prices reflect quantities", () => {
    const entries = [
      { ...entry("Sol Ring", { type_line: "Artifact", prices: { usd: "2.00" } }), qty: 3 },
    ];
    const [group] = groupEntries(entries, "type");
    expect(group.count).toBe(3);
    expect(group.price).toBeCloseTo(6.0);
  });
});

describe("deckStats", () => {
  it("totals count and price, tallies colors, and builds a non-land curve", () => {
    const entries = [
      { ...entry("Sol Ring", { type_line: "Artifact", cmc: 1, color_identity: [], prices: { usd: "2.00" } }), qty: 1 },
      { ...entry("Counterspell", { type_line: "Instant", cmc: 2, color_identity: ["U"], prices: { usd: "1.00" } }), qty: 1 },
      { ...entry("Island", { type_line: "Basic Land — Island", cmc: 0, color_identity: ["U"], prices: { usd: "0.10" } }), qty: 5 },
    ];
    const s = deckStats(entries);
    expect(s.total).toBe(7);
    expect(s.price).toBeCloseTo(3.5); // 2 + 1 + 5*0.10
    expect(s.colors.U).toBe(6); // Counterspell + 5 Islands
    expect(s.colors.C).toBe(1); // Sol Ring colorless
    // curve excludes the 5 lands; Sol Ring at 1, Counterspell at 2
    expect(s.curve[1]).toBe(1);
    expect(s.curve[2]).toBe(1);
    expect(s.curve[0]).toBe(0);
  });

  it("buckets mana value 7 and above into the 7+ slot", () => {
    const entries = [
      entry("Emrakul", { type_line: "Creature", cmc: 15, color_identity: [] }),
    ];
    const s = deckStats(entries);
    expect(s.curve[7]).toBe(1);
  });
});
