import { describe, it, expect } from "vitest";
import { brewStats } from "./brewStats";
import { card } from "../test/fixtures";

describe("brewStats", () => {
  it("counts mana symbols, production, curve, and average mana value", () => {
    const cards = [
      card("Sol Ring", { type_line: "Artifact", mana_cost: "{1}", cmc: 1, produced_mana: ["C"] }),
      card("Cultivate", { type_line: "Sorcery", mana_cost: "{2}{G}", cmc: 3 }),
      card("Forest", { type_line: "Basic Land — Forest", mana_cost: "", cmc: 0, produced_mana: ["G"] }),
      card("Hybrid", { type_line: "Instant", mana_cost: "{W/U}", cmc: 1 }),
    ];
    const s = brewStats(cards);

    // Pips: G from Cultivate, W+U from the hybrid; generic {1}/{2} count for none.
    expect(s.pips).toMatchObject({ G: 1, W: 1, U: 1, B: 0, R: 0, C: 0 });
    expect(s.totalColorPips).toBe(3);

    // Production comes from produced_mana.
    expect(s.production.C).toBe(1);
    expect(s.production.G).toBe(1);

    // Curve excludes the land; three non-land cards at MV 1, 3, 1.
    expect(s.nonLand).toBe(3);
    expect(s.curve[1]).toBe(2);
    expect(s.curve[3]).toBe(1);
    expect(s.avgMv).toBeCloseTo((1 + 3 + 1) / 3);
  });

  it("ignores nulls and tolerates an empty deck", () => {
    const s = brewStats([null, null]);
    expect(s.totalColorPips).toBe(0);
    expect(s.nonLand).toBe(0);
    expect(s.avgMv).toBe(0);
  });
});
