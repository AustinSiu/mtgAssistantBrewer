import { useEffect, useMemo, useRef, useState } from "react";
import {
  newGame,
  draw,
  shuffleLibrary,
  mulligan,
  moveCard,
  setPosition,
  setPositions,
  tapMany,
  cardsInMarquee,
  reorderInZone,
  toggleTap,
  nextTurn,
  addLife,
  addToken,
  removeInstance,
  addCounter,
  addPlayerCounter,
  findZone,
  TOKEN_PRESETS,
  PLAYER_COUNTERS,
  CARD_W,
  CARD_H,
} from "./playtest";
import { cardImageUrl, cardManaCost, cardTypeLabel } from "./scryfall";

const GRID = 20; // drop-snap grid (half the 40px battlefield background)
const DRAG_THRESHOLD = 5; // px of travel before a press becomes a drag

const snap = (v) => Math.round(v / GRID) * GRID;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Default hit-test: the drop zone under a screen point, or null. Component
// tests inject a stub instead (jsdom has no layout).
const domResolveDropTarget = (x, y) =>
  document.elementFromPoint?.(x, y)?.closest("[data-drop]")?.dataset.drop ?? null;

// Where, among the other hand cards, an x-coordinate would insert the dragged
// card: before the first card whose horizontal midpoint sits right of x, else
// at the end. Index is measured with the dragged card removed.
function domHandIndex(container, id, clientX) {
  if (!container) return 0;
  const others = [...container.querySelectorAll("[data-hand-id]")].filter(
    (el) => el.dataset.handId !== id
  );
  for (let i = 0; i < others.length; i++) {
    const r = others[i].getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return i;
  }
  return others.length;
}

/**
 * Pointer-driven drag for playtest cards. A press that travels past the
 * threshold becomes a drag: a floating ghost follows the cursor and the
 * hovered drop zone is reported back for highlighting; release calls `onDrop`.
 * A press that doesn't travel stays a click (tap / menu). Escape cancels an
 * in-flight drag before any other handler sees it.
 */
function useCardDrag({ resolveDropTarget, onDrop, onDragStart }) {
  const [ghost, setGhost] = useState(null);
  const active = useRef(null); // { id, sourceZone, startX, startY, moved, ... }
  const wasDragged = useRef(false); // swallow the click synthesized after a drag

  // Latest callbacks, so the stable handlers below always see fresh closures.
  const cfg = useRef({ resolveDropTarget, onDrop, onDragStart });
  useEffect(() => {
    cfg.current = { resolveDropTarget, onDrop, onDragStart };
  });

  // Stable window handlers so add/removeEventListener see identical references.
  const h = useMemo(() => {
    const self = {};
    self.cleanup = () => {
      window.removeEventListener("pointermove", self.onMove);
      window.removeEventListener("pointerup", self.onUp);
    };
    self.cancel = () => {
      self.cleanup();
      active.current = null;
      setGhost(null);
      wasDragged.current = true;
    };
    self.onMove = (e) => {
      const c = active.current;
      if (!c) return;
      if (!c.moved) {
        if (Math.hypot(e.clientX - c.startX, e.clientY - c.startY) < DRAG_THRESHOLD)
          return;
        c.moved = true;
        cfg.current.onDragStart?.();
      }
      const over = cfg.current.resolveDropTarget(e.clientX, e.clientY);
      setGhost({ ...c.ghost, x: e.clientX, y: e.clientY, over });
    };
    self.onUp = (e) => {
      const c = active.current;
      self.cleanup();
      active.current = null;
      if (!c || !c.moved) return;
      wasDragged.current = true;
      const targetZone = cfg.current.resolveDropTarget(e.clientX, e.clientY);
      setGhost(null);
      cfg.current.onDrop({
        id: c.id,
        sourceZone: c.sourceZone,
        targetZone,
        clientX: e.clientX,
        clientY: e.clientY,
        group: c.group,
      });
    };
    return self;
  }, []);

  // While a drag is live, Escape cancels it and nothing else acts on the key.
  useEffect(() => {
    if (!ghost) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      h.cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ghost, h]);

  const startDrag = (e, meta) => {
    if (e.button != null && e.button !== 0) return; // primary button only
    const groupCount = meta.group && meta.group.length > 1 ? meta.group.length : 0;
    active.current = {
      id: meta.id,
      sourceZone: meta.sourceZone,
      group: meta.group,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ghost: {
        id: meta.id,
        name: meta.name,
        img: meta.img,
        tapped: meta.tapped,
        token: meta.token,
        groupCount,
      },
    };
    wasDragged.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    window.addEventListener("pointermove", h.onMove);
    window.addEventListener("pointerup", h.onUp);
  };

  // Read-and-reset: true when the click now firing is the tail of a drag and
  // should be ignored by the card's own click handler.
  const consumeClick = () => {
    const was = wasDragged.current;
    wasDragged.current = false;
    return was;
  };

  return { ghost, startDrag, consumeClick };
}

