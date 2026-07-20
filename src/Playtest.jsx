import { useEffect, useState } from "react";
import {
  newGame,
  draw,
  shuffleLibrary,
  mulligan,
  moveCard,
  toggleTap,
  nextTurn,
  addLife,
  findZone,
} from "./playtest";
import { cardImageUrl, cardManaCost, cardTypeLabel } from "./scryfall";

/**
 * Full-screen goldfishing simulator. Takes a deck (one entry per physical
 * card) and an optional commander, shuffles up, and lets you draw, mulligan,
 * play cards between zones, tap, and track life/turns. Close with the X to
 * return to the tab you came from — the deck underneath is untouched.
 */
function Playtest({ deck, commander, onClose }) {
  const [game, setGame] = useState(() => newGame({ deck, commander }));
  const [menuFor, setMenuFor] = useState(null); // instance id with open menu

  const act = (fn) => setGame(fn);

  // Escape closes the open card menu first, then the simulator.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (menuFor) setMenuFor(null);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuFor, onClose]);

  const { zones, cards, life, turn } = game;
  const inst = (id) => cards[id];

  function menuActions(id) {
    const zone = findZone(game, id);
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
      case "battlefield":
        return [
          [inst(id).tapped ? "Untap" : "Tap", () => {
            act((g) => toggleTap(g, id));
            setMenuFor(null);
          }],
          ["To hand", send("hand")],
          ["To graveyard", send("graveyard")],
          ["Exile", send("exile")],
          ["Top of library", send("library", "start")],
          ["To command zone", send("command")],
        ];
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

        <span className="pt-turn">Turn {turn}</span>

        <div className="pt-controls">
          <button
            type="button"
            className="pt-btn"
            onClick={() => {
              setGame(newGame({ deck, commander }));
              setMenuFor(null);
            }}
          >
            Restart
          </button>
          <button
            type="button"
            className="pt-btn"
            onClick={() => act((g) => shuffleLibrary(g))}
          >
            Shuffle
          </button>
          <button
            type="button"
            className="pt-btn"
            disabled={!zones.library.length}
            onClick={() => act((g) => draw(g))}
          >
            Draw
          </button>
          <button
            type="button"
            className="pt-btn"
            onClick={() => act((g) => mulligan(g))}
          >
            Mulligan
          </button>
          <button
            type="button"
            className="pt-btn primary"
            onClick={() => act((g) => nextTurn(g))}
          >
            Next Turn
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
        onClick={() => setMenuFor(null)}
      >
        <div className="pt-zone-label">Battlefield</div>
        <div className="pt-battlefield-cards">
          {zones.battlefield.map((id) => (
            <PlaytestCard
              key={id}
              inst={inst(id)}
              tappable
              onTap={() => act((g) => toggleTap(g, id))}
              menuOpen={menuFor === id}
              onMenu={() => setMenuFor(menuFor === id ? null : id)}
              actions={menuActions(id)}
            />
          ))}
          {!zones.battlefield.length && (
            <div className="pt-empty-hint">
              Click a card in your hand to play it here.
            </div>
          )}
        </div>
      </main>

      <footer className="pt-bottombar">
        <section className="pt-hand" aria-label="Hand">
          <div className="pt-zone-label">Hand ({zones.hand.length})</div>
          <div className="pt-hand-cards">
            {zones.hand.map((id) => (
              <PlaytestCard
                key={id}
                inst={inst(id)}
                menuOpen={menuFor === id}
                onMenu={() => setMenuFor(menuFor === id ? null : id)}
                actions={menuActions(id)}
              />
            ))}
          </div>
        </section>

        <section className="pt-piles">
          <Pile label={`Library (${zones.library.length})`}>
            <div className="pt-cardback" aria-label="Library" />
          </Pile>
          <Pile label={`Graveyard (${zones.graveyard.length})`}>
            <PileTop
              ids={zones.graveyard}
              inst={inst}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              menuActions={menuActions}
            />
          </Pile>
          <Pile label={`Exile (${zones.exile.length})`}>
            <PileTop
              ids={zones.exile}
              inst={inst}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              menuActions={menuActions}
            />
          </Pile>
          <Pile label="Command">
            <PileTop
              ids={zones.command}
              inst={inst}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              menuActions={menuActions}
            />
          </Pile>
        </section>
      </footer>
    </div>
  );
}

function Pile({ label, children }) {
  return (
    <div className="pt-pile">
      <div className="pt-zone-label">{label}</div>
      <div className="pt-pile-card">{children}</div>
    </div>
  );
}

// Top card of a pile (graveyard/exile/command), with its menu.
function PileTop({ ids, inst, menuFor, setMenuFor, menuActions }) {
  const top = ids[ids.length - 1];
  if (!top) return <div className="pt-slot-empty" />;
  return (
    <PlaytestCard
      inst={inst(top)}
      menuOpen={menuFor === top}
      onMenu={() => setMenuFor(menuFor === top ? null : top)}
      actions={menuActions(top)}
    />
  );
}

/**
 * A card instance: the Scryfall image when available, else a text frame.
 * Clicking opens its zone menu (or taps, on the battlefield); the menu lists
 * the legal moves out of the current zone.
 */
function PlaytestCard({ inst, tappable, onTap, menuOpen, onMenu, actions }) {
  const img = inst.card ? cardImageUrl(inst.card) : null;

  function handleClick(e) {
    e.stopPropagation();
    if (tappable) onTap();
    else onMenu();
  }

  return (
    <div className={`pt-card-wrap ${inst.tapped ? "tapped" : ""}`}>
      <button
        type="button"
        className="pt-card"
        aria-label={`${inst.name}${inst.tapped ? " (tapped)" : ""}`}
        onClick={handleClick}
      >
        {img ? (
          <img src={img} alt="" draggable={false} />
        ) : (
          <span className="pt-card-proxy">
            <span className="pt-proxy-name">{inst.name}</span>
            {inst.card && (
              <>
                <span className="pt-proxy-cost">{cardManaCost(inst.card)}</span>
                <span className="pt-proxy-type">{cardTypeLabel(inst.card)}</span>
              </>
            )}
          </span>
        )}
      </button>
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
