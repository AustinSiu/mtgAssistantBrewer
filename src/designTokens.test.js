import { describe, it, expect } from "vitest";
import { WUBRGC, COLOR_HEX } from "./colors";
import { SUBDECK_ACCENTS, colorTokens, applyColorTokens } from "./designTokens";

describe("colorTokens", () => {
  it("derives the MTG color tokens from colors.js so they can't drift", () => {
    const tokens = colorTokens();
    for (const c of WUBRGC) {
      expect(tokens[`--mtg-color-${c.toLowerCase()}`]).toBe(COLOR_HEX[c]);
    }
  });

  it("exposes the three sub-deck accents as --subdeck-a/b/c", () => {
    const tokens = colorTokens();
    expect(tokens["--subdeck-a"]).toBe(SUBDECK_ACCENTS[0]);
    expect(tokens["--subdeck-b"]).toBe(SUBDECK_ACCENTS[1]);
    expect(tokens["--subdeck-c"]).toBe(SUBDECK_ACCENTS[2]);
  });

  it("keeps sub-deck rust distinct from MTG red (different semantic roles)", () => {
    const tokens = colorTokens();
    expect(tokens["--subdeck-b"]).not.toBe(tokens["--mtg-color-r"]);
  });
});

describe("applyColorTokens", () => {
  it("writes every color token onto the given root element", () => {
    const root = document.createElement("div");
    applyColorTokens(root);
    for (const [name, value] of Object.entries(colorTokens())) {
      expect(root.style.getPropertyValue(name)).toBe(value);
    }
  });
});
