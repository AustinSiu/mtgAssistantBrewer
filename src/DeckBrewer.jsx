import { Fragment, useEffect, useRef, useState } from "react";
import CardNameInput from "./CardNameInput";
import CommanderPicker from "./CommanderPicker";
import WorkspaceHeader from "./WorkspaceHeader";
import ConsistencyRail from "./ConsistencyRail";
import {
  CATEGORY_SUGGESTIONS,
  tagForCategory,
  queryHintForCategory,
  resolveCardNames,
  lookupCommander,
  fetchSimilar,
} from "./brew";
import { duplicateNonBasics, toMoxfield } from "./decklist";
import { reorder, remapIndex } from "./reorder";
import { cardManaCost, cardManaValue } from "./scryfall";

export const CARD_COUNT = 33;
export const MAX_SUB_DECKS = 3;
const SUB_DECK_NAMES = ["33 A", "33 B", "33 C"];
// Sub-deck accent colors (design tokens: A green, B rust, C violet).
const ACCENTS = ["#5a9e63", "#c06a55", "#8b7fd4"];
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
  const [step, setStep] = useState(
    (saved?.commander ?? "").trim() ? "workspace" : "commander"
  );
  const [slots, setSlots] = useState(saved?.slots ?? emptySlots());
  const [subDecks, setSubDecks] = useState(saved?.subDecks ?? [emptySubDeck()]);
  const [activeIdx, setActiveIdx] = useState(saved?.activeIdx ?? 0);
  const [activeRow, setActiveRow] = useState(null);

  const [error, setError] = useState(null);
  const [commanderCard, setCommanderCard] = useState(null);
  const [lookup, setLookup] = useState(() => new Map()); // lowername -> {card, matchType}
  const [strip, setStrip] = useState({ loading: false, items: null });
  const [pendingChange, setPendingChange] = useState(null);
  const [warnDisabled, setWarnDisabled] = useState(false); // this session only
  const [exportOpen, setExportOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

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

  // Resolve the commander to its card (for color identity) whenever it changes.
  useEffect(() => {
    const name = commander.trim();
    if (!name) {
      setCommanderCard(null);
      return;
    }
    let cancelled = false;
    lookupCommander(name)
      .then((card) => !cancelled && setCommanderCard(card))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [commander]);

  // Resolve card data on commit: whenever the set of committed names changes,
  // fetch any not already in the lookup so the rail stays live.
  const committedNames = [
    ...new Set(subDecks.flatMap((sd) => sd.cards.map((c) => c.trim()).filter(Boolean))),
  ];
  const namesKey = committedNames.map((n) => n.toLowerCase()).sort().join("|");
  useEffect(() => {
    const missing = committedNames.filter(
      (n) => !lookupRef.current.has(n.toLowerCase())
    );
    if (!missing.length) return;
    let cancelled = false;
    resolveCardNames(missing)
      .then((resolved) => {
        if (cancelled) return;
        setLookup((prev) => {
          const next = new Map(prev);
          for (const [k, v] of resolved) next.set(k, v);
          return next;
        });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  // Suggestions for the active row, always driven by the 33 A "main" card.
  const sourceName = activeRow != null ? subDecks[0].cards[activeRow].trim() : "";
  const sourceCard = sourceName
    ? lookup.get(sourceName.toLowerCase())?.card
    : null;
  const rowTag = activeRow != null ? tagForCategory(slots[activeRow].tag) : undefined;
  useEffect(() => {
    if (activeRow == null || !sourceCard || !rowTag) {
      setStrip({ loading: false, items: null });
      return;
    }
    let cancelled = false;
    setStrip({ loading: true, items: null });
    const excludeNames = new Set(
      subDecks.flatMap((sd) =>
        sd.cards.map((c) => c.trim().toLowerCase()).filter(Boolean)
      )
    );
    fetchSimilar({ card: sourceCard, tag: rowTag, commanderCard, excludeNames })
      .then((items) => !cancelled && setStrip({ loading: false, items }))
      .catch(() => !cancelled && setStrip({ loading: false, items: [] }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow, sourceName, sourceCard, rowTag, commanderCard, namesKey]);

  // Commander singleton: any non-basic name used in 2+ cells is a conflict.
  const duplicateNames = duplicateNonBasics(
    subDecks.flatMap((sd) =>
      sd.cards.filter((c) => c.trim()).map((name) => ({ name }))
    )
  );

  const filledCount = subDecks.reduce(
    (sum, sd) => sum + sd.cards.filter((c) => c.trim()).length,
    0
  );
  const totalSlots = CARD_COUNT * subDecks.length;

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
    const affected = filledCellsInRow(slot, subIdx).map((c) => ({ ...c, slot }));
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
    setSlots((prev) => prev.map((s, i) => (i === slot ? { ...s, tag: newTag } : s)));
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

  function selectCell(subIdx, slot) {
    setActiveIdx(subIdx);
    setActiveRow(slot);
  }

  // Move a whole slot row (its shared tag/note plus every sub-deck's card and
  // flag at that row) to a new position, keeping the active row pinned to it.
  function moveRow(from, to) {
    if (from == null || to == null || from === to) return;
    setSlots((prev) => reorder(prev, from, to));
    setSubDecks((prev) =>
      prev.map((sd) => ({
        cards: reorder(sd.cards, from, to),
        flags: reorder(sd.flags, from, to),
      }))
    );
    setActiveRow((prev) => (prev == null ? prev : remapIndex(prev, from, to)));
  }

  function handleRowDragStart(e, i) {
    setDragIndex(i);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(i));
    }
  }

  function handleRowDragOver(e, i) {
    if (dragIndex == null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (overIndex !== i) setOverIndex(i);
  }

  function handleRowDrop(e, i) {
    e.preventDefault();
    moveRow(dragIndex, i);
    setDragIndex(null);
    setOverIndex(null);
  }

  function endRowDrag() {
    setDragIndex(null);
    setOverIndex(null);
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
    setActiveIdx((prev) =>
      Math.max(0, prev > subIdx ? prev - 1 : Math.min(prev, subDecks.length - 2))
    );
  }

  function clearAll() {
    if (filledCount && !window.confirm("Clear the whole deck?")) return;
    setCommander("");
    setSlots(emptySlots());
    setSubDecks([emptySubDeck()]);
    setActiveIdx(0);
    setActiveRow(null);
    setError(null);
    setCommanderCard(null);
    setLookup(new Map());
    setStep("commander");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort
    }
  }

  function takeSuggestion(name) {
    if (activeRow == null) return;
    commitCard(activeIdx, activeRow, name);
  }

  if (step === "commander") {
    return (
      <CommanderPicker
        commander={commander}
        onCommit={setCommander}
        onLookUp={() => commander.trim() && setStep("workspace")}
      />
    );
  }

  const colSpan = 3 + subDecks.length + (subDecks.length < MAX_SUB_DECKS ? 1 : 0);

  return (
    <div className="brew">
      <div className="brew-workspace">
        <WorkspaceHeader
          commander={commander}
          commanderCard={commanderCard}
          totalPlaced={filledCount}
          totalSlots={totalSlots}
          onChangeCommander={() => setStep("commander")}
          onExport={() => setExportOpen(true)}
          onClear={clearAll}
        />

        <div className="ws-body">
          <div className="ws-matrix">
            <div className="matrix-caption">
              Composition matrix{" "}
              <span className="matrix-caption-hint">
                · rows are shared slot tags · click a cell to edit &amp; get
                suggestions
              </span>
            </div>
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="num-col">#</th>
                  <th className="tag-col">
                    Tag <span className="th-hint">· function</span>
                  </th>
                  <th className="note-col">
                    Note <span className="th-hint">· intent</span>
                  </th>
                  {subDecks.map((sd, si) => (
                    <th
                      key={si}
                      className={`sub-col ${si === activeIdx ? "active" : ""}`}
                      style={{ borderBottomColor: ACCENTS[si] }}
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
                    <tr
                      className={[
                        activeRow === i ? "active-row" : "",
                        dragIndex === i ? "dragging" : "",
                        overIndex === i && dragIndex !== i ? "drag-over" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDragOver={(e) => handleRowDragOver(e, i)}
                      onDrop={(e) => handleRowDrop(e, i)}
                      onDragEnd={endRowDrag}
                    >
                      <td className="num">
                        <span
                          className="drag-handle"
                          draggable
                          role="button"
                          aria-label={`Reorder row ${i + 1}`}
                          title="Drag to reorder"
                          onDragStart={(e) => handleRowDragStart(e, i)}
                        >
                          ⠿
                        </span>
                        <span className="row-num">{i + 1}</span>
                      </td>
                      <td className="tag-cell-td">
                        <TagInput
                          slotIndex={i}
                          value={slot.tag}
                          onCommit={(tag) => commitTag(i, tag)}
                        />
                        <div className="otag-line">
                          {queryHintForCategory(slot.tag)}
                        </div>
                      </td>
                      <td>
                        <textarea
                          className="note-input"
                          rows={1}
                          placeholder="Why this slot…"
                          aria-label={`Slot ${i + 1} note`}
                          value={slot.note}
                          onChange={(e) => updateNote(i, e.target.value)}
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
                          entry={lookup.get(sd.cards[i].trim().toLowerCase())}
                          onSelect={() => selectCell(si, i)}
                          onCommit={(name) => commitCard(si, i, name)}
                          onDismissFlag={() => dismissFlag(si, i)}
                        />
                      ))}
                      {subDecks.length < MAX_SUB_DECKS && <td></td>}
                    </tr>
                    {activeRow === i && (
                      <tr className="sugg-row">
                        <td colSpan={colSpan}>
                          <SuggestionStrip
                            sourceName={sourceName}
                            sourceCard={sourceCard}
                            queryHint={queryHintForCategory(slots[i].tag)}
                            activeName={SUB_DECK_NAMES[activeIdx]}
                            strip={strip}
                            onTake={takeSuggestion}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <ConsistencyRail
            slots={slots}
            subDecks={subDecks}
            subDeckNames={SUB_DECK_NAMES}
            accents={ACCENTS}
            activeIdx={activeIdx}
            lookup={lookup}
            duplicateNames={duplicateNames}
          />
        </div>
      </div>

      <datalist id="category-suggestions">
        {CATEGORY_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {error && (
        <p className="error" role="alert">
          Lookup failed: {error}
        </p>
      )}

      <CompositionSummary slots={slots} subDecks={subDecks} lookup={lookup} />

      {pendingChange && (
        <ChangeWarningModal
          change={pendingChange}
          onCancel={cancelPending}
          onConfirm={confirmPending}
          onDisableWarnings={() => setWarnDisabled(true)}
        />
      )}

      {exportOpen && (
        <ExportModal
          commander={commander}
          subDecks={subDecks}
          subDeckNames={SUB_DECK_NAMES}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

// Export the selected sub-deck(s) to a Moxfield-importable decklist. Every
// sub-deck is selected by default (the whole 99-card deck); untick some to
// export one or a subset of the 33-card sub-decks.
function ExportModal({ commander, subDecks, subDeckNames, onClose }) {
  const [selected, setSelected] = useState(() =>
    new Set(subDecks.map((_, si) => si))
  );
  const [includeCommander, setIncludeCommander] = useState(true);
  const [copied, setCopied] = useState(false);

  const toggle = (si) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(si)) next.delete(si);
      else next.add(si);
      return next;
    });

  const cards = subDecks.flatMap((sd, si) =>
    selected.has(si) ? sd.cards : []
  );
  const text = toMoxfield({ commander, cards, includeCommander });
  const cardCount = cards.filter((c) => c.trim()).length;

  function copy() {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal export-modal"
        role="dialog"
        aria-label="Export to Moxfield"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Export to Moxfield</h3>
        <p>Pick which sub-decks to include, then copy the list into Moxfield.</p>

        <div className="export-options">
          {subDecks.map((_, si) => (
            <label key={si} className="export-check">
              <input
                type="checkbox"
                checked={selected.has(si)}
                onChange={() => toggle(si)}
              />{" "}
              {subDeckNames[si]}
            </label>
          ))}
          {commander.trim() && (
            <label className="export-check">
              <input
                type="checkbox"
                checked={includeCommander}
                onChange={(e) => setIncludeCommander(e.target.checked)}
              />{" "}
              Commander
            </label>
          )}
        </div>

        <textarea
          className="export-text"
          aria-label="Moxfield decklist"
          readOnly
          rows={10}
          value={text}
        />

        <div className="actions">
          <span className="hint export-count">
            {cardCount} {cardCount === 1 ? "card" : "cards"}
          </span>
          <button type="button" className="preset" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="submit"
            disabled={!text}
            onClick={copy}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tag edits commit on blur (not per keystroke) so the shared-tag warning
// fires once per change.
function TagInput({ slotIndex, value, onCommit }) {
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
  onSelect,
  onCommit,
  onDismissFlag,
}) {
  const notFound = entry && !entry.card && name.trim() !== "";
  const canonical = entry?.card?.name;
  const renamed =
    canonical && canonical.toLowerCase() !== name.trim().toLowerCase();

  const classes = ["cell-td"];
  if (active) classes.push("active");
  if (flag) classes.push("flagged");
  if (duplicate) classes.push("dup");
  if (notFound) classes.push("notfound");

  return (
    <td className={classes.join(" ")} onClick={onSelect} onFocus={onSelect}>
      <CardNameInput
        ariaLabel={`${SUB_DECK_NAMES[subIdx]} card ${slot + 1}`}
        placeholder="Card name…"
        value={name}
        onCommit={onCommit}
      />
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
      {duplicate && <div className="cell-note dup-note">duplicate in deck</div>}
      {notFound && (
        <div className="cell-note dup-note">not found on Scryfall</div>
      )}
      {renamed && <div className="cell-note hint">matched: {canonical}</div>}
    </td>
  );
}

// Renders under the active row; suggestions come from the 33 A "main" card so
// the sub-decks stay consistent in purpose and mana value.
function SuggestionStrip({
  sourceName,
  sourceCard,
  queryHint,
  activeName,
  strip,
  onTake,
}) {
  const label = (
    <span className="strip-label">
      Similar to <strong>{sourceName || "—"}</strong> (33 A){" "}
      <span className="strip-meta">
        {queryHint ? `· ${queryHint} ` : ""}· fills {activeName}
      </span>
    </span>
  );

  let body;
  if (!sourceCard || !queryHint) {
    body = (
      <div className="strip-empty">
        Fill 33 A with a tagged card to drive suggestions.
      </div>
    );
  } else if (strip.loading) {
    body = <div className="strip-empty">Searching…</div>;
  } else if (strip.items && strip.items.length === 0) {
    body = (
      <div className="strip-empty">Every matching card is already in the deck.</div>
    );
  } else {
    body = (
      <div className="strip-cards">
        {(strip.items ?? []).map((card) => (
          <div key={card.id} className="strip-card">
            <a
              className="strip-card-name"
              href={card.scryfall_uri}
              target="_blank"
              rel="noreferrer"
            >
              {card.name}
            </a>
            <div className="strip-card-meta">
              {cardManaCost(card)} · MV {cardManaValue(card)}
            </div>
            <button
              type="button"
              className="take"
              onClick={() => onTake(card.name)}
            >
              → {activeName}
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="sugg-strip">
      <div className="strip-label-row">{label}</div>
      {body}
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
