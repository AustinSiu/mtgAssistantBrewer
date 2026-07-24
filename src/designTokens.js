/**
 * The JS-sourced half of the design-token layer.
 *
 * Most tokens (semantic colors, the radius/spacing scales) live as static CSS
 * custom properties in `App.css`. Two color palettes, though, already have a
 * canonical *JS* home and are consumed from JS via inline styles, so we derive
 * their CSS tokens from that same source instead of hand-copying the hexes —
 * that's how the CSS layer and the JS palettes are kept from drifting apart:
 *
 *   - MTG color identity  → `--mtg-color-w/u/b/r/g/c`, from `colors.js`
 *     `COLOR_HEX` (named `-color-` so they don't read as MTG *game* tokens).
 *   - Sub-deck A/B/C accents → `--subdeck-a/b/c`, defined here.
 *
 * `applyColorTokens()` writes them onto the document root at startup.
 */
import { WUBRGC, COLOR_HEX } from "./colors";

/**
 * Sub-deck A/B/C column accents (green / rust / violet). A deliberately
 * *different* semantic palette from MTG color identity in `colors.js` — the
 * rust `#c06a55` is a column role, not MTG red (`#c0564a`). Do not fold these
 * into the MTG color tokens. Mirrors `DeckBrewer`'s `ACCENTS`.
 */
export const SUBDECK_ACCENTS = ["#5a9e63", "#c06a55", "#8b7fd4"];

/**
 * The CSS custom properties derived from JS color sources, as
 * `{ "--var-name": "#hex" }`. Single source of truth for the wiring so it can
 * be asserted in tests without a DOM.
 */
export function colorTokens() {
  const tokens = {};
  for (const c of WUBRGC) tokens[`--mtg-color-${c.toLowerCase()}`] = COLOR_HEX[c];
  SUBDECK_ACCENTS.forEach((hex, i) => {
    tokens[`--subdeck-${String.fromCharCode(97 + i)}`] = hex;
  });
  return tokens;
}

/**
 * Write the JS-derived color tokens onto a root element (the document root by
 * default) as CSS custom properties. Called once at startup.
 */
export function applyColorTokens(root = document.documentElement) {
  for (const [name, value] of Object.entries(colorTokens())) {
    root.style.setProperty(name, value);
  }
}
