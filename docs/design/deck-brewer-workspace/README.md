# Handoff: MTG Deck Brewer Workspace

## Overview
An assistant for **Magic: The Gathering Commander** players building or improving a 99-card deck. The player picks a commander (which sets color identity / legal cards), then fills three parallel **33-card sub-decks (A / B / C)** against a shared set of **function tags** (Ramp, Removal, Card Draw…). Because every sub-deck shares the same tag rows, the three columns stay consistent in *purpose* and *mana value (MV) curve*. A live rail flags duplicates, not-found cards, and review items, and shows fill progress + the MV curve. Card suggestions are driven by the 33 A "main" column, matched by the tag's Scryfall otag.

End state: 3 × 33 = 99 cards + 1 commander = 100.

## About the Design Files
The file in this bundle (`deck-brewer-workspace.dc.html`) is a **design reference created in HTML** — a working prototype showing the intended look and behavior. It is **not production code to copy directly**. It's authored in a proprietary "Design Component" (`.dc.html`) format that needs a bespoke runtime to render, so it will not open standalone in a browser.

Your task: **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, etc.) using its established patterns, component library, and data layer. If no environment exists yet, choose the most appropriate framework and implement there. The `.dc.html` is readable as plain text — the markup and a `class Component` logic block document all layout, state, and behavior; use it as the spec.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions. Recreate the UI pixel-perfectly using the codebase's libraries. The card catalog, commander list, and otag mapping in the prototype are **sample/stub data** — wire these to the real Scryfall API in production (see Data below).

## Screens / Views

### 1. Commander Picker (entry)
- **Purpose**: Choose the commander; sets color identity and gates legal cards.
- **Layout**: Centered single column, `max-width: 520px`, offset `~6vh` from top. Vertical stack.
- **Components**:
  - Brand lockup: 34×34px rounded square (radius 8px) with gradient `linear-gradient(135deg,#5a9e63,#8b7fd4)`, ⚔ glyph, beside "Deck Brewer" (22px, weight 700).
  - Intro paragraph: `#888`, 0.95rem.
  - Label "Commander *" (weight 600, 0.9rem; asterisk `#ff8a8a`).
  - Autocomplete text input: full width, padding 0.6rem 0.7rem, radius 8px, border `1px solid #555`, bg `#1a1a1a`, 1rem. Placeholder `#666`.
  - Dropdown list (shown while typing, when partial match): absolute, bg `#1a1a1a`, border `1px solid #555`, radius 8px, shadow `0 8px 22px rgba(0,0,0,0.5)`. First item highlighted bg `#2a2a4a`. Each item padding 0.4rem 0.5rem, radius 5px, 0.9rem, cursor pointer.
  - Primary button "Look Up Cards →": margin-top 18px, padding 0.6rem 1.3rem, radius 8px, bg `#646cff`, border `1px solid #646cff`, white, weight 600, 0.95rem. Disabled when input empty: `opacity:0.45; cursor:not-allowed`.

### 2. Workspace (main — the "1a" matrix-centric layout)
- **Purpose**: Build/edit the three sub-decks against shared tag rows; get suggestions; monitor consistency.
- **Layout**: Centered card, `width:1180px` (max-width 100%), bg `#242424`, border `1px solid #333`, radius 14px, `overflow:hidden`, shadow `0 20px 60px rgba(0,0,0,0.45)`. Three regions stacked/side-by-side:
  1. **Header bar** (full width, `padding:16px 20px`, bottom border `1px solid #2c2c2c`): flex space-between.
  2. **Body**: flex row → matrix (`flex:1`) + consistency rail (`width:280px`, fixed).

- **Header components**:
  - Left: 38×38 gradient tile (⚔) + commander name (17px/700) + subline `#888` 12px "Commander · color identity" with 4 color-identity pips (14px circles: `#f7f0d8` W, `#4a7fd0` U, `#3a3a3a` B, `#5a9e63` G).
  - Right: cards-placed counter — big number (22px/700, `font-variant-numeric:tabular-nums`) `62 / 99` (the "/ 99" is `#666` 15px), label "CARDS PLACED" (11px, uppercase, `#888`, letter-spacing 0.06em). Then secondary button "Change commander" (padding 0.5rem 1.1rem, radius 6px, border `1px solid #555`, bg `#1a1a1a`).

