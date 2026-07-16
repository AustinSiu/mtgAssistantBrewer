import { describe, it, expect } from "vitest";
import { buildSimilarQuery, cardPrimaryType } from "./scryfall";
import { card } from "../test/fixtures";

describe("cardPrimaryType", () => {
  it("picks the primary type by detection priority", () => {
    expect(cardPrimaryType(card("Cultivate", { type_line: "Sorcery" }))).toBe(
      "Sorcery"
    );
    expect(cardPrimaryType(card("Sol Ring", { type_line: "Artifact" }))).toBe(
      "Artifact"
    );
    // An Artifact Creature classifies as a Creature.
    expect(
      cardPrimaryType(card("Solemn", { type_line: "Artifact Creature — Golem" }))
    ).toBe("Creature");
  });

  it("returns Other for an unrecognised type line", () => {
    expect(cardPrimaryType(card("Weird", { type_line: "Dungeon" }))).toBe("Other");
  });
});

describe("buildSimilarQuery", () => {
  it("filters by tag, mana value, primary type, and color identity", () => {
    const commander = card("Atraxa", { color_identity: ["W", "U", "B", "G"] });
    expect(buildSimilarQuery("ramp", 3, commander, "Sorcery")).toBe(
      "otag:ramp mv:3 t:sorcery id<=WUBG order:edhrec"
    );
  });

  it("omits the type filter when the type is unknown", () => {
    expect(buildSimilarQuery("ramp", 3, null, "Other")).toBe(
      "otag:ramp mv:3 order:edhrec"
    );
    expect(buildSimilarQuery("ramp", 3, null)).toBe("otag:ramp mv:3 order:edhrec");
  });

  it("restricts a colorless commander to id<=c", () => {
    const commander = card("Kozilek", { color_identity: [] });
    expect(buildSimilarQuery("ramp", 2, commander, "Artifact")).toBe(
      "otag:ramp mv:2 t:artifact id<=c order:edhrec"
    );
  });
});
