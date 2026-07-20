# Design: Drag & Drop for the Playtest simulator

Status: **design approved, unimplemented** — implementation handoff.
Base the work on the Playtest code as of PR #25 (`Playtest: tokens, counters,
library viewer, keyboard shortcuts`). If #25 is not yet merged, branch from its
head (`claude/playtest-moxfield-parity`); otherwise branch from `main`.

## Goal

Replace click-menu-driven card movement with direct manipulation, Moxfield
style:

1. **Hand → battlefield**: drag a card out of the hand and drop it where it
   should sit on the battlefield.
2. **Battlefield repositioning**: drag battlefield cards anywhere on the
   field (free placement, not flow order).
3. **Between zones**: drag any visible card onto the Graveyard / Exile /
   Command / Library piles or back to the Hand.

Click menus, the ⋮ button, and keyboard shortcuts **stay** — they remain the
path for counters, token removal, precise library placement (bottom), and
accessibility. Drag is an addition, not a replacement, for those.

## Technology decision: pointer events, not HTML5 DnD

Use raw pointer events (`pointerdown` / `pointermove` / `pointerup` +
`setPointerCapture`), **not** the HTML5 drag-and-drop API (which the Deck
Brewer row-reorder uses).

Why:
- Free positioning needs pointer coordinates on every move; HTML5 DnD hides
  them behind dragover and gives no control over the ghost image (a rotated
  tapped card ghosts badly).
- The drag visual must be a styled clone following the cursor — trivial with
  pointer events, fighting the browser with HTML5 DnD.
- Pointer events unify mouse + touch (`touch-action: none` on cards).
- jsdom can synthesize pointer events for component tests; Playwright drives
  real drags with `mouse.move/down/up`.

Guard `el.setPointerCapture?.(...)` — jsdom doesn't implement it.

## Battlefield model: free canvas

### State (`playtest.js`)

- Battlefield instances gain a position: `cards[id].pos = { x, y }` —
  **pixel offsets** relative to the battlefield canvas's top-left.
- `zones.battlefield` array order becomes the **z-order** (render order);
  interacting with a card (drag, tap) moves its id to the end → on top.
- New pure function:
  `setPosition(state, id, {x, y})` — updates `pos`, bumps z-order.
  **Must not untap** (repositioning is not a zone change).
- `moveCard(state, id, toZone, position)` extends `position` to accept
  `{x, y}` when `toZone === "battlefield"` (drop point). Without coords
  (menu Play, Cast, addToken), auto-place with a small cascade, e.g.
  `16 + (battlefieldCount * 24) % 320` for both axes — collision-perfect
  placement is not required.
- `pos` is deleted when a card leaves the battlefield.
- All existing rules stand: untap on zone change, tokens cease to exist when
  they leave the battlefield.

### Rendering / CSS

- `.pt-battlefield-cards` becomes `position: relative` canvas (fills the
  battlefield main; drop the flex-wrap).
- `.pt-card-wrap` becomes `position: absolute` with
  `left: clamp(0px, var(--x), calc(100% - 92px))` and the same for `top`
  (92×128 card box) — clamping via CSS keeps cards in-bounds on window
  resize without recomputing state.
- Optional (recommended): snap drop coordinates to a 20px grid — half the
  40px background grid — one `Math.round(v / 20) * 20` at drop time,
  behind a `GRID = 20` constant.

## Interaction spec

### Drag lifecycle

| Phase | Behavior |
| --- | --- |
| `pointerdown` on a card | Record candidate drag (id, source zone, start xy). Not yet a drag. |
| Move < 5px, then `pointerup` | It was a **click** — preserve today's behavior exactly (battlefield: tap toggle; hand/piles: open menu). |
| Move ≥ 5px | Enter drag mode: close any open menus/popovers, original card dims (`opacity ~0.4`), a floating clone (`.pt-drag-ghost`: fixed position, `pointer-events: none`, slight scale + shadow, keeps tapped rotation) follows the cursor. |
| `pointermove` | Ghost follows; resolve the hovered drop target and highlight it. |
| `pointerup` on a target | Apply the move (table below). |
| `pointerup` on nothing valid / `Escape` during drag | Cancel — no state change, ghost disappears. |

Suppress the synthetic click that follows a completed drag (a `wasDragged`
ref checked in the click handler).

### Drop targets and outcomes

Containers get `data-drop` attributes: `battlefield`, `hand`, `graveyard`,
`exile`, `command`, `library` (the pile including its label area).

| Source → Target | Outcome |
| --- | --- |
| hand → battlefield | `moveCard(id, "battlefield", {x,y})` at drop point |
| battlefield → battlefield | `setPosition(id, {x,y})` — stays tapped, bumps z-order |
| battlefield/pile-top → hand | `moveCard(id, "hand")` |
| any → graveyard / exile / command | `moveCard(id, zone)` (tokens vanish, per existing rule) |
| any → library | `moveCard(id, "library", "start")` — **drop = top of library**; bottom stays a menu action |
| graveyard/exile/command top card → battlefield | `moveCard(id, "battlefield", {x,y})` (command = cast) |
| anything → its own pile / invalid | Cancel |

Drag sources: hand cards, battlefield cards, pile **top** cards. The library
card back is not a drag source (Draw and the viewer cover it). Hand
reordering is a **non-goal** for v1.

### Hovered-target highlight

`.pt-drop-hover` on the hovered container: 2px `#646cff` inset outline (the
established accent), plus a subtle background tint on piles. The battlefield
needs no extra affordance beyond the ghost being over it.