- **Matrix table** (`border-collapse:collapse; width:100%; font-size:0.86rem; font-variant-numeric:tabular-nums`):
  - Caption line above: `#aaa` 13px, "Composition matrix" + `#666` hint.
  - **Columns**: `#` (28px, centered, `#666`) · **Tag** (~15%) · **Note** (~15%) · then one column per sub-deck (A, B, C).
  - **Header cells** (`th`): font 0.68rem, uppercase, letter-spacing 0.05em, `#aaa`, `text-align:left`.
    - `#`, Tag ("Tag · function"), Note ("Note · intent"): bottom border `2px solid #444`.
    - Each sub-deck header: bottom border `3px solid <accent>` where accents are **A `#5a9e63`, B `#c06a55`, C `#8b7fd4`** (further: D `#d49a3d`, E `#4a9ecc`, F `#c05fa0` — unused, capped at 3). Label "33 A" + sub "main" for the first only + an "active" pill (bg `#646cff`, white, radius 999px, 0.6rem) on the active column.
  - **All `td` cells: `vertical-align:top`** (critical — prevents input drift when a cell grows).
  - **Row-number cell**: centered, `#666`, 0.78rem, tabular-nums.
  - **Tag cell**: custom-styled `<select>` — width 100%, padding `0.35rem 1.6rem 0.35rem 0.5rem`, radius 6px, border `1px solid #444`, bg `#1a1a1a`, 0.84rem, weight 600, `appearance:none`. Custom chevron via inline SVG background (`right 0.6rem center`, no-repeat). Below it: `#666` 0.72rem "otag:<tag>".
  - **Note cell**: `<textarea rows="1">` — width 100%, padding 0.35rem 0.5rem, radius 6px, border `1px solid #3a3a3a`, bg `#181818`, color `#bbb`, 0.78rem, line-height 1.3, `resize:vertical; overflow:hidden; min-height:2rem`. Placeholder "Why this slot…".
  - **Card cells** (one per sub-deck): `<input>` — width 100%, padding 0.35rem 0.5rem, radius 6px, bg `#1a1a1a`, 0.86rem, placeholder "Card name…". Border color by state (see Cell States). Active column cells get `td` bg `rgba(100,108,255,0.08)`. Below input, a note line appears per state.
  - **Active row** gets `outline:2px solid #646cff; outline-offset:-2px` on the `<tr>`.

- **Suggestion strip** (renders as a full-width row directly under the active row; `td colspan = 3 + subdeckCount`):
  - Panel bg `#16161e`, padding 0.6rem 0.8rem, radius 8px, margin `0.2rem 0 0.5rem`.
  - Label `#aaa` 0.78rem: "Similar to **&lt;33 A card&gt;** (33 A) · otag:&lt;tag&gt; · fills 33 &lt;active&gt;".
  - Suggestion cards in a wrapping flex (gap 0.6rem): each border `1px solid #444`, radius 6px, bg `#1a1a2a`, padding 0.5rem 0.6rem. Name `#8b92ff` weight 500; meta `#999` 0.72rem "&lt;cost&gt; · MV &lt;n&gt;"; take button (border `1px solid #646cff`, `#8b92ff`, transparent bg, radius 5px, 0.72rem) labelled "→ 33 &lt;active&gt;".
  - Empty state: `#666` 0.78rem "Every matching card is already in the deck."

- **Consistency rail** (`width:280px`, left border `1px solid #2c2c2c`, padding 16px, bg `#1e1e2e`): three sections, each with a 0.72rem uppercase `#888` heading and a `1px #333` divider between.
  - **Consistency** — one fill bar per sub-deck: label "33 X" (active adds `#646cff` " active"), count "X / 7" in the sub-deck accent color (tabular-nums), track (height 6px, bg `#111`, radius 3px) with fill in the accent color at `count/total %`.
  - **Needs attention** — list, 0.8rem, each `<dot> <text>`: red `●` (`#ff8a8a`) for duplicates and not-found; amber `●` (`#e8a33d`) for flagged/review; grey `○` (`#888`) for empty slots; green `✓` (`#5a9e63`) "All clear" when none.
  - **MV curve · avg X.X** — 7 bars (MV 1–6, 7+), `height:54px`, each `flex:1`, bg `#5a9e63`, radius `2px 2px 0 0`, height `= value/max %` (min 3%). Axis labels below: 1 2 3 4 5 6 7+, `#666` 0.64rem.

