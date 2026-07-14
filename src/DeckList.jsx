import { Fragment, useEffect, useState } from "react";
import CardNameInput from "./CardNameInput";
import ManaCost from "./ManaCost";
import { CATEGORY_SUGGESTIONS } from "./brew";
import { parseDecklist, groupEntries, deckStats, isBasicLand } from "./decklist";
import {
  lookupCollection,
  cardManaCostAll,
  cardTypeLine,
  cardPriceUsd,
} from "./scryfall";

const STORAGE_KEY = "mtgBrewer.decklist.v1";
const COMMANDER_TARGET = 100;
const COLLECTION_CHUNK = 75;
const WUBRG = ["W", "U", "B", "R", "G", "C"];

let nextId = 1;
const makeId = () => `e${nextId++}`;

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.entries)) return saved;
  } catch {
    // fall through
  }
  return null;
}

function DeckList() {
  const [saved] = useState(loadSaved);
  // entries: { id, name, qty, tag, commander }  — card data lives in `cards`
  const [entries, setEntries] = useState(
    () => saved?.entries?.map((e) => ({ ...e, id: makeId() })) ?? []
  );
  const [groupBy, setGroupBy] = useState(saved?.groupBy ?? "type");
  const [cards, setCards] = useState(new Map()); // lowername -> card | null
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [addKey, setAddKey] = useState(0); // remounts the add box to clear it

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          entries: entries.map(({ name, qty, tag, commander }) => ({
            name,
            qty,
            tag,
            commander,
          })),
          groupBy,
        })
      );
    } catch {
      // best-effort
    }
  }, [entries, groupBy]);

  // Resolve any entry names we don't have card data for yet.
  useEffect(() => {
    const missing = [
      ...new Set(
        entries
          .map((e) => e.name)
          .filter((n) => !cards.has(n.toLowerCase()))
      ),
    ];
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError(null);
      try {
        const found = new Map();
        for (let i = 0; i < missing.length; i += COLLECTION_CHUNK) {
          const chunk = missing.slice(i, i + COLLECTION_CHUNK);
          const { data = [], not_found: notFound = [] } =
            await lookupCollection(chunk);
          for (const card of data) found.set(card.name.toLowerCase(), card);
          // Record the requested (lowercased) names so misses aren't re-fetched.
          const gotByRequest = new Set(
            data.map((c) => c.name.toLowerCase())
          );
          for (const name of chunk) {
            const key = name.toLowerCase();
            if (!gotByRequest.has(key) && !found.has(key)) found.set(key, null);
          }
          for (const id of notFound) found.set(id.name.toLowerCase(), null);
        }
        if (cancelled) return;
        setCards((prev) => {
          const next = new Map(prev);
          for (const [k, v] of found) next.set(k, v);
          return next;
        });
        setStatus("idle");
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, cards]);

  const resolved = entries.map((e) => ({
    ...e,
    card: cards.get(e.name.toLowerCase()) ?? null,
  }));
  const groups = groupEntries(resolved, groupBy);
  const stats = deckStats(resolved);

  // Non-basic cards whose total copies exceed 1 break Commander singleton.
  const dupNames = (() => {
    const counts = new Map();
    for (const e of entries) {
      if (isBasicLand(e.name)) continue;
      counts.set(
        e.name.toLowerCase(),
        (counts.get(e.name.toLowerCase()) ?? 0) + e.qty
      );
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  })();

  function addCard(name) {
    setEntries((prev) => {
      const i = prev.findIndex(
        (e) => e.name.toLowerCase() === name.toLowerCase()
      );
      if (i !== -1) {
        return prev.map((e, j) => (j === i ? { ...e, qty: e.qty + 1 } : e));
      }
      return [...prev, { id: makeId(), name, qty: 1, tag: "", commander: false }];
    });
  }

  function importPaste() {
    const parsed = parseDecklist(pasteText);
    if (parsed.length === 0) return;
    setEntries((prev) => {
      const byName = new Map(prev.map((e) => [e.name.toLowerCase(), e]));
      for (const { name, qty } of parsed) {
        const key = name.toLowerCase();
        const existing = byName.get(key);
        if (existing) {
          existing.qty += qty;
        } else {
          const row = { id: makeId(), name, qty, tag: "", commander: false };
          byName.set(key, row);
        }
      }
      return [...byName.values()];
    });
    setPasteText("");
    setPasteOpen(false);
  }

  const updateEntry = (id, patch) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  function setQty(id, qty) {
    if (qty < 1) return removeEntry(id);
    updateEntry(id, { qty });
  }

  const removeEntry = (id) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  function setCommander(id) {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        commander: e.id === id ? !e.commander : false, // single commander toggle
      }))
    );
  }

  function clearAll() {
    if (entries.length && !window.confirm("Clear the whole deck list?")) return;
    setEntries([]);
    setCards(new Map());
    setStatus("idle");
    setError(null);
  }

  return (
    <div>
      <h1>Deck List</h1>
      <p className="subtitle">
        Track a full 100-card Commander deck. Add cards by search or paste a
        list; every card is looked up on Scryfall for its type, mana cost, and
        price.
      </p>

      <div className="form-section">
        <label htmlFor="decklist-add">Add a card</label>
        <CardNameInput
          key={addKey}
          id="decklist-add"
          ariaLabel="Add a card"
          placeholder="Search card name…"
          value=""
          onCommit={(name) => {
            if (name) {
              addCard(name);
              setAddKey((k) => k + 1);
            }
          }}
          disabled={status === "loading"}
        />
        <button
          type="button"
          className="link-btn"
          onClick={() => setPasteOpen((o) => !o)}
        >
          {pasteOpen ? "Cancel paste" : "…or paste a decklist"}
        </button>
        {pasteOpen && (
          <div className="paste-box">
            <textarea
              aria-label="Paste decklist"
              placeholder={"1 Sol Ring\n1 Cultivate\n1 Llanowar Elves"}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
            />
            <button type="button" className="submit" onClick={importPaste}>
              Import
            </button>
          </div>
        )}
      </div>

      {status === "error" && (
        <p className="error" role="alert">
          Lookup failed: {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="hint">No cards yet. Add one above or paste a list.</p>
      ) : (
        <>
          <DeckStats stats={stats} groups={groups} />

          <div className="list-toolbar">
            <span className="hint">
              {stats.total} / {COMMANDER_TARGET} cards
              {status === "loading" && " · looking up…"}
            </span>
            <div className="group-toggle">
              <button
                type="button"
                className={groupBy === "type" ? "toggle on" : "toggle"}
                onClick={() => setGroupBy("type")}
              >
                By type
              </button>
              <button
                type="button"
                className={groupBy === "tag" ? "toggle on" : "toggle"}
                onClick={() => setGroupBy("tag")}
              >
                By tag
              </button>
            </div>
            <button type="button" className="preset" onClick={clearAll}>
              Clear
            </button>
          </div>

          <datalist id="decklist-tags">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {groups.map((group) => (
            <DeckGroup
              key={group.label}
              group={group}
              dupNames={dupNames}
              onSetQty={setQty}
              onRemove={removeEntry}
              onSetCommander={setCommander}
              onSetTag={(id, tag) => updateEntry(id, { tag })}
            />
          ))}
        </>
      )}
    </div>
  );
}