/**
 * Rubber-band selection on the battlefield: press on empty field and drag to
 * draw a rectangle; release reports it (in battlefield-canvas coordinates) so
 * the caller can select the cards inside. A press that doesn't travel is a
 * click and clears the selection instead.
 */
function useMarquee({ battlefieldRef, onSelect, onClear }) {
  const [rect, setRect] = useState(null);
  const active = useRef(null);

  const cfg = useRef({ onSelect, onClear });
  useEffect(() => {
    cfg.current = { onSelect, onClear };
  });

  const h = useMemo(() => {
    const self = {};
    self.cleanup = () => {
      window.removeEventListener("pointermove", self.onMove);
      window.removeEventListener("pointerup", self.onUp);
    };
    const rectFrom = (a, e) => ({
      x: a.x,
      y: a.y,
      w: e.clientX - a.ox - a.x,
      h: e.clientY - a.oy - a.y,
    });
    self.onMove = (e) => {
      const a = active.current;
      if (!a) return;
      const r = rectFrom(a, e);
      if (!a.moved && Math.hypot(r.w, r.h) >= DRAG_THRESHOLD) a.moved = true;
      setRect(r);
    };
    self.onUp = (e) => {
      const a = active.current;
      self.cleanup();
      active.current = null;
      setRect(null);
      if (!a) return;
      if (!a.moved) cfg.current.onClear();
      else cfg.current.onSelect(rectFrom(a, e));
    };
    return self;
  }, []);

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target !== e.currentTarget) return; // only the bare battlefield
    const b = battlefieldRef.current?.getBoundingClientRect();
    const ox = b?.left ?? 0;
    const oy = b?.top ?? 0;
    active.current = { x: e.clientX - ox, y: e.clientY - oy, ox, oy, moved: false };
    setRect({ x: active.current.x, y: active.current.y, w: 0, h: 0 });
    window.addEventListener("pointermove", h.onMove);
    window.addEventListener("pointerup", h.onUp);
  };

  return { rect, onPointerDown };
}

/**
 * Full-screen goldfishing simulator. Takes a deck (one entry per physical
 * card) and an optional commander, shuffles up, and lets you draw, mulligan,
 * play cards between zones, make tokens, put counters on things, and track
 * life/turns. Cards move by drag-and-drop — drag from hand to the battlefield,
 * slide them around the field, or drop them onto a zone pile — with the ⋮ menu
 * and keyboard shortcuts still available for everything. Close with the X (or
 * Escape) to return to the tab you came from — the deck underneath is
 * untouched.
 *
 * Keyboard shortcuts (underlined in the buttons): D draw, N next turn,
 * S shuffle, M mulligan, R restart, T add token, V view library.
 */
