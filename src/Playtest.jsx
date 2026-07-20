import { useEffect, useMemo, useRef, useState } from "react";
import {
  newGame,
  draw,
  shuffleLibrary,
  mulligan,
  moveCard,
  setPosition,
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
    active.current = {
      id: meta.id,
      sourceZone: meta.sourceZone,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ghost: { id: meta.id, name: meta.name, img: meta.img, tapped: meta.tapped, token: meta.token },
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
function Playtest({ deck, commander, onClose, resolveDropTarget = domResolveDropTarget }) {
  const [game, setGame] = useState(() => newGame({ deck, commander }));
  const [menuFor, setMenuFor] = useState(null); // instance id with open menu
  const [tokenOpen, setTokenOpen] = useState(false);
  const [countersOpen, setCountersOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [customToken, setCustomToken] = useState("");
  const battlefieldRef = useRef(null);

  const act = (fn) => setGame(fn);

  const closeAllPopups = () => {
    setMenuFor(null);
    setTokenOpen(false);
    setCountersOpen(false);
  };

  function restart() {
    setGame(newGame({ deck, commander }));
    closeAllPopups();
    setLibraryOpen(false);
  }

  // Translate a screen point into a snapped, in-bounds battlefield offset.
  // Falls back to a fixed corner when the field has no measurable box (jsdom).
  function dropPoint(clientX, clientY) {
    const rect = battlefieldRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return { x: 16, y: 16 };
    const x = clamp(clientX - rect.left - CARD_W / 2, 0, rect.width - CARD_W);
    const y = clamp(clientY - rect.top - CARD_H / 2, 0, rect.height - CARD_H);
    return { x: snap(x), y: snap(y) };
  }

  function handleDrop({ id, sourceZone, targetZone, clientX, clientY }) {
    if (!targetZone) return; // dropped on nothing
    if (targetZone === "battlefield") {
      const pos = dropPoint(clientX, clientY);
      if (sourceZone === "battlefield") act((g) => setPosition(g, id, pos));
      else act((g) => moveCard(g, id, "battlefield", pos));
      return;
    }
    if (targetZone === sourceZone) return; // back onto its own zone: no-op
    // Library drop lands on top; everything else appends.
    const position = targetZone === "library" ? "start" : "end";
    act((g) => moveCard(g, id, targetZone, position));
  }

  const dnd = useCardDrag({
    resolveDropTarget,
    onDragStart: closeAllPopups,
    onDrop: handleDrop,
  });

  // Keyboard shortcuts. Skipped while typing in a field; Escape closes the
  // topmost popup first, then the simulator. (A live drag's Escape is handled
  // by useCardDrag before this fires.)
  const keyDeps = useRef();
  keyDeps.current = { menuFor, tokenOpen, countersOpen, libraryOpen };
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
          if (open.menuFor) setMenuFor(null);
          else if (open.tokenOpen) setTokenOpen(false);
          else if (open.countersOpen) setCountersOpen(false);
          else if (open.libraryOpen) setLibraryOpen(false);
          else onClose();
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
          setLibraryOpen((o) => !o);
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
            onClick={() => setLibraryOpen(true)}
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
            onClick={onClose}
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
        <div className="pt-battlefield-cards" data-drop="battlefield" ref={battlefieldRef}>
          {zones.battlefield.map((id) => (
            <PlaytestCard
              key={id}
              inst={inst(id)}
              tappable
              sourceZone="battlefield"
              dnd={dnd}
              onTap={() => act((g) => toggleTap(g, id))}
              menuOpen={menuFor === id}
              onMenu={() => setMenuFor(menuFor === id ? null : id)}
              actions={menuActions(id)}
            />
          ))}
          {!zones.battlefield.length && (
            <div className="pt-empty-hint">
              Drag a card here from your hand (or click it) to play it.
              Shortcuts: D draw · N next turn · S shuffle · M mulligan ·
              T token · V library · R restart.
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
          <div className="pt-hand-cards">
            {zones.hand.map((id) => (
              <PlaytestCard
                key={id}
                inst={inst(id)}
                sourceZone="hand"
                dnd={dnd}
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
              onClick={() => setLibraryOpen(true)}
            />
          </Pile>
          <Pile
            label={`Graveyard (${zones.graveyard.length})`}
            drop="graveyard"
            hover={overZone === "graveyard"}
          >
            <PileTop
              ids={zones.graveyard}
              zone="graveyard"
              inst={inst}
              dnd={dnd}
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
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              menuActions={menuActions}
            />
          </Pile>
        </section>
      </footer>

      {dnd.ghost && <DragGhost ghost={dnd.ghost} />}

      {libraryOpen && (
        <LibraryViewer
          ids={zones.library}
          inst={inst}
          onMove={(id, zone, position) => act((g) => moveCard(g, id, zone, position))}
          onShuffle={() => act((g) => shuffleLibrary(g))}
          onClose={() => setLibraryOpen(false)}
        />
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
    </div>
  );
}

// Browse the library in order (top first) and pull cards out of it.
function LibraryViewer({ ids, inst, onMove, onShuffle, onClose }) {
  return (
    <div className="modal-overlay pt-library-overlay" onClick={onClose}>
      <div
        className="modal pt-library"
        role="dialog"
        aria-label="Library"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Library ({ids.length}) — top first</h3>
        <div className="pt-library-list">
          {ids.map((id, i) => (
            <div key={id} className="pt-library-row">
              <span className="pt-library-pos">{i + 1}</span>
              <span className="pt-library-name">{inst(id).name}</span>
              <span className="pt-library-actions">
                <button type="button" className="take" onClick={() => onMove(id, "hand")}>
                  Hand
                </button>
                <button
                  type="button"
                  className="take"
                  onClick={() => onMove(id, "battlefield")}
                >
                  Field
                </button>
                <button
                  type="button"
                  className="take"
                  onClick={() => onMove(id, "graveyard")}
                >
                  Grave
                </button>
                <button
                  type="button"
                  className="take"
                  onClick={() => onMove(id, "library", "start")}
                >
                  Top
                </button>
              </span>
            </div>
          ))}
          {!ids.length && <p className="hint">The library is empty.</p>}
        </div>
        <div className="actions">
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
          <button type="button" className="submit" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Pile({ label, drop, hover, children }) {
  return (
    <div className={`pt-pile ${hover ? "pt-drop-hover" : ""}`} data-drop={drop}>
      <div className="pt-zone-label">{label}</div>
      <div className="pt-pile-card">{children}</div>
    </div>
  );
}

// Top card of a pile (graveyard/exile/command), with its menu.
function PileTop({ ids, zone, inst, dnd, menuFor, setMenuFor, menuActions }) {
  const top = ids[ids.length - 1];
  if (!top) return <div className="pt-slot-empty" />;
  return (
    <PlaytestCard
      inst={inst(top)}
      sourceZone={zone}
      dnd={dnd}
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
function PlaytestCard({ inst, tappable, sourceZone, dnd, onTap, menuOpen, onMenu, actions }) {
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
    });
  }

  const style = inst.pos
    ? { "--x": `${inst.pos.x}px`, "--y": `${inst.pos.y}px` }
    : undefined;

  return (
    <div
      className={`pt-card-wrap ${dragging ? "pt-dragging" : ""}`}
      style={style}
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
            <img src={img} alt="" draggable={false} onError={() => setImgError(true)} />
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
