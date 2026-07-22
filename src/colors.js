/**
 * Canonical MTG color tokens, shared by every panel that renders colors so the
 * order, palette, and names can't drift apart.
 *
 *   - `WUBRGC`     the color order (W, U, B, R, G, then colorless)
 *   - `COLOR_HEX`  swatch/bar/pip fill per color (design tokens)
 *   - `COLOR_NAME` full display name per color
 */
export const WUBRGC = ["W", "U", "B", "R", "G", "C"];

export const COLOR_HEX = {
  W: "#f7f0d8",
  U: "#4a7fd0",
  B: "#3a3a3a",
  R: "#c0564a",
  G: "#5a9e63",
  C: "#9a9a9a",
};

export const COLOR_NAME = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};