## Interactions & Behavior
- **Commander typing**: on input, filter commander list (case-insensitive `includes`); show dropdown unless the query is an exact single match. Clicking a suggestion fills the field. "Look Up Cards" resolves the query to an exact match if found (else keeps typed text) and switches to the workspace. Disabled while field is empty.
- **Change commander**: returns to picker (resets the "touched" state so the dropdown doesn't auto-open).
- **Select a cell**: clicking/focusing any card input sets that cell's column as **active** and its row as the **active row** → highlights column, moves the "active" pill, and opens the suggestion strip under that row.
- **Edit a card**: typing in a card input updates state and live-recomputes duplicates/not-found, fill bars, needs-attention, and the MV curve.
- **Edit a tag**: changing a row's `<select>` updates its otag and re-drives that row's suggestions.
- **Edit a note**: free text per row; textarea is drag-resizable vertically (no scrollbar).
- **Take a suggestion**: writes the suggested card name into the active cell (active row + active column).
- **Dismiss a flag**: the amber "review" note on a flagged cell has a "✓ keep" button that clears the flag.
- No async animations; all updates are synchronous re-renders off a single state object.

## Cell States (card cells)
Computed per card value against the catalog + a whole-deck occurrence count:
- **empty** — no value. Border `#444` (or `#555` if in active column). Placeholder shown.
- **ok** — in catalog, appears once in deck. Border `#444` / `#555` active.
- **dup** — appears >1× anywhere across all sub-decks. Border `#d9534f`; note line `#ff8a8a` 0.7rem "duplicate in deck".
- **nf** (not found) — non-empty but not in catalog/Scryfall. Border `#d9534f`; note `#ff8a8a` "not found on Scryfall". (Prototype seeds "Damnaton" — a typo of "Damnation" — to demo this.)
- **flagged** — a review flag set on the cell (e.g. tag changed under an existing card). Border `#e8a33d`; note `#e8a33d` "⚠ tag changed — keep?" + "✓ keep" dismiss button. (Prototype seeds flag on cell A row index 1.)
Precedence: dup/nf (red) override flagged (amber) override normal.

## State Management
Single state object:
- `step`: `'commander' | 'workspace'`.
- `commanderQuery` (string), `commander` (resolved string), `commanderTouched` (bool — gates dropdown).
- `subdecks`: array of column keys, `['A','B','C']` (max 3).
- `activeCol` (e.g. `'B'`), `activeRow` (row index) — drive highlight + suggestion strip.
- `flags`: map keyed `"<col>-<rowIndex>"` → true (review flags).
- `slots`: array of rows, each `{ category, note, A, B, C }` where category is a tag label and A/B/C are card-name strings.

Derived each render (do not store): per-name deck occurrence counts, per-cell state, fill counts per column, needs-attention list, MV buckets + average, totals.

## Data
- **Tag → Scryfall otag mapping** (the `<select>` options):
  Ramp→`ramp`, Mana Rock→`mana-rock`, Card Draw→`card-draw`, Tutor→`tutor`, Removal→`targeted-removal`, Board Wipe→`board-wipe`, Counterspell→`counterspell`, Protection→`protection`, Token Generator→`token-generator`, Reanimation→`reanimation`, Grave Hate→`grave-hate`, Blink→`blink`, Cost Reducer→`cost-reducer`, Aristocrat→`aristocrat`, Anthem→`anthem`.
- **Card catalog** (prototype stub): `{ name → { cost, mv, purpose } }` where `purpose` is the otag. In production, replace with **Scryfall API** calls: validate card names, fetch mana cost + MV + color identity, and query suggestions with `otag:<tag>` filtered to the commander's color identity and MV band, excluding cards already in the deck. Card "not found" = Scryfall returns no exact match.
- **Commander list** (prototype stub): 8 legendary creatures. In production, autocomplete against Scryfall `is:commander` (legendary creatures / valid commanders).

## Design Tokens
Colors:
- Backgrounds: page `#171717`, card/panel `#242424`, rail `#1e1e2e`, inputs `#1a1a1a`, note input `#181818`, suggestion panel `#16161e`, suggestion card `#1a1a2a`, curve track `#111`.
- Borders/dividers: `#2c2c2c`, `#333`, `#444`, `#555`, `#3a3a3a`, `#2a2a2a`.
- Text: primary `rgba(255,255,255,0.87)`, muted `#aaa`, dim `#888`, faint `#666`, note `#bbb`.
- Accent (primary/indigo): `#646cff`; on-tint `rgba(100,108,255,0.08)`; link `#8b92ff`, hover `#a7adff`.
- Semantic: amber/review `#e8a33d`; red/error `#d9534f`, red text `#ff8a8a`; success `#5a9e63`.
- Sub-deck accents: A `#5a9e63`, B `#c06a55`, C `#8b7fd4` (extras D `#d49a3d`, E `#4a9ecc`, F `#c05fa0`).
- Color-identity pips: W `#f7f0d8`, U `#4a7fd0`, B `#3a3a3a`, G `#5a9e63`.

Radius: 5px (small buttons), 6px (inputs/cells/buttons), 8px (panels/large inputs), 14px (main card), 999px (pills), 50% (pips).
Shadows: card `0 20px 60px rgba(0,0,0,0.45)`; dropdown `0 8px 22px rgba(0,0,0,0.5)`.
Type: `system-ui, -apple-system, sans-serif`. Tabular-nums on all counts. Uppercase micro-labels at 0.68–0.72rem, letter-spacing 0.05–0.08em.

## Assets
None external. The brand tile and color pips are CSS gradients/solid circles; the select chevron is an inline SVG data-URI. No image/icon files. The ⚔ is a Unicode glyph — swap for the codebase's icon set if preferred.

## Screenshots
In `screenshots/`:
- `01-commander.png` — the commander picker entry screen.
- `02-workspace.png` — the main matrix workspace (sample Atraxa deck).

Note: the workspace screenshot was captured with a DOM-rasterizer that cannot render a native `<select>`'s chosen label, so every Tag dropdown *appears* to read "Ramp". This is a screenshot artifact only — the live prototype selects the correct tag per row (confirm via the `otag:` line beneath each, which is correct). Implement the Tag column as a normal controlled select.

## Files
- `deck-brewer-workspace.dc.html` — the full prototype (markup + logic). Read as plain text for the exact spec. The `<x-dc>…</x-dc>` body is the template; the `class Component extends DCLogic` block holds all state, handlers, and derived-value logic in `renderVals()`.
