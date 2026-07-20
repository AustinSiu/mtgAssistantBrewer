import { describe, it, expect } from "vitest";
import { buildSimilarQuery, cardImageUrl, cardPrimaryType } from "./scryfall";
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

describe("cardImageUrl", () => {
  it("prefers normal, then falls back through the other sizes", () => {
    expect(cardImageUrl({ image_uris: { normal: "n", large: "l" } })).toBe("n");
    expect(cardImageUrl({ image_uris: { large: "l", small: "s" } })).toBe("l");
    expect(cardImageUrl({ image_uris: { png: "p" } })).toBe("p");
  });

  it("reads the front face of a double-faced card", () => {
    const dfc = { card_faces: [{ image_uris: { normal: "front" } }, {}] };
    expect(cardImageUrl(dfc)).toBe("front");
  });

  it("returns null when there is no image and tolerates null", () => {
    expect(cardImageUrl({ name: "x" })).toBeNull();
    expect(cardImageUrl(null)).toBeNull();
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

  it("searches lands by type rather than oracle tag", () => {
    const commander = card("Atraxa", { color_identity: ["W", "U", "B", "G"] });
    expect(buildSimilarQuery("land", 0, commander, "Land")).toBe(
      "t:land id<=WUBG order:edhrec"
    );
  });
});
