import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import CardNameInput from "./CardNameInput";
import CommanderPicker from "./CommanderPicker";
import WorkspaceHeader from "./WorkspaceHeader";
import ConsistencyRail from "./ConsistencyRail";
import DeckStats from "./DeckStats";
import Playtest from "./Playtest";
import { useDeckTokens } from "./useDeckTokens";
import {
  CATEGORY_SUGGESTIONS,
  tagForCategory,
  queryHintForCategory,
  resolveCardNames,
  lookupCommander,
  fetchSimilar,
  hasOracleTag,
} from "./brew";
import { duplicateNonBasics, toMoxfield } from "./decklist";
import { toBrewFormat, parseBrewFormat } from "./brewFormat";
import { reorder, remapIndex } from "./reorder";
import { cardManaCost, cardManaValue, cardPrimaryType } from "./scryfall";
import { CARD_COUNT, MAX_SUB_DECKS, SUB_DECK_NAMES } from "./deckShape";

export { CARD_COUNT, MAX_SUB_DECKS };
// Sub-deck accent colors (design tokens: A green, B rust, C violet).
const ACCENTS = ["#5a9e63", "#c06a55", "#8b7fd4"];
const STORAGE_KEY = "mtgBrewer.matrix.v1";

// Category choices for the tag dropdown: the known tags plus a catch-all
// "Custom". Free-text tags are no longer allowed.
const TAG_OPTIONS = [...CATEGORY_SUGGESTIONS, "Custom"];

// Slots carry a stable id so rows keep their identity while being dragged
// (React can move the actual DOM node instead of rewriting it in place).
let slotSeq = 0;
const makeSlotId = () => `s${slotSeq++}`;

const emptySlots = () =>
  Array.from({ length: CARD_COUNT }, () => ({
    id: makeSlotId(),
    note: "",
    tag: "",
  }));

const emptySubDeck = () => ({
  cards: Array(CARD_COUNT).fill(""),
  flags: Array(CARD_COUNT).fill(null),
});

const emptySubDecks = () =>
  Array.from({ length: MAX_SUB_DECKS }, emptySubDeck);

/** Ensure saved slots each have a stable id (older saves predate ids). */
function withSlotIds(slots) {
  return slots.map((s) => ({
    id: s.id ?? makeSlotId(),
    note: s.note ?? "",
    tag: s.tag ?? "",
  }));
}