function Playtest({
  deck,
  commander,
  onClose,
  resolveDropTarget = domResolveDropTarget,
  resolveHandIndex, // (id, clientX) -> insertion index; DOM-based when omitted
}) {
  const [game, setGame] = useState(() => newGame({ deck, commander }));
  const [menuFor, setMenuFor] = useState(null); // instance id with open menu
  const [tokenOpen, setTokenOpen] = useState(false);
  const [countersOpen, setCountersOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [customToken, setCustomToken] = useState("");
  const [preview, setPreview] = useState(null); // instance id under the cursor
  const [confirmClose, setConfirmClose] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // battlefield multi-select
  const battlefieldRef = useRef(null);
  const handRef = useRef(null);

  const clearSelection = () => setSelected((s) => (s.size ? new Set() : s));

  const act = (fn) => setGame(fn);

  // Lock the page behind the full-screen simulator so there's no outer
  // scrollbar while it's open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const closeAllPopups = () => {
    setMenuFor(null);
    setTokenOpen(false);
    setCountersOpen(false);
  };

  function restart() {
    setGame(newGame({ deck, commander }));
    closeAllPopups();
    setLibraryOpen(false);
    setGraveyardOpen(false);
    clearSelection();
  }

  // Only one zone side panel is open at a time (they share the right dock).
  const openLibrary = () => {
    setGraveyardOpen(false);
    setLibraryOpen(true);
  };
  const openGraveyard = () => {
    setLibraryOpen(false);
    setGraveyardOpen(true);
  };

  // Translate a screen point into a snapped, in-bounds battlefield offset.
  // Falls back to a fixed corner when the field has no measurable box (jsdom).
  function dropPoint(clientX, clientY) {
    const rect = battlefieldRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return { x: 16, y: 16 };
    const x = clamp(clientX - rect.left - CARD_W / 2, 0, rect.width - CARD_W);
    const y = clamp(clientY - rect.top - CARD_H / 2, 0, rect.height - CARD_H);
    return { x: snap(x), y: snap(y) };
  }

  // Same delta applied to a battlefield card's stored position, clamped in
  // bounds — used to slide a whole multi-selection together.
  function shiftedPos(pos, dx, dy) {
    const rect = battlefieldRef.current?.getBoundingClientRect();
    const maxX = rect && rect.width ? rect.width - CARD_W : Infinity;
    const maxY = rect && rect.height ? rect.height - CARD_H : Infinity;
    return { x: clamp(pos.x + dx, 0, maxX), y: clamp(pos.y + dy, 0, maxY) };
  }

  function handleDrop({ id, sourceZone, targetZone, clientX, clientY, group }) {
    if (!targetZone) return; // dropped on nothing
    // A multi-select drag carries the whole battlefield group; otherwise just
    // the one card (and any lingering selection is cleared).
    const isGroup = group && group.length > 1;
    const ids = isGroup ? group : [id];

    if (targetZone === "battlefield") {
      const pos = dropPoint(clientX, clientY);
      if (sourceZone === "battlefield") {
        if (isGroup) {
          const from = game.cards[id]?.pos ?? pos;
          const dx = pos.x - from.x;
          const dy = pos.y - from.y;
          act((g) =>
            setPositions(
              g,
              ids.map((cid) => ({ id: cid, pos: shiftedPos(g.cards[cid].pos, dx, dy) }))
            )
          );
        } else {
          clearSelection();
          act((g) => setPosition(g, id, pos));
        }
      } else {
        act((g) => moveCard(g, id, "battlefield", pos));
      }
      return;
    }
    if (targetZone === sourceZone) {
      // Dropping a hand card back on the hand reorders it; other same-zone
      // drops are no-ops.
      if (targetZone === "hand") {
        const idx = resolveHandIndex
          ? resolveHandIndex(id, clientX)
          : domHandIndex(handRef.current, id, clientX);
        act((g) => reorderInZone(g, id, idx));
      }
      return;
    }
    // Library drop lands on top; everything else appends. A group moves as one.
    const position = targetZone === "library" ? "start" : "end";
    act((g) => ids.reduce((s, cid) => moveCard(s, cid, targetZone, position), g));
    clearSelection();
  }

  const dnd = useCardDrag({
    resolveDropTarget,
    onDragStart: () => {
      closeAllPopups();
      setPreview(null); // no hover preview while dragging
    },
    onDrop: handleDrop,
  });

  const marquee = useMarquee({
    battlefieldRef,
    onSelect: (rect) => setSelected(new Set(cardsInMarquee(game, rect))),
    onClear: clearSelection,
  });

  // Tap a battlefield card. If it's part of a multi-selection, tap the whole
  // group uniformly; otherwise clear any selection and tap just this card.
  function tapCard(id) {
    if (selected.has(id) && selected.size > 1) {
      const value = !game.cards[id].tapped;
      act((g) => tapMany(g, [...selected], value));
    } else {
      clearSelection();
      act((g) => toggleTap(g, id));
    }
  }

  // Close request: confirm before tearing down the board.
  const requestClose = () => setConfirmClose(true);

  // Keyboard shortcuts. Skipped while typing in a field; Escape closes the
  // topmost popup first, then the simulator. (A live drag's Escape is handled
  // by useCardDrag before this fires.)
  const keyDeps = useRef();
  keyDeps.current = { menuFor, tokenOpen, countersOpen, libraryOpen, graveyardOpen, confirmClose, hasSelection: selected.size > 0 };
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
      ) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const open = keyDeps.current;
      switch (e.key === "Escape" ? "Escape" : e.key.toLowerCase()) {
        case "Escape":
          if (open.confirmClose) setConfirmClose(false);
          else if (open.menuFor) setMenuFor(null);
          else if (open.tokenOpen) setTokenOpen(false);
          else if (open.countersOpen) setCountersOpen(false);
          else if (open.libraryOpen) setLibraryOpen(false);
          else if (open.graveyardOpen) setGraveyardOpen(false);
          else if (open.hasSelection) clearSelection();
          else requestClose();
          break;
        case "d":
          act((g) => draw(g));
          break;
        case "n":
          act((g) => nextTurn(g));
          break;
        case "s":
          act((g) => shuffleLibrary(g));
          break;
        case "m":
          act((g) => mulligan(g));
          break;
        case "r":
          restart();
          break;
        case "t":
          setTokenOpen((o) => !o);
          break;
        case "v":
          if (open.libraryOpen) setLibraryOpen(false);
          else openLibrary();
          break;
        case "g":
          if (open.graveyardOpen) setGraveyardOpen(false);
          else openGraveyard();
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const { zones, cards, life, turn, playerCounters } = game;
  const inst = (id) => cards[id];
  const overZone = dnd.ghost?.over;

  function menuActions(id) {
    const zone = findZone(game, id);
    const instance = inst(id);
    const send = (toZone, position) => () => {
      act((g) => moveCard(g, id, toZone, position));
      setMenuFor(null);
    };
    switch (zone) {
      case "hand":
        return [
          ["Play", send("battlefield")],
          ["Discard", send("graveyard")],
          ["Exile", send("exile")],
          ["Top of library", send("library", "start")],
          ["Bottom of library", send("library", "end")],
        ];
      case "battlefield": {
        const counterItems = [
          ["Add counter", () => act((g) => addCounter(g, id, 1))],
          ...(instance.counters > 0
            ? [["Remove counter", () => act((g) => addCounter(g, id, -1))]]
            : []),
        ];
        if (instance.token) {
          return [
            [instance.tapped ? "Untap" : "Tap", () => {
              act((g) => toggleTap(g, id));
              setMenuFor(null);
            }],
            ...counterItems,
            ["Remove token", () => {
              act((g) => removeInstance(g, id));
              setMenuFor(null);
            }],
          ];
        }
        return [
          [instance.tapped ? "Untap" : "Tap", () => {
            act((g) => toggleTap(g, id));
            setMenuFor(null);
          }],
          ...counterItems,
          ["To hand", send("hand")],
          ["To graveyard", send("graveyard")],
          ["Exile", send("exile")],
          ["Top of library", send("library", "start")],
          ["To command zone", send("command")],
        ];
      }
      case "graveyard":
      case "exile":
        return [
          ["To hand", send("hand")],
          ["To battlefield", send("battlefield")],
          ["Top of library", send("library", "start")],
        ];
      case "command":
        return [["Cast", send("battlefield")]];
      default:
        return [];
    }
  }

  function makeToken(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    act((g) => addToken(g, trimmed));
    setTokenOpen(false);
    setCustomToken("");
  }

  const activeCounters = PLAYER_COUNTERS.filter((k) => playerCounters[k] > 0);

  return (
    <div className="playtest" role="dialog" aria-label="Playtest">
      <header className="pt-topbar">
        <span className="pt-brand">
          <span className="brand-tile" aria-hidden="true">
            ⚔
          </span>
          Playtest
        </span>

        <div className="pt-life" aria-label="Life total">
          <button
            type="button"
            className="pt-life-btn"
            aria-label="Lose a life"
            onClick={() => act((g) => addLife(g, -1))}
          >
            −
          </button>
          <span className="pt-life-value">{life}</span>
          <button
            type="button"
            className="pt-life-btn"
            aria-label="Gain a life"
            onClick={() => act((g) => addLife(g, 1))}
          >
            +
          </button>
        </div>

        <div className="pt-popover-anchor">
          <button
            type="button"
            className="pt-btn"
            onClick={() => {
              setCountersOpen((o) => !o);
              setTokenOpen(false);
              setMenuFor(null);
            }}
          >
            Counters ▾
          </button>
          {countersOpen && (
            <div className="pt-popover" role="dialog" aria-label="Player counters">
              {PLAYER_COUNTERS.map((kind) => (
                <div key={kind} className="pt-counter-row">
                  <span className="pt-counter-name">{kind}</span>
                  <button
                    type="button"
                    className="pt-life-btn"
                    aria-label={`Remove ${kind} counter`}
                    onClick={() => act((g) => addPlayerCounter(g, kind, -1))}
                  >
                    −
                  </button>
                  <span className="pt-counter-value">{playerCounters[kind]}</span>
                  <button
                    type="button"
                    className="pt-life-btn"
                    aria-label={`Add ${kind} counter`}
                    onClick={() => act((g) => addPlayerCounter(g, kind, 1))}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeCounters.length > 0 && (
          <span className="pt-counter-summary">
            {activeCounters
              .map((k) => `${k.toLowerCase()} ${playerCounters[k]}`)
              .join(" · ")}
          </span>
        )}

        <span className="pt-turn">Turn {turn}</span>

        <div className="pt-controls">
          <button type="button" className="pt-btn" title="R" onClick={restart}>
            <u>R</u>estart
          </button>
          <div className="pt-popover-anchor">
            <button
              type="button"
              className="pt-btn"
              title="T"
              onClick={() => {
                setTokenOpen((o) => !o);
                setCountersOpen(false);
                setMenuFor(null);
              }}
            >
              Add <u>T</u>oken ▾
            </button>
            {tokenOpen && (
              <div className="pt-popover" role="dialog" aria-label="Add token">
                {TOKEN_PRESETS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="pt-popover-item"
                    onClick={() => makeToken(name)}
                  >
                    {name}
                  </button>
                ))}
                <form
                  className="pt-token-custom"
                  onSubmit={(e) => {
                    e.preventDefault();
                    makeToken(customToken);
                  }}
                >
                  <input
                    type="text"
                    placeholder="Custom token…"
                    aria-label="Custom token name"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                  />
                  <button type="submit" className="pt-btn" disabled={!customToken.trim()}>
                    Add
                  </button>
                </form>
              </div>
            )}
          </div>
          <button
            type="button"
            className="pt-btn"
            title="S"
            onClick={() => act((g) => shuffleLibrary(g))}
          >
            <u>S</u>huffle
          </button>
          <button
            type="button"
            className="pt-btn"
            title="V"
            onClick={openLibrary}
          >
            <u>V</u>iew Library
          </button>
          <button
            type="button"
            className="pt-btn"
            title="D"
            disabled={!zones.library.length}
            onClick={() => act((g) => draw(g))}
          >
            <u>D</u>raw
          </button>
          <button
            type="button"
            className="pt-btn"
            title="M"
            onClick={() => act((g) => mulligan(g))}
          >
            <u>M</u>ulligan
          </button>
          <button
            type="button"
            className="pt-btn primary"
            title="N"
            onClick={() => act((g) => nextTurn(g))}
          >
            <u>N</u>ext Turn
          </button>
          <button
            type="button"
            className="pt-close"
            aria-label="Close playtest"
            onClick={requestClose}
          >
            ✕
          </button>
        </div>
      </header>

      <main
        className="pt-battlefield"
        aria-label="Battlefield"
        onClick={closeAllPopups}
      >
        <div className="pt-zone-label">Battlefield</div>
        <div
          className="pt-battlefield-cards"
          data-drop="battlefield"
          ref={battlefieldRef}
          onPointerDown={marquee.onPointerDown}
        >
          {zones.battlefield.map((id) => (
            <PlaytestCard
              key={id}
              inst={inst(id)}
              tappable
              sourceZone="battlefield"
              dnd={dnd}
              onHover={setPreview}
              selected={selected.has(id)}
              group={selected.has(id) && selected.size > 1 ? [...selected] : null}
              onTap={() => tapCard(id)}
              menuOpen={menuFor === id}
              onMenu={() => setMenuFor(menuFor === id ? null : id)}
              actions={menuActions(id)}
            />
          ))}
          {marquee.rect && (
            <div
              className="pt-marquee"
              style={{
                left: Math.min(marquee.rect.x, marquee.rect.x + marquee.rect.w),
                top: Math.min(marquee.rect.y, marquee.rect.y + marquee.rect.h),
                width: Math.abs(marquee.rect.w),
                height: Math.abs(marquee.rect.h),
              }}
            />
          )}
          {!zones.battlefield.length && (
            <div className="pt-empty-hint">
              Drag a card here from your hand (or click it) to play it.
              Drag over empty field to select several at once. Shortcuts: D draw ·
              N next turn · S shuffle · M mulligan · T token · V library · R restart.
            </div>
          )}
        </div>
      </main>

      <footer className="pt-bottombar">
        <section
          className={`pt-hand ${overZone === "hand" ? "pt-drop-hover" : ""}`}
          aria-label="Hand"
          data-drop="hand"
        >
          <div className="pt-zone-label">Hand ({zones.hand.length})</div>
          <div className="pt-hand-cards" ref={handRef}>
            {zones.hand.map((id) => (
              <PlaytestCard
                key={id}
                inst={inst(id)}
                sourceZone="hand"
                dnd={dnd}
                onHover={setPreview}
                menuOpen={menuFor === id}
                onMenu={() => setMenuFor(menuFor === id ? null : id)}
                actions={menuActions(id)}
              />
            ))}
          </div>
        </section>

        <section className="pt-piles">
          <Pile
            label={`Library (${zones.library.length})`}
            drop="library"
            hover={overZone === "library"}
          >
            <button
              type="button"
              className="pt-cardback"
              aria-label="View library"
              title="View library (V)"
              onClick={openLibrary}
            />
          </Pile>
          <Pile
            label={`Graveyard (${zones.graveyard.length})`}
            drop="graveyard"
            hover={overZone === "graveyard"}
            onView={openGraveyard}
          >
            <PileTop
              ids={zones.graveyard}
              zone="graveyard"
              inst={inst}
              dnd={dnd}
              onHover={setPreview}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              menuActions={menuActions}
            />
          </Pile>
          <Pile
            label={`Exile (${zones.exile.length})`}
            drop="exile"
            hover={overZone === "exile"}
          >
            <PileTop
              ids={zones.exile}
              zone="exile"
              inst={inst}
              dnd={dnd}
              onHover={setPreview}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              menuActions={menuActions}
            />
          </Pile>
          <Pile label="Command" drop="command" hover={overZone === "command"}>
            <PileTop
              ids={zones.command}
              zone="command"
              inst={inst}
              dnd={dnd}
              onHover={setPreview}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              menuActions={menuActions}
            />
          </Pile>
        </section>
      </footer>

      {dnd.ghost && <DragGhost ghost={dnd.ghost} />}

      {preview && cards[preview] && !dnd.ghost && (
        <CardPreview inst={cards[preview]} />
      )}

      {libraryOpen && (
        <ZoneSidePanel
          title="Library"
          zone="library"
          ids={zones.library}
          quickActions={LIBRARY_ACTIONS}
          inst={inst}
          dnd={dnd}
          onMove={(id, zone, position) => act((g) => moveCard(g, id, zone, position))}
          onShuffle={() => act((g) => shuffleLibrary(g))}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {graveyardOpen && (
        <ZoneSidePanel
          title="Graveyard"
          zone="graveyard"
          ids={zones.graveyard}
          reversed
          quickActions={GRAVEYARD_ACTIONS}
          inst={inst}
          dnd={dnd}
          onMove={(id, zone, position) => act((g) => moveCard(g, id, zone, position))}
          onClose={() => setGraveyardOpen(false)}
        />
      )}

      {confirmClose && (
        <div className="modal-overlay" onClick={() => setConfirmClose(false)}>
          <div
            className="modal pt-confirm"
            role="dialog"
            aria-label="Close playtest?"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Leave the playtest?</h3>
            <p>The current board, hand, and turn will be discarded.</p>
            <div className="actions">
              <button type="button" className="preset" onClick={() => setConfirmClose(false)}>
                Keep playing
              </button>
              <button type="button" className="submit" onClick={onClose}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The large image of the hovered card, docked to the right of the battlefield.
function CardPreview({ inst }) {
  const img = inst.card ? cardImageUrl(inst.card) : null;
  return (
    <div className="pt-preview" aria-hidden="true">
      {img ? (
        <img src={img} alt="" draggable={false} />
      ) : (
        <div className="pt-preview-proxy">
          <span className="pt-proxy-name">{inst.name}</span>
          {inst.card && (
            <span className="pt-proxy-type">{cardTypeLabel(inst.card)}</span>
          )}
          {inst.token && <span className="pt-proxy-type">Token</span>}
        </div>
      )}
    </div>
  );
}

// The card that trails the cursor mid-drag: a plain, non-interactive clone.
function DragGhost({ ghost }) {
  return (
    <div
      className={`pt-drag-ghost ${ghost.tapped ? "tapped" : ""}`}
      style={{ left: ghost.x, top: ghost.y }}
      aria-hidden="true"
    >
      <div className={`pt-card ${ghost.token ? "token" : ""}`}>
        {ghost.img ? (
          <img src={ghost.img} alt="" draggable={false} />
        ) : (
          <span className="pt-card-proxy">
            <span className="pt-proxy-name">{ghost.name}</span>
          </span>
        )}
      </div>
      {ghost.groupCount > 1 && (
        <span className="pt-ghost-count">{ghost.groupCount}</span>
      )}
    </div>
  );
}

/**
 * Right-docked library panel (Moxfield-style): browse the library top-first,
 * preview the card under the cursor at the top, and drag cards straight onto
 * the battlefield or any zone. The quick buttons remain for precise moves
 * (e.g. back to the top of the library). Colours are explicit so names stay
 * legible regardless of the OS light/dark preference.
 */
function ZoneSidePanel({
  title,
  zone,
  ids,
  reversed, // graveyard reads most-recent first
  quickActions, // [[label, toZone, position?], …]
  inst,
  dnd,
  onMove,
  onShuffle, // library only — adds "Shuffle & close"
  onClose,
}) {
  const [hoverId, setHoverId] = useState(null);
  const [filter, setFilter] = useState("");
  const label = title.toLowerCase();

  const q = filter.trim().toLowerCase();
  const ordered = reversed ? [...ids].reverse() : ids;
  const rows = ordered
    .map((id, i) => ({ id, pos: i + 1 }))
    .filter(({ id }) => !q || inst(id).name.toLowerCase().includes(q));

  const activeId =
    (hoverId && inst(hoverId) && rows.some((r) => r.id === hoverId) && hoverId) ||
    rows[0]?.id ||
    null;
  const active = activeId ? inst(activeId) : null;
  const activeImg = active?.card ? cardImageUrl(active.card) : null;

  const move = (id, toZone, position) => (e) => {
    e.stopPropagation(); // a button click is not a row drag
    onMove(id, toZone, position);
  };

  return (
    <aside className="pt-library-panel" role="dialog" aria-label={title} data-drop={zone}>
      <header className="pt-library-head">
        <span>
          Viewing {title} ({ids.length})
        </span>
        <button type="button" className="pt-close" aria-label={`Close ${label}`} onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="pt-library-preview">
        {active ? (
          activeImg ? (
            <img src={activeImg} alt="" draggable={false} />
          ) : (
            <div className="pt-preview-proxy">
              <span className="pt-proxy-name">{active.name}</span>
              {active.card && (
                <span className="pt-proxy-type">{cardTypeLabel(active.card)}</span>
              )}
            </div>
          )
        ) : (
          <p className="hint">The {label} is empty.</p>
        )}
      </div>

      <div className="pt-library-filter">
        <input
          type="text"
          placeholder="Filter by name…"
          aria-label={`Filter ${label}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="pt-library-list">
        {rows.map(({ id, pos }) => {
          const c = inst(id);
          const img = c.card ? cardImageUrl(c.card) : null;
          return (
            <div
              key={id}
              className="pt-library-row"
              onMouseEnter={() => setHoverId(id)}
              onPointerDown={(e) =>
                dnd?.startDrag(e, {
                  id,
                  sourceZone: zone,
                  name: c.name,
                  img,
                  tapped: false,
                  token: c.token,
                })
              }
            >
              <span className="pt-library-pos">{pos}</span>
              <span className="pt-library-name">{c.name}</span>
              <span className="pt-library-actions">
                {quickActions.map(([lbl, toZone, position]) => (
                  <button
                    key={lbl}
                    type="button"
                    className="take"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={move(id, toZone, position)}
                  >
                    {lbl}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
        {!ids.length && <p className="hint">The {label} is empty.</p>}
        {!!ids.length && !rows.length && (
          <p className="hint">No cards match “{filter.trim()}”.</p>
        )}
      </div>

      <footer className="pt-library-foot">
        {onShuffle && (
          <button
            type="button"
            className="preset"
            onClick={() => {
              onShuffle();
              onClose();
            }}
          >
            Shuffle &amp; close
          </button>
        )}
        <button type="button" className="submit" onClick={onClose}>
          Close
        </button>
      </footer>
    </aside>
  );
}

// Quick per-row moves offered by each zone panel: [label, toZone, position?].
const LIBRARY_ACTIONS = [
  ["Hand", "hand"],
  ["Field", "battlefield"],
  ["Grave", "graveyard"],
  ["Top", "library", "start"],
];
const GRAVEYARD_ACTIONS = [
  ["Hand", "hand"],
  ["Field", "battlefield"],
  ["Exile", "exile"],
  ["Library", "library", "start"],
];

function Pile({ label, drop, hover, onView, children }) {
  return (
    <div className={`pt-pile ${hover ? "pt-drop-hover" : ""}`} data-drop={drop}>
      {onView ? (
        <button type="button" className="pt-zone-label pt-zone-view" onClick={onView}>
          {label} ▾
        </button>
      ) : (
        <div className="pt-zone-label">{label}</div>
      )}
      <div className="pt-pile-card">{children}</div>
    </div>
  );
}

// Top card of a pile (graveyard/exile/command), with its menu.
function PileTop({ ids, zone, inst, dnd, onHover, menuFor, setMenuFor, menuActions }) {
  const top = ids[ids.length - 1];
  if (!top) return <div className="pt-slot-empty" />;
  return (
    <PlaytestCard
      inst={inst(top)}
      sourceZone={zone}
      dnd={dnd}
      onHover={onHover}
      menuOpen={menuFor === top}
      onMenu={() => setMenuFor(menuFor === top ? null : top)}
      actions={menuActions(top)}
    />
  );
}

/**
 * A card instance: the Scryfall image when available, else a text frame
 * (tokens always use the frame). A press-and-drag moves the card (see
 * useCardDrag); a plain click taps it (on the battlefield) or opens its zone
 * menu. Battlefield cards are absolutely placed via their `pos` (CSS --x/--y).
 */
function PlaytestCard({
  inst,
  tappable,
  sourceZone,
  dnd,
  onHover,
  onTap,
  menuOpen,
  onMenu,
  actions,
  selected,
  group,
}) {
  // Fall back to the text frame if the Scryfall image can't be loaded.
  const [imgError, setImgError] = useState(false);
  const img = !imgError && inst.card ? cardImageUrl(inst.card) : null;
  const dragging = dnd?.ghost?.id === inst.id;

  function handleClick(e) {
    e.stopPropagation();
    if (dnd?.consumeClick()) return; // this click closes out a drag; ignore it
    if (tappable) onTap();
    else onMenu();
  }

  function handlePointerDown(e) {
    dnd?.startDrag(e, {
      id: inst.id,
      sourceZone,
      name: inst.name,
      img,
      tapped: inst.tapped,
      token: inst.token,
      group,
    });
  }

  const style = inst.pos
    ? { "--x": `${inst.pos.x}px`, "--y": `${inst.pos.y}px` }
    : undefined;

  return (
    <div
      className={`pt-card-wrap ${dragging ? "pt-dragging" : ""} ${selected ? "pt-selected" : ""}`}
      style={style}
      data-hand-id={sourceZone === "hand" ? inst.id : undefined}
      onMouseEnter={() => onHover?.(inst.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* The tap rotation lives here so it doesn't rotate the action menu. */}
      <div className={`pt-card-tap ${inst.tapped ? "tapped" : ""}`}>
        <button
          type="button"
          className={`pt-card ${inst.token ? "token" : ""}`}
          aria-label={`${inst.name}${inst.tapped ? " (tapped)" : ""}`}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
        >
          {img ? (
            <img
              src={img}
              alt=""
              draggable={false}
              decoding="sync"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="pt-card-proxy">
              <span className="pt-proxy-name">{inst.name}</span>
              {inst.card && (
                <>
                  <span className="pt-proxy-cost">{cardManaCost(inst.card)}</span>
                  <span className="pt-proxy-type">{cardTypeLabel(inst.card)}</span>
                </>
              )}
              {inst.token && <span className="pt-proxy-type">Token</span>}
            </span>
          )}
        </button>
        {inst.counters > 0 && (
          <span className="pt-counter-badge" aria-label={`${inst.counters} counters`}>
            {inst.counters}
          </span>
        )}
        {tappable && (
          <button
            type="button"
            className="pt-card-menu-btn"
            aria-label={`Actions for ${inst.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
          >
            ⋮
          </button>
        )}
      </div>
      {menuOpen && (
        <ul className="pt-menu" role="menu">
          {actions.map(([label, run]) => (
            <li key={label}>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  run();
                }}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Playtest;