function DeckGroup({
  group,
  dupNames,
  onSetQty,
  onRemove,
  onSetCommander,
  onSetTag,
}) {
  return (
    <div className="deck-group">
      <h3 className="group-head">
        {group.label} <span className="group-count">({group.count})</span>
        {group.price > 0 && (
          <span className="group-price">${group.price.toFixed(2)}</span>
        )}
      </h3>
      <div className="table-wrap">
        <table className="list-table">
          <tbody>
            {group.entries.map((e) => {
              const dup = dupNames.has(e.name.toLowerCase());
              const notFound = e.card === null;
              return (
                <tr key={e.id} className={notFound ? "notfound-row" : ""}>
                  <td className="qty-cell">
                    <button
                      type="button"
                      className="step"
                      aria-label={`Decrease ${e.name}`}
                      onClick={() => onSetQty(e.id, e.qty - 1)}
                    >
                      −
                    </button>
                    <span className="qty">{e.qty}</span>
                    <button
                      type="button"
                      className="step"
                      aria-label={`Increase ${e.name}`}
                      onClick={() => onSetQty(e.id, e.qty + 1)}
                    >
                      +
                    </button>
                  </td>
                  <td className="name-cell">
                    {e.card ? (
                      <a href={e.card.scryfall_uri} target="_blank" rel="noreferrer">
                        {e.card.name}
                      </a>
                    ) : (
                      e.name
                    )}
                    {e.commander && <span className="crown" title="Commander">♛</span>}
                    {dup && !e.commander && (
                      <span className="dup-flag" title="Breaks singleton">
                        dup
                      </span>
                    )}
                    {notFound && <span className="dup-flag">not found</span>}
                  </td>
                  <td className="mana-cell">
                    {e.card && <ManaCost cost={cardManaCostAll(e.card)} />}
                  </td>
                  <td className="type-cell">
                    {e.card ? cardTypeLine(e.card) : ""}
                  </td>
                  <td className="tag-cell">
                    <input
                      type="text"
                      list="decklist-tags"
                      className="tag-input"
                      aria-label={`Tag for ${e.name}`}
                      placeholder="tag"
                      value={e.tag}
                      onChange={(ev) => onSetTag(e.id, ev.target.value)}
                    />
                  </td>
                  <td className="price-cell">
                    {e.card && cardPriceUsd(e.card) != null
                      ? `$${cardPriceUsd(e.card).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className={e.commander ? "icon-btn on" : "icon-btn"}
                      aria-label={`Set ${e.name} as commander`}
                      title="Set as commander"
                      onClick={() => onSetCommander(e.id)}
                    >
                      ♛
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${e.name}`}
                      title="Remove"
                      onClick={() => onRemove(e.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeckStats({ stats, groups }) {
  const maxCurve = Math.max(1, ...stats.curve);
  const overTarget = stats.total > COMMANDER_TARGET;
  return (
    <div className="detail deck-stats">
      <div className="stats-row">
        <div className="stat">
          <div className="stat-num">
            <span className={stats.total === COMMANDER_TARGET ? "ok" : overTarget ? "over" : ""}>
              {stats.total}
            </span>
            <span className="stat-sub"> / {COMMANDER_TARGET}</span>
          </div>
          <div className="stat-label">cards</div>
        </div>
        <div className="stat">
          <div className="stat-num">${stats.price.toFixed(2)}</div>
          <div className="stat-label">est. value</div>
        </div>
        <div className="stat colors">
          {WUBRG.filter((c) => stats.colors[c] > 0).map((c) => (
            <span key={c} className="color-count">
              <img
                className="mana-pip"
                src={`https://svgs.scryfall.io/card-symbols/${c}.svg`}
                alt={c}
              />
              {stats.colors[c]}
            </span>
          ))}
        </div>
      </div>

      <div className="curve">
        <div className="curve-title hint">Mana curve (non-land)</div>
        <div className="curve-bars">
          {stats.curve.map((n, mv) => (
            <div className="curve-col" key={mv}>
              <div
                className="curve-bar"
                style={{ height: `${(n / maxCurve) * 100}%` }}
                title={`${n} card${n === 1 ? "" : "s"} at MV ${mv === 7 ? "7+" : mv}`}
              />
              <div className="curve-n">{n || ""}</div>
              <div className="curve-mv">{mv === 7 ? "7+" : mv}</div>
            </div>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <p className="hint group-legend">
          {groups.map((g) => `${g.label} ${g.count}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

export default DeckList;
