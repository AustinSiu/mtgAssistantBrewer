import { Fragment, useEffect, useState } from "react";
import CardNameInput from "./CardNameInput";
import {
  CATEGORY_SUGGESTIONS,
  tagForCategory,
  lookupDeckCards,
  fetchSimilar,
} from "./brew";
import { duplicateNonBasics } from "./decklist";
import { cardManaCost, cardTypeLine, cardColorIdentity, cardManaValue } from "./scryfall";

export const CARD_COUNT = 33;
export const MAX_SUB_DECKS = 3;
const SUB_DECK_NAMES = ["33 A", "33 B", "33 C"];
const STORAGE_KEY = "mtgBrewer.matrix.v1";

const emptySlots = () =>
  Array.from({ length: CARD_COUNT }, () => ({ note: "", tag: "" }));

const emptySubDeck = () => ({
  cards: Array(CARD_COUNT).fill(""),
  flags: Array(CARD_COUNT).fill(null),
});

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      saved &&
      Array.isArray(saved.slots) &&
      saved.slots.length === CARD_COUNT &&
      Array.isArray(saved.subDecks) &&
      saved.subDecks.length >= 1
    ) {
      return saved;
    }
  } catch {
    // fall through to a fresh state
  }
  return null;
}

function DeckBrewer() {
  const [saved] = useState(loadSaved);

  const [commander, setCommander] = useState(saved?.commander ?? "");
  const [slots, setSlots] = useState(saved?.slots ?? emptySlots());
  const [subDecks, setSubDecks] = useState(saved?.subDecks ?? [emptySubDeck()]);
  const [activeIdx, setActiveIdx] = useState(saved?.activeIdx ?? 0);

  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [commanderCard, setCommanderCard] = useState(null);
  const [lookup, setLookup] = useState(null); // Map lowername -> {card, matchType}
  const [openSuggestion, setOpenSuggestion] = useState(null); // {subIdx, slot, source, items, loading}
  const [pendingChange, setPendingChange] = useState(null);
  const [warnDisabled, setWarnDisabled] = useState(false); // this session only

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ commander, slots, subDecks, activeIdx })
      );
    } catch {
      // storage full/unavailable: persistence is best-effort
    }
  }, [commander, slots, subDecks, activeIdx]);

  const filledCount = subDecks.reduce(
    (sum, sd) => sum + sd.cards.filter((c) => c.trim()).length,
    0
  );
  const hasCommander = commander.trim() !== "";
  const canSubmit = hasCommander && filledCount > 0;

  // Commander singleton: any non-basic name used in 2+ cells is a conflict.
  const duplicateNames = duplicateNonBasics(
    subDecks.flatMap((sd) =>
      sd.cards.filter((c) => c.trim()).map((name) => ({ name }))
    )
  );

  function filledCellsInRow(slot, exceptIdx = -1) {
    return subDecks.flatMap((sd, si) =>
      si !== exceptIdx && sd.cards[slot].trim()
        ? [{ subIdx: si, name: sd.cards[slot] }]
        : []
    );
  }

  function setCard(subIdx, slot, name) {
    setSubDecks((prev) =>
      prev.map((sd, si) =>
        si === subIdx
          ? {
              ...sd,
              cards: sd.cards.map((c, i) => (i === slot ? name : c)),
              flags: sd.flags.map((f, i) => (i === slot ? null : f)),
            }
          : sd
      )
    );
  }

  function flagCells(cells, reason) {
    setSubDecks((prev) =>
      prev.map((sd, si) => {
        const rows = cells.filter((c) => c.subIdx === si);
        if (rows.length === 0) return sd;
        const flags = [...sd.flags];
        for (const c of rows) flags[c.slot] = reason;
        return { ...sd, flags };
      })
    );
  }

  function dismissFlag(subIdx, slot) {
    setSubDecks((prev) =>
      prev.map((sd, si) =>
        si === subIdx
          ? { ...sd, flags: sd.flags.map((f, i) => (i === slot ? null : f)) }
          : sd
      )
    );
  }

  // Card commits apply immediately; replacing a previously chosen card warns
  // that same-row picks in other sub-decks may no longer fit (Cancel reverts).
  function commitCard(subIdx, slot, name) {
    const oldValue = subDecks[subIdx].cards[slot];
    if (name === oldValue) return;
    setCard(subIdx, slot, name);
    const affected = filledCellsInRow(slot, subIdx).map((c) => ({
      ...c,
      slot,
    }));
    if (oldValue.trim() && affected.length > 0) {
      const reason = `picked when ${SUB_DECK_NAMES[subIdx]} slot ${slot + 1} was “${oldValue}”`;
      if (warnDisabled) {
        flagCells(affected, reason);
      } else {
        setPendingChange({
          kind: "card",
          subIdx,
          slot,
          oldValue,
          newValue: name,
          affected,
          reason,
        });
      }
    }
  }

  // Tag commits follow the same optimistic pattern.
  function commitTag(slot, newTag) {
    const oldValue = slots[slot].tag;
    if (newTag === oldValue) return;
    setSlots((prev) =>
      prev.map((s, i) => (i === slot ? { ...s, tag: newTag } : s))
    );
    const affected = filledCellsInRow(slot).map((c) => ({ ...c, slot }));
    if (oldValue.trim() && affected.length > 0) {
      const reason = `picked when slot ${slot + 1} tag was “${oldValue}”`;
      if (warnDisabled) {
        flagCells(affected, reason);
      } else {
        setPendingChange({
          kind: "tag",
          slot,
          oldValue,
          newValue: newTag,
          affected,
          reason,
        });
      }
    }
  }

  function updateNote(slot, note) {
    setSlots((prev) => prev.map((s, i) => (i === slot ? { ...s, note } : s)));
  }

  function confirmPending() {
    flagCells(pendingChange.affected, pendingChange.reason);
    setPendingChange(null);
  }

  function cancelPending() {
    const p = pendingChange;
    if (p.kind === "card") {
      setCard(p.subIdx, p.slot, p.oldValue);
    } else {
      setSlots((prev) =>
        prev.map((s, i) => (i === p.slot ? { ...s, tag: p.oldValue } : s))
      );
    }
    setPendingChange(null);
  }

  function addSubDeck(seed) {
    if (subDecks.length >= MAX_SUB_DECKS) return;
    const sd = emptySubDeck();
    if (seed) sd.cards[seed.slot] = seed.name;
    setSubDecks((prev) => [...prev, sd]);
    setActiveIdx(subDecks.length);
  }

  function removeSubDeck(subIdx) {
    if (subDecks.length <= 1) return;
    if (!window.confirm(`Remove ${SUB_DECK_NAMES[subIdx]} and its cards?`)) return;
    setSubDecks((prev) => prev.filter((_, si) => si !== subIdx));
    setActiveIdx((prev) => Math.max(0, prev > subIdx ? prev - 1 : Math.min(prev, subDecks.length - 2)));
    setOpenSuggestion(null);
  }

  function clearAll() {
    setCommander("");
    setSlots(emptySlots());
    setSubDecks([emptySubDeck()]);
    setActiveIdx(0);
    setStatus("idle");
    setError(null);
    setCommanderCard(null);
    setLookup(null);
    setOpenSuggestion(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("loading");
    setError(null);
    setLookup(null);
    setOpenSuggestion(null);

    try {
      const names = subDecks.flatMap((sd) =>
        sd.cards.map((c) => c.trim()).filter(Boolean)
      );
      const { commanderCard: cmd, cardsByName } = await lookupDeckCards({
        commander,
        names,
      });
      setCommanderCard(cmd);
      setLookup(cardsByName);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  async function toggleSuggestions(subIdx, slot) {
    if (openSuggestion?.subIdx === subIdx && openSuggestion?.slot === slot) {
      setOpenSuggestion(null);
      return;
    }
    const name = subDecks[subIdx].cards[slot].trim();
    const entry = lookup?.get(name.toLowerCase());
    const tag = tagForCategory(slots[slot].tag);
    if (!entry?.card || !tag) return;

    const source = {
      cardName: entry.card.name,
      tag,
      mv: cardManaValue(entry.card),
    };
    setOpenSuggestion({ subIdx, slot, source, items: null, loading: true });
    try {
      const excludeNames = new Set(
        subDecks.flatMap((sd) =>
          sd.cards.map((c) => c.trim().toLowerCase()).filter(Boolean)
        )
      );
      const items = await fetchSimilar({
        card: entry.card,
        tag,
        commanderCard,
        excludeNames,
      });
      setOpenSuggestion((prev) =>
        prev?.subIdx === subIdx && prev?.slot === slot
          ? { ...prev, items, loading: false }
          : prev
      );
    } catch {
      setOpenSuggestion((prev) =>
        prev?.subIdx === subIdx && prev?.slot === slot
          ? { ...prev, items: [], loading: false }
          : prev
      );
    }
  }

  function takeSuggestion(slot, name, target) {
    if (target === "new") {
      addSubDeck({ slot, name });
    } else {
      commitCard(target, slot, name);
    }
    setOpenSuggestion(null);
  }

  return (
    <div>
      <h1>Deck Brewer</h1>
      <p className="subtitle">
        One 100-card Commander deck = your commander + up to {MAX_SUB_DECKS}{" "}
        sub-decks of {CARD_COUNT}. Slots (note + tag) are shared by every
        sub-deck so their composition stays consistent; card names
        autocomplete from Scryfall and only suggested names can be saved.
      </p>

      <form className="deck-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <label htmlFor="commander">
            Commander <span className="required">*</span>
          </label>
          <CardNameInput
            id="commander"
            ariaLabel="Commander"
            placeholder="Commander card name"
            value={commander}
            onCommit={setCommander}
            disabled={status === "loading"}
          />
          {commanderCard && (
            <p className="hint">
              Color identity:{" "}
              <strong>{cardColorIdentity(commanderCard) || "C"}</strong>
            </p>
          )}
        </div>

        <div className="table-wrap matrix-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="num-col"></th>
                <th className="note-col">
                  Note <span className="th-hint">for you</span>
                </th>
                <th className="tag-col">
                  Tag <span className="th-hint">drives suggestions</span>
                </th>
                {subDecks.map((sd, si) => (
                  <th
                    key={si}
                    className={`sub-col col-${si} ${si === activeIdx ? "active" : ""}`}
                  >
                    <button
                      type="button"
                      className="sub-name"
                      onClick={() => setActiveIdx(si)}
                      title="Set as active sub-deck"
                    >
                      {SUB_DECK_NAMES[si]}
                      {si === 0 && <span className="th-hint"> main</span>}
                      {si === activeIdx && (
                        <span className="badge-active">active</span>
                      )}
                    </button>
                    {subDecks.length > 1 && (
                      <button
                        type="button"
                        className="sub-remove"
                        aria-label={`Remove ${SUB_DECK_NAMES[si]}`}
                        onClick={() => removeSubDeck(si)}
                      >
                        ✕
                      </button>
                    )}
                  </th>
                ))}
                {subDecks.length < MAX_SUB_DECKS && (
                  <th className="add-col">
                    <button
                      type="button"
                      className="preset"
                      onClick={() => addSubDeck()}
                    >
                      + Add 33
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot, i) => (
                <Fragment key={i}>
                  <tr>
                    <td className="num">{i + 1}</td>
                    <td>
                      <input
                        type="text"
                        className="note-input"
                        placeholder="Note"
                        aria-label={`Slot ${i + 1} note`}
                        value={slot.note}
                        onChange={(e) => updateNote(i, e.target.value)}
                        disabled={status === "loading"}
                      />
                    </td>
                    <td>
                      <TagInput
                        slotIndex={i}
                        value={slot.tag}
                        onCommit={(tag) => commitTag(i, tag)}
                        disabled={status === "loading"}
                      />
                    </td>
                    {subDecks.map((sd, si) => (
                      <MatrixCell
                        key={si}
                        subIdx={si}
                        slot={i}
                        name={sd.cards[i]}
                        flag={sd.flags[i]}
                        active={si === activeIdx}
                        duplicate={duplicateNames.has(
                          sd.cards[i].trim().toLowerCase()
                        )}
                        entry={lookup?.get(sd.cards[i].trim().toLowerCase())}
                        canSuggest={
                          si === 0 && // suggestions are always driven by the main sub-deck
                          !!lookup &&
                          !!tagForCategory(slot.tag) &&
                          !!lookup.get(sd.cards[i].trim().toLowerCase())?.card
                        }
                        loading={status === "loading"}
                        onCommit={(name) => commitCard(si, i, name)}
                        onDismissFlag={() => dismissFlag(si, i)}
                        onToggleSuggestions={() => toggleSuggestions(si, i)}
                      />
                    ))}
                    {subDecks.length < MAX_SUB_DECKS && <td></td>}
                  </tr>
                  {openSuggestion?.slot === i && (
                    <tr className="sugg-row">
                      <td
                        colSpan={
                          3 +
                          subDecks.length +
                          (subDecks.length < MAX_SUB_DECKS ? 1 : 0)
                        }
                      >
                        <SuggestionStrip
                          suggestion={openSuggestion}
                          subDecks={subDecks}
                          onTake={(name, target) =>
                            takeSuggestion(i, name, target)
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <datalist id="category-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="form-actions">
          <span className="hint">
            {filledCount} of {CARD_COUNT * MAX_SUB_DECKS} cards entered
            {!hasCommander && " — commander required"}
          </span>
          <button
            type="button"
            className="preset"
            onClick={clearAll}
            disabled={status === "loading"}
          >
            Clear
          </button>
          <button
            type="submit"
            className="submit"
            disabled={!canSubmit || status === "loading"}
          >
            {status === "loading" ? "Looking up…" : "Look Up Cards"}
          </button>
        </div>
      </form>

      {status === "error" && (
        <p className="error" role="alert">
          Lookup failed: {error}
        </p>
      )}

      {lookup && (
        <CompositionSummary slots={slots} subDecks={subDecks} lookup={lookup} />
      )}

      {pendingChange && (
        <ChangeWarningModal
          change={pendingChange}
          onCancel={cancelPending}
          onConfirm={confirmPending}
          onDisableWarnings={() => setWarnDisabled(true)}
        />
      )}
    </div>
  );
}

// Tag edits commit on blur (not per keystroke) so the shared-tag warning
// fires once per change.
function TagInput({ slotIndex, value, onCommit, disabled }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="text"
      className="tag-input"
      list="category-suggestions"
      placeholder="Tag"
      aria-label={`Slot ${slotIndex + 1} tag`}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.target.blur();
        }
      }}
    />
  );
}

function MatrixCell({
  subIdx,
  slot,
  name,
  flag,
  active,
  duplicate,
  entry,
  canSuggest,
  loading,
  onCommit,
  onDismissFlag,
  onToggleSuggestions,
}) {
  const notFound = entry && !entry.card && name.trim() !== "";
  const canonical = entry?.card?.name;
  const renamed =
    canonical && canonical.toLowerCase() !== name.trim().toLowerCase();

  const classes = ["cell-td", `col-${subIdx}`];
  if (active) classes.push("active");
  if (flag) classes.push("flagged");
  if (duplicate) classes.push("dup");
  if (notFound) classes.push("notfound");

  return (
    <td className={classes.join(" ")}>
      <div className="cell-wrap">
        <CardNameInput
          ariaLabel={`${SUB_DECK_NAMES[subIdx]} card ${slot + 1}`}
          placeholder="Card name"
          value={name}
          onCommit={onCommit}
          disabled={loading}
        />
        {canSuggest && (
          <button
            type="button"
            className="suggest-btn"
            aria-label={`Suggest alternatives for ${SUB_DECK_NAMES[subIdx]} card ${slot + 1}`}
            title="Suggest alternatives (same tag & mana value)"
            onClick={onToggleSuggestions}
          >
            ✨
          </button>
        )}
      </div>
      {flag && (
        <div className="cell-note flag-note">
          ⚠ {flag}
          <button
            type="button"
            className="dismiss"
            aria-label={`Dismiss warning on ${SUB_DECK_NAMES[subIdx]} card ${slot + 1}`}
            onClick={onDismissFlag}
          >
            ✓ keep
          </button>
        </div>
      )}
      {duplicate && (
        <div className="cell-note dup-note">duplicate in deck</div>
      )}
      {notFound && <div className="cell-note dup-note">not found</div>}
      {renamed && <div className="cell-note hint">matched: {canonical}</div>}
    </td>
  );
}

function SuggestionStrip({ suggestion, subDecks, onTake }) {
  const { source, items, loading, subIdx } = suggestion;
  return (
    <div className="sugg-strip">
      <div className="sugg-label">
        Similar to <strong>{source.cardName}</strong>
        <br />
        <span className="hint">
          otag:{source.tag} · mv={source.mv}
        </span>
        <br />
        <span className="hint">
          Suggestions are always driven by {SUB_DECK_NAMES[0]}, the main
          sub-deck — if the sub-decks stay consistent, its card stands in
          for the whole slot.
        </span>
      </div>
      {loading && <span className="hint">Searching…</span>}
      {items && items.length === 0 && (
        <span className="hint">
          No unused cards found with this tag and mana value.
        </span>
      )}
      {items?.map((card) => (
        <div key={card.id} className="sugg">
          <a href={card.scryfall_uri} target="_blank" rel="noreferrer">
            {card.name}
          </a>
          <div className="meta">
            <span className="mana-cost">{cardManaCost(card)}</span>{" "}
            {cardTypeLine(card)}
          </div>
          <div>
            {subDecks.map((sd, si) =>
              si === subIdx ? null : (
                <button
                  key={si}
                  type="button"
                  className="take"
                  onClick={() => onTake(card.name, si)}
                >
                  → {SUB_DECK_NAMES[si]}
                </button>
              )
            )}
            {subDecks.length < MAX_SUB_DECKS && (
              <button
                type="button"
                className="take"
                onClick={() => onTake(card.name, "new")}
              >
                → new 33
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompositionSummary({ slots, subDecks, lookup }) {
  // Per tag: how many slots carry it, and how many of those each sub-deck
  // has filled — equal columns mean consistent composition.
  const tagOrder = [];
  const byTag = new Map();
  slots.forEach((slot, i) => {
    const label = slot.tag.trim() || "(untagged)";
    if (!byTag.has(label)) {
      byTag.set(label, { slotCount: 0, slotIndexes: [] });
      tagOrder.push(label);
    }
    const t = byTag.get(label);
    t.slotCount++;
    t.slotIndexes.push(i);
  });

  const foundCounts = subDecks.map(
    (sd) =>
      sd.cards.filter((c) => lookup.get(c.trim().toLowerCase())?.card).length
  );

  return (
    <div className="detail">
      <h3>Composition by tag</h3>
      <p className="hint">
        Cards filled per sub-deck for each tag — matching counts mean the
        sub-decks stay consistent.
      </p>
      <div className="table-wrap">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Slots</th>
              {subDecks.map((_, si) => (
                <th key={si}>{SUB_DECK_NAMES[si]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tagOrder.map((label) => {
              const { slotCount, slotIndexes } = byTag.get(label);
              return (
                <tr key={label} className="static-row">
                  <td>{label}</td>
                  <td>{slotCount}</td>
                  {subDecks.map((sd, si) => (
                    <td key={si}>
                      {slotIndexes.filter((i) => sd.cards[i].trim()).length}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr className="static-row">
              <td>
                <strong>Found on Scryfall</strong>
              </td>
              <td>{CARD_COUNT}</td>
              {subDecks.map((sd, si) => (
                <td key={si}>
                  <strong>{foundCounts[si]}</strong>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangeWarningModal({ change, onCancel, onConfirm, onDisableWarnings }) {
  const what =
    change.kind === "tag"
      ? `Change slot ${change.slot + 1} tag: “${change.oldValue}” → “${change.newValue || "(empty)"}”?`
      : `Change ${SUB_DECK_NAMES[change.subIdx]} slot ${change.slot + 1}: “${change.oldValue}” → “${change.newValue || "(empty)"}”?`;

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-label="Confirm change">
        <h3>{what}</h3>
        <p>
          {change.kind === "tag"
            ? "Slot tags are shared by every sub-deck."
            : "Cards in this row of other sub-decks were picked to fit alongside it."}{" "}
          {change.affected.length} card
          {change.affected.length > 1 ? "s" : ""} will be flagged for review
          (not removed):{" "}
          {change.affected
            .map((c) => `${c.name} (${SUB_DECK_NAMES[c.subIdx]})`)
            .join(", ")}
          .
        </p>
        <div className="actions">
          <button type="button" className="preset" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="submit" onClick={onConfirm}>
            Change &amp; flag
          </button>
        </div>
        <label className="dont-warn">
          <input
            type="checkbox"
            onChange={(e) => e.target.checked && onDisableWarnings()}
          />{" "}
          Don't warn again this session
        </label>
      </div>
    </div>
  );
}

export default DeckBrewer;
