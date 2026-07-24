import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildSimilarQuery,
  cardImageUrl,
  cardPrimaryType,
  cardTokenParts,
  lookupCollection,
  lookupCardsByIds,
  resetScryfallRateLimit,
} from "./scryfall";
import { card } from "../test/fixtures";

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

describe("Scryfall rate limiting + retry (429 and CORS-blocked rejections)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    resetScryfallRateLimit();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("retries a visible 429 with backoff, then resolves", async () => {
    let calls = 0;
    fetch.mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? res(429, {}) // rate-limited once…
        : res(200, { data: [card("Sol Ring")], not_found: [] }); // …then OK
    });

    const result = await lookupCollection(["Sol Ring"]);
    expect(calls).toBe(2); // the 429 was retried, not surfaced to the caller
    expect(result.data).toHaveLength(1);
  });

  // The real browser symptom of issue #46: a rate-limited 429 is CORS-blocked,
  // so `fetch` *rejects* (TypeError "Load failed") — it never arrives as a 429
  // Response. This must be retried too. (This case FAILS against the first
  // version of the fix, which only retried `res.status === 429`.)
  it("retries a rejected fetch (a CORS-blocked 429), then resolves", async () => {
    let calls = 0;
    fetch.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Load failed");
      return res(200, { data: [card("Sol Ring")], not_found: [] });
    });

    const result = await lookupCollection(["Sol Ring"]);
    expect(calls).toBe(2);
    expect(result.data).toHaveLength(1);
  });

  it("gives up after the retry cap — visible 429 surfaces the failure", async () => {
    fetch.mockImplementation(async () => res(429, {}));
    // 1 initial try + MAX_RETRIES(3) = 4 attempts, then lookupCollection throws on !ok.
    await expect(lookupCardsByIds(["tok-1"])).rejects.toThrow(/HTTP 429/);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("gives up after the retry cap — persistent rejection is rethrown", async () => {
    fetch.mockImplementation(async () => {
      throw new TypeError("Load failed");
    });
    await expect(lookupCollection(["X"])).rejects.toThrow(/Load failed/);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

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

describe("cardTokenParts", () => {
  it("returns the token relations, deduped, ignoring non-tokens", () => {
    const c = card("Krenko", {
      all_parts: [
        { id: "k", component: "combo_piece", name: "Krenko" },
        { id: "t1", component: "token", name: "Goblin" },
        { id: "t1", component: "token", name: "Goblin" }, // dup
        { id: "t2", component: "token", name: "Treasure" },
      ],
    });
    expect(cardTokenParts(c)).toEqual([
      { id: "t1", name: "Goblin" },
      { id: "t2", name: "Treasure" },
    ]);
  });

  it("is empty for cards with no parts and tolerates null", () => {
    expect(cardTokenParts(card("Grizzly Bears"))).toEqual([]);
    expect(cardTokenParts(null)).toEqual([]);
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