/** Normalize saved sub-decks to exactly MAX_SUB_DECKS columns. */
function padSubDecks(subDecks) {
  const next = subDecks
    .slice(0, MAX_SUB_DECKS)
    .map((sd) => ({ cards: [...sd.cards], flags: [...sd.flags] }));
  while (next.length < MAX_SUB_DECKS) next.push(emptySubDeck());
  return next;
}

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
  const [plan, setPlan] = useState(saved?.plan ?? "");
  // Role targets: category label -> desired slot count (the plan's shape).
  const [targets, setTargets] = useState(saved?.targets ?? {});
  const [step, setStep] = useState(
    (saved?.commander ?? "").trim() ? "workspace" : "commander"
  );
  const [slots, setSlots] = useState(() =>
    saved?.slots ? withSlotIds(saved.slots) : emptySlots()
  );
  const [subDecks, setSubDecks] = useState(() =>
    saved?.subDecks ? padSubDecks(saved.subDecks) : emptySubDecks()
  );
  const [activeIdx, setActiveIdx] = useState(saved?.activeIdx ?? 0);
  const [activeRow, setActiveRow] = useState(null);

  const [error, setError] = useState(null);
  const [commanderCard, setCommanderCard] = useState(null);
  const [lookup, setLookup] = useState(() => new Map()); // lowername -> {card, matchType}
  const [strip, setStrip] = useState({ loading: false, items: null });
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [playtestSetupOpen, setPlaytestSetupOpen] = useState(false);
  const [playtestGame, setPlaytestGame] = useState(null); // { deck, commander }
  const [dragIndex, setDragIndex] = useState(null);
  // Whether each (card, row-otag) pair carries the tag — for the 33 A
  // consistency check. Keyed "lowername|otag" -> boolean.
  const [tagMembership, setTagMembership] = useState(() => new Map());

  const deckTokens = useDeckTokens(
    [...lookup.values()].map((v) => v.card)
  );

  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const tagMembershipRef = useRef(tagMembership);
  tagMembershipRef.current = tagMembership;

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ commander, plan, targets, slots, subDecks, activeIdx })
      );
    } catch {
      // storage full/unavailable: persistence is best-effort
    }
  }, [commander, plan, targets, slots, subDecks, activeIdx]);

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

  // Role targets: set/clear a category's desired slot count (0/blank removes it).
  function setTarget(tag, count) {
    setTargets((prev) => {
      const next = { ...prev };
      if (count > 0) next[tag] = count;
      else delete next[tag];
      return next;
    });
  }

  // How many role targets the plan (slots carrying that tag) falls short of.
  const unmetTargets = Object.entries(targets).filter(
    ([tag, n]) => n > 0 && slots.filter((s) => s.tag.trim() === tag).length < n
  ).length;

  // Resolved cards across every sub-deck (plus the commander) for the stats.
  const statCards = useMemo(
    () => [
      ...(commanderCard ? [commanderCard] : []),
      ...subDecks.flatMap((sd) =>
        sd.cards
          .map((n) => lookup.get(n.trim().toLowerCase())?.card)
          .filter(Boolean)
      ),
    ],
    [commanderCard, subDecks, lookup]
  );

  // Rendered in both the commander-picker and workspace steps.
  const importModal = importOpen && (
    <ImportModal onImport={importBrew} onClose={() => setImportOpen(false)} />
  );

  // Resolve oracle-tag membership for the 33 A consistency check: for every
  // filled cell in a row that has a mapped tag, ask Scryfall (once, cached)
  // whether that card actually carries the tag.
  const tagPairs = [];
  slots.forEach((slot, i) => {
    const otag = tagForCategory(slot.tag);
    if (!otag) return;
    subDecks.forEach((sd) => {
      const name = sd.cards[i].trim();
      if (name) tagPairs.push({ name, otag, key: `${name.toLowerCase()}|${otag}` });
    });
  });
  const tagPairsKey = [...new Set(tagPairs.map((p) => p.key))].sort().join(";");
  useEffect(() => {
    const missing = [
      ...new Map(
        tagPairs
          .filter((p) => !tagMembershipRef.current.has(p.key))
          .map((p) => [p.key, p])
      ).values(),
    ];
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (p) => [p.key, await hasOracleTag(p.name, p.otag)])
    ).then((results) => {
      if (cancelled) return;
      setTagMembership((prev) => {
        const next = new Map(prev);
        for (const [k, v] of results) if (v != null) next.set(k, v);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagPairsKey]);

  // How a 33 B/33 C cell diverges from the 33 A "main" card in the same row:
  // mana value, primary card type, and (via Scryfall) whether it carries the
  // row's oracle tag. Returns [] for the main column and unresolved cells.
  function divergenceReasons(rowIdx, subIdx) {
    if (subIdx === 0) return [];
    const nameA = subDecks[0].cards[rowIdx].trim();
    const nameX = subDecks[subIdx].cards[rowIdx].trim();
    const cardA = nameA ? lookup.get(nameA.toLowerCase())?.card : null;
    const cardX = nameX ? lookup.get(nameX.toLowerCase())?.card : null;
    if (!cardA || !cardX) return [];

    const reasons = [];
    if (cardManaValue(cardX) !== cardManaValue(cardA)) reasons.push("mana value");
    if (cardPrimaryType(cardX) !== cardPrimaryType(cardA)) reasons.push("card type");
    const otag = tagForCategory(slots[rowIdx].tag);
    if (otag) {
      const membA = tagMembership.get(`${nameA.toLowerCase()}|${otag}`);
      const membX = tagMembership.get(`${nameX.toLowerCase()}|${otag}`);
      if (membA != null && membX != null && membA !== membX) reasons.push("tag");
    }
    return reasons;
  }

  const divergentCount = slots.reduce(
    (n, _slot, i) =>
      n +
      subDecks.filter((_sd, si) => divergenceReasons(i, si).length > 0).length,
    0
  );

  function setCard(subIdx, slot, name) {
    setSubDecks((prev) =>
      prev.map((sd, si) =>
        si === subIdx
          ? { ...sd, cards: sd.cards.map((c, i) => (i === slot ? name : c)) }
          : sd
      )
    );
  }

  // Card and tag commits both apply immediately, with no warning — the
  // consistency check below flags divergent cells live.
  function commitCard(subIdx, slot, name) {
    if (name === subDecks[subIdx].cards[slot]) return;
    setCard(subIdx, slot, name);
  }

  function commitTag(slot, newTag) {
    setSlots((prev) => prev.map((s, i) => (i === slot ? { ...s, tag: newTag } : s)));
  }

  function updateNote(slot, note) {
    setSlots((prev) => prev.map((s, i) => (i === slot ? { ...s, note } : s)));
  }

  function selectCell(subIdx, slot) {
    setActiveIdx(subIdx);
    setActiveRow(slot);
  }

  // Move a whole slot row (its shared tag/note plus every sub-deck's card at
  // that row) to a new position, keeping the active row pinned to it.
  function moveRow(from, to) {
    if (from == null || to == null || from === to) return;
    setSlots((prev) => reorder(prev, from, to));
    setSubDecks((prev) =>
      prev.map((sd) => ({ cards: reorder(sd.cards, from, to) }))
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

  // Live reorder: as the pointer crosses another row, move the dragged row
  // there immediately so the list visibly shifts under the cursor.
  function handleRowDragOver(e, i) {
    if (dragIndex == null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (i !== dragIndex) {
      moveRow(dragIndex, i);
      setDragIndex(i);
    }
  }

  function endRowDrag() {
    setDragIndex(null);
  }

  function clearAll() {
    if (filledCount && !window.confirm("Clear the whole deck?")) return;
    setCommander("");
    setPlan("");
    setTargets({});
    setSlots(emptySlots());
    setSubDecks(emptySubDecks());
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

  // Load a brew parsed from the Brewer sub-deck format, replacing the current
  // one and re-resolving card data.
  function importBrew({
    commander: cmdr,
    plan: newPlan,
    targets: newTargets,
    slots: newSlots,
    subDecks: newSubs,
  }) {
    setCommander(cmdr ?? "");
    setPlan(newPlan ?? "");
    setTargets(newTargets ?? {});
    setSlots(withSlotIds(newSlots));
    setSubDecks(padSubDecks(newSubs));
    setActiveIdx(0);
    setActiveRow(null);
    setError(null);
    setLookup(new Map());
    setTagMembership(new Map());
    setStrip({ loading: false, items: null });
    setImportOpen(false);
    setStep("workspace");
  }

  function takeSuggestion(name, subIdx) {
    if (activeRow == null) return;
    commitCard(subIdx, activeRow, name);
  }

  if (step === "commander") {
    return (
      <>
        <CommanderPicker
          commander={commander}
          onCommit={setCommander}
          onLookUp={() => commander.trim() && setStep("workspace")}
          onImport={() => setImportOpen(true)}
        />
        {importModal}
      </>
    );
  }

  return (
    <div className="brew">
      <div className="brew-workspace">
        <WorkspaceHeader
          commander={commander}
          commanderCard={commanderCard}
          totalPlaced={filledCount}
          totalSlots={totalSlots}
          onChangeCommander={() => setStep("commander")}
          onPlaytest={() => setPlaytestSetupOpen(true)}
          onExport={() => setExportOpen(true)}
          onImport={() => setImportOpen(true)}
          onClear={clearAll}
        />

        <GamePlan plan={plan} onChange={setPlan} />

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
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot, i) => (
                  <Fragment key={slot.id}>
                    <tr
                      className={[
                        activeRow === i ? "active-row" : "",
                        dragIndex === i ? "dragging" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDragOver={(e) => handleRowDragOver(e, i)}
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
                          onDragEnd={endRowDrag}
                        >
                          ⠿
                        </span>
                        <span className="row-num">{i + 1}</span>
                      </td>
                      <td className="tag-cell-td">
                        <TagSelect
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
                          divergence={divergenceReasons(i, si)}
                          active={si === activeIdx}
                          duplicate={duplicateNames.has(
                            sd.cards[i].trim().toLowerCase()
                          )}
                          entry={lookup.get(sd.cards[i].trim().toLowerCase())}
                          onSelect={() => selectCell(si, i)}
                          onCommit={(name) => commitCard(si, i, name)}
                        />
                      ))}
                    </tr>
                    {activeRow === i && (
                      <tr className="sugg-row">
                        <td colSpan={3 + subDecks.length}>
                          <SuggestionStrip
                            sourceName={sourceName}
                            sourceCard={sourceCard}
                            queryHint={queryHintForCategory(slots[i].tag)}
                            subDeckNames={SUB_DECK_NAMES.slice(0, subDecks.length)}
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
            divergentCount={divergentCount}
            unmetTargets={unmetTargets}
          />
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          Lookup failed: {error}
        </p>
      )}

      <CompositionSummary
        slots={slots}
        subDecks={subDecks}
        lookup={lookup}
        targets={targets}
        onSetTarget={setTarget}
      />

      <DeckStats cards={statCards} />

      {exportOpen && (
        <ExportModal
          commander={commander}
          plan={plan}
          targets={targets}
          slots={slots}
          subDecks={subDecks}
          subDeckNames={SUB_DECK_NAMES}
          onClose={() => setExportOpen(false)}
        />
      )}

      {importModal}

      {playtestSetupOpen && (
        <PlaytestSetupModal
          commander={commander}
          commanderCard={commanderCard}
          subDecks={subDecks}
          subDeckNames={SUB_DECK_NAMES}
          lookup={lookup}
          onStart={(game) => {
            setPlaytestGame(game);
            setPlaytestSetupOpen(false);
          }}
          onClose={() => setPlaytestSetupOpen(false)}
        />
      )}

      {playtestGame && (
        <Playtest
          deck={playtestGame.deck}
          commander={playtestGame.commander}
          tokens={deckTokens}
          onClose={() => setPlaytestGame(null)}
        />
      )}
    </div>
  );
}

// Pick which sub-decks to goldfish (all by default), then start the
// simulator with those cards + the commander.
function PlaytestSetupModal({
  commander,
  commanderCard,
  subDecks,
  subDeckNames,
  lookup,
  onStart,
  onClose,
}) {
  const [selected, setSelected] = useState(
    () => new Set(subDecks.map((_, si) => si))
  );

  const toggle = (si) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(si)) next.delete(si);
      else next.add(si);
      return next;
    });

  const deck = subDecks.flatMap((sd, si) =>
    selected.has(si)
      ? sd.cards
          .map((c) => c.trim())
          .filter(Boolean)
          .map((name) => ({
            name,
            card: lookup.get(name.toLowerCase())?.card ?? null,
          }))
      : []
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal export-modal"
        role="dialog"
        aria-label="Playtest setup"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Playtest</h3>
        <p>Pick which sub-decks to shuffle up, then goldfish the deck.</p>

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
        </div>

        <div className="actions">
          <span className="hint export-count">
            {deck.length} {deck.length === 1 ? "card" : "cards"}
            {commander.trim() ? ` + ${commander}` : ""}
          </span>
          <button type="button" className="preset" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="submit"
            disabled={!deck.length}
            onClick={() =>
              onStart({
                deck,
                commander: commander.trim()
                  ? { name: commander, card: commanderCard }
                  : null,
              })
            }
          >
            Start Playtest
          </button>
        </div>
      </div>
    </div>
  );
}

// Export the selected sub-deck(s) to a Moxfield-importable decklist. Every
// sub-deck is selected by default (the whole 99-card deck); untick some to
// export one or a subset of the 33-card sub-decks.
function ExportModal({ commander, plan, targets, slots, subDecks, subDeckNames, onClose }) {
  const [selected, setSelected] = useState(() =>
    new Set(subDecks.map((_, si) => si))
  );
  const [includeCommander, setIncludeCommander] = useState(true);
  const [format, setFormat] = useState("moxfield"); // "moxfield" | "brew"
  const [copied, setCopied] = useState(false);

  const toggle = (si) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(si)) next.delete(si);
      else next.add(si);
      return next;
    });

  const selectedIdx = subDecks.map((_, si) => si).filter((si) => selected.has(si));
  const cards = selectedIdx.flatMap((si) => subDecks[si].cards);
  const cardCount = cards.filter((c) => c.trim()).length;

  const cmdr = includeCommander ? commander : "";
  const text =
    format === "brew"
      ? toBrewFormat({
          commander: cmdr,
          plan,
          targets,
          slots,
          subDecks: selectedIdx.map((si) => subDecks[si]),
          subDeckNames: selectedIdx.map((si) => subDeckNames[si]),
        })
      : toMoxfield({ commander, cards, includeCommander });

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
        aria-label="Export deck"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Export</h3>
        <p>
          {format === "brew"
            ? "The Brewer sub-deck format lays the sub-decks side by side and can be re-imported here."
            : "A flat 100-card list to paste into Moxfield."}
        </p>

        <div className="export-format">
          <label className="export-check">
            <input
              type="radio"
              name="export-format"
              checked={format === "moxfield"}
              onChange={() => setFormat("moxfield")}
            />{" "}
            Moxfield (100-card)
          </label>
          <label className="export-check">
            <input
              type="radio"
              name="export-format"
              checked={format === "brew"}
              onChange={() => setFormat("brew")}
            />{" "}
            Brewer sub-decks
          </label>
        </div>

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
          aria-label={format === "brew" ? "Brewer sub-deck list" : "Moxfield decklist"}
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

