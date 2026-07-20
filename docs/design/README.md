# Design references

Design handoffs and prototypes that the app's UI was built from — kept here so
component structure, styling tokens, and state patterns can be referenced when
extending or restyling the app.

These are **references, not runnable code**. The `.dc.html` prototypes are
authored in a proprietary "Design Component" format and won't render in a plain
browser, but they read as plain text and document the exact layout, tokens, and
logic. Screenshots show the intended result.

## Contents

- [`playtest-drag-and-drop.md`](./playtest-drag-and-drop.md) — approved design
  for direct-manipulation drag & drop in the Playtest simulator (free-position
  battlefield, pointer-event drags between zones); written as an
  implementation handoff.
- [`deck-brewer-workspace/`](./deck-brewer-workspace/) — the Deck Brewer
  commander-picker + matrix workspace (the two-screen flow implemented in
  `src/DeckBrewer.jsx`, `src/CommanderPicker.jsx`, `src/WorkspaceHeader.jsx`,
  and `src/ConsistencyRail.jsx`). Its `README.md` documents the screens,
  components, cell states, state shape, data wiring, and the full design-token
  palette; `deck-brewer-workspace.dc.html` is the annotated prototype.

The live color/type/spacing tokens documented here also back the Claude Design
project's foundations (`foundations/colors.html`, `foundations/type.html`).