## Hit testing (design for testability)

Resolve the drop target from the pointer position with a single seam:

```js
// default implementation
const resolveDropTarget = (x, y) =>
  document.elementFromPoint(x, y)?.closest("[data-drop]")?.dataset.drop ?? null;
```

The drag hook accepts an optional resolver override. Reason: jsdom has no
layout — `elementFromPoint` and `getBoundingClientRect` are useless there —
so component tests inject a stub resolver, while e2e exercises the real one.
Battlefield drop coordinates come from
`battlefieldRef.current.getBoundingClientRect()` (fallback `{x:16,y:16}` when
rects are zero, which also covers jsdom).

Suggested structure: a `useCardDrag(actions, { resolveDropTarget })` hook in
`Playtest.jsx` (or `usePlaytestDrag.js`) owning the lifecycle; `PlaytestCard`
just wires `onPointerDown` and renders its dim state; one `<DragGhost>`
rendered at the overlay root.

## What must not regress

- Click = tap on battlefield, click = menu in hand/piles (threshold rule).
- Menus: counters add/remove (menu stays open), Remove token, Bottom of
  library, Cast.
- Keyboard shortcuts D/N/S/M/R/T/V/Esc; Escape's close order gains "cancel
  drag" at the top of the stack.
- Tokens ceasing to exist off-battlefield; untap on zone change; commander
  round-trips battlefield ↔ command.
- Library viewer, Counters popover, Add Token popover.

## Test plan

- **Unit (`playtest.test.js`)**: `setPosition` sets pos + bumps z-order +
  keeps tapped; `moveCard` with `{x,y}` places and stores pos; pos cleared on
  leaving battlefield; cascade default when no coords; tokens still vanish.
- **Component (`Playtest.test.jsx`)**: with a stubbed resolver —
  pointerdown+small move+up still taps (threshold); a ≥5px drag from hand
  with resolver→`"battlefield"` plays the card; drag to `"graveyard"`
  discards; Escape cancels a drag; post-drag click suppression.
- **e2e (`decklist.spec.js` playtest step)**: real `mouse` drag hand→
  battlefield (assert zone counts + the card's `style.left/top`), drag
  battlefield→graveyard pile, reposition a battlefield card (assert style
  changed), refresh `decklist-4-playtest.png`.

## Process (per repo skills)

Follow `pr-workflow`: fresh branch (see Status above for the base), verify
lint + vitest + build + e2e, refresh screenshots per `pr-screenshots`
(revert render-noise-only diffs), push, **check PR state before any PR
edit**, and open a **new** PR.

## Implementation stages

1. `playtest.js`: pos model, `setPosition`, `moveCard` coords + cascade,
   unit tests. (No UI change yet — menu Play uses the cascade.)
2. Battlefield absolute-position rendering + CSS (`--x`/`--y` + clamp).
3. Drag hook: lifecycle, threshold, ghost, Escape cancel, click
   suppression.
4. Drop targets: `data-drop` wiring, highlight, outcome table, coordinate
   math, grid snap.
5. Component + e2e tests, screenshot refresh, PR.