// Load a brew from the Brewer sub-deck format (the only format import accepts).
function ImportModal({ onImport, onClose }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  function doImport() {
    try {
      onImport(parseBrewFormat(text));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal export-modal"
        role="dialog"
        aria-label="Import brew"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Import a brew</h3>
        <p>
          Paste a list exported in the <strong>Brewer sub-decks</strong> format
          (1–3 sub-decks with an optional commander). This replaces your current
          brew.
        </p>

        <textarea
          className="export-text"
          aria-label="Brew to import"
          rows={10}
          placeholder={"Commander: …\n#\tTag\tNote\t33 A\t33 B\t33 C\n1\tRamp\t\tSol Ring\t…"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="import-error">{error}</p>}

        <div className="actions">
          <button type="button" className="preset" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="submit"
            disabled={!text.trim()}
            onClick={doImport}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

// A slot's tag is one of the known categories or "Custom" — no free text.
function TagSelect({ slotIndex, value, onCommit }) {
  return (
    <select
      className="tag-input tag-select"
      aria-label={`Slot ${slotIndex + 1} tag`}
      value={value}
      onChange={(e) => onCommit(e.target.value)}
    >
      <option value="">Tag…</option>
      {TAG_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function MatrixCell({
  subIdx,
  slot,
  name,
  divergence,
  active,
  duplicate,
  entry,
  onSelect,
  onCommit,
}) {
  const notFound = entry && !entry.card && name.trim() !== "";
  const canonical = entry?.card?.name;
  const renamed =
    canonical && canonical.toLowerCase() !== name.trim().toLowerCase();
  const diverges = divergence.length > 0;

  const classes = ["cell-td"];
  if (active) classes.push("active");
  if (diverges) classes.push("flagged");
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
      {diverges && (
        <div className="cell-note flag-note">
          ⚠ differs from 33 A: {divergence.join(", ")}
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
  subDeckNames,
  strip,
  onTake,
}) {
  const label = (
    <span className="strip-label">
      Similar to <strong>{sourceName || "—"}</strong> (33 A)
      {queryHint && <span className="strip-meta"> · {queryHint}</span>}
      <span className="strip-meta"> · add to any sub-deck</span>
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
            <div className="strip-card-actions">
              {subDeckNames.map((name, si) => (
                <button
                  key={si}
                  type="button"
                  className="take"
                  onClick={() => onTake(card.name, si)}
                >
                  → {name}
                </button>
              ))}
            </div>
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

// A short deck-level thesis — what the deck does across a game. The strategy's
// first step: plan before cards.
function GamePlan({ plan, onChange }) {
  return (
    <div className="game-plan">
      <label className="game-plan-label" htmlFor="game-plan-input">
        Game plan <span className="th-hint">· what this deck does, turn by turn</span>
      </label>
      <textarea
        id="game-plan-input"
        className="game-plan-input"
        rows={2}
        placeholder="e.g. Ramp into the commander by turn 4, grind card advantage, close with evasive damage."
        value={plan}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// The role/quantity status for one tag: how the plan's slot count compares to
// its target. null when no target is set.
function roleStatus(actual, target) {
  if (!(target > 0)) return null;
  if (actual === target) return { cls: "role-met", text: "✓" };
  if (actual < target) return { cls: "role-short", text: `short ${target - actual}` };
  return { cls: "role-over", text: `over ${actual - target}` };
}

function CompositionSummary({ slots, subDecks, lookup, targets, onSetTarget }) {
  // Per tag: how many slots carry it, and how many of those each sub-deck has
  // filled — equal columns mean consistent composition. `targets` adds the
  // plan's desired count per role, so composition becomes a checklist.
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
  // Include roles that have a target but no slots yet — a forward-looking
  // checklist item still short of its goal.
  Object.keys(targets).forEach((tag) => {
    if (!byTag.has(tag)) {
      byTag.set(tag, { slotCount: 0, slotIndexes: [] });
      tagOrder.push(tag);
    }
  });

  const foundCounts = subDecks.map(
    (sd) =>
      sd.cards.filter((c) => lookup.get(c.trim().toLowerCase())?.card).length
  );

  const targetTotal = Object.values(targets).reduce((a, b) => a + b, 0);
  const addable = TAG_OPTIONS.filter((t) => t !== "Custom" && !(t in targets));

  return (
    <div className="detail">
      <h3>Composition &amp; role targets</h3>
      <p className="hint">
        Slots per role vs your target — the plan&apos;s shape. Sub-deck columns
        show cards filled; matching counts mean the sub-decks stay consistent.
      </p>
      <div className="table-wrap">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Role (tag)</th>
              <th>Target</th>
              <th>Slots</th>
              {subDecks.map((_, si) => (
                <th key={si}>{SUB_DECK_NAMES[si]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tagOrder.map((label) => {
              const { slotCount, slotIndexes } = byTag.get(label);
              const untagged = label === "(untagged)";
              const status = roleStatus(slotCount, targets[label]);
              return (
                <tr key={label} className="static-row">
                  <td>{label}</td>
                  <td className="target-cell">
                    {untagged ? (
                      <span className="hint">—</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        className="target-input"
                        aria-label={`${label} target`}
                        value={targets[label] ?? ""}
                        onChange={(e) =>
                          onSetTarget(label, parseInt(e.target.value, 10) || 0)
                        }
                      />
                    )}
                  </td>
                  <td className={status ? status.cls : ""}>
                    {slotCount}
                    {status && <span className="role-flag"> {status.text}</span>}
                  </td>
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
              <td className="target-cell">
                {targetTotal > 0 && (
                  <span className="hint">{targetTotal}/{CARD_COUNT}</span>
                )}
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
      {addable.length > 0 && (
        <select
          className="add-role"
          aria-label="Add a role target"
          value=""
          onChange={(e) => {
            if (e.target.value) onSetTarget(e.target.value, 1);
          }}
        >
          <option value="">+ Add role target…</option>
          {addable.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default DeckBrewer;
