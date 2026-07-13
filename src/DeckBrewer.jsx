import { Fragment, useState } from "react";
import CardNameInput from "./CardNameInput";
import {
  lookupCollection,
  lookupFuzzy,
  rateLimitDelay,
  cardManaCost,
  cardTypeLine,
  cardColorIdentity,
  cardManaValue,
  searchCards,
} from "./scryfall";

export const CARD_COUNT = 33;

// Map user-facing categories to Scryfall functional oracle tags
const CATEGORY_TO_TAG = {
  Ramp: "ramp",
  "Mana Rock": "mana-rock",
  "Card Draw": "card-draw",
  Tutor: "tutor",
  Removal: "targeted-removal",
  "Board Wipe": "board-wipe",
  Counterspell: "counterspell",
  Protection: "protection",
  "Token Generator": "token-generator",
  Reanimation: "reanimation",
  "Grave Hate": "grave-hate",
  Blink: "blink",
  "Cost Reducer": "cost-reducer",
  Aristocrat: "aristocrat",
  Anthem: "anthem",
};

const CATEGORY_SUGGESTIONS = Object.keys(CATEGORY_TO_TAG);

// Case-insensitive category → tag lookup so "ramp" works as well as "Ramp".
const TAG_BY_CATEGORY = new Map(
  Object.entries(CATEGORY_TO_TAG).map(([label, tag]) => [
    label.toLowerCase(),
    tag,
  ])
);

const emptyRows = () =>
  Array.from({ length: CARD_COUNT }, () => ({ name: "", category: "" }));

function DeckBrewer() {
  const [commander, setCommander] = useState("");
  const [rows, setRows] = useState(emptyRows);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [commanderCard, setCommanderCard] = useState(null);

  const filledCount = rows.filter((row) => row.name.trim()).length;

  function updateRow(index, field, value) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function clearAll() {
    setCommander("");
    setRows(emptyRows());
    setResults(null);
    setStatus("idle");
    setError(null);
    setCommanderCard(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const filled = rows
      .map((row, index) => ({
        index,
        name: row.name.trim(),
        category: row.category.trim(),
      }))
      .filter((row) => row.name);
    if (filled.length === 0 || !commander.trim()) return;

    setStatus("loading");
    setError(null);
    setResults(null);

    try {
      // Look up the commander to get its color identity.
      let ciFilter = "";
      const cmdCard = await lookupFuzzy(commander.trim());
      setCommanderCard(cmdCard);
      if (cmdCard) {
        // A colorless commander still restricts the deck to id<=c.
        ciFilter = ` id<=${cardColorIdentity(cmdCard) || "c"}`;
      }

      const { data = [], not_found: notFound = [] } = await lookupCollection(
        filled.map((row) => row.name)
      );

      // `data` preserves request order for the names that were found, so
      // walk the requested rows and consume it as a queue.
      const missed = new Set(notFound.map((id) => id.name.toLowerCase()));
      const queue = [...data];
      const matched = filled.map((row) => {
        if (missed.has(row.name.toLowerCase())) {
          return { ...row, card: null, matchType: "none" };
        }
        return { ...row, card: queue.shift() ?? null, matchType: "exact" };
      });

      // Retry misses with fuzzy matching (catches typos), one at a time to
      // respect Scryfall's rate-limit guidance.
      for (const entry of matched) {
        if (entry.card) continue;
        await rateLimitDelay();
        const card = await lookupFuzzy(entry.name);
        if (card) {
          entry.card = card;
          entry.matchType = "fuzzy";
        }
      }

      // For each tagged card, fetch up to 3 alternatives: same functional
      // tag, same mana value, inside the commander's color identity.
      // Identical queries are only fetched once, and cards already in the
      // deck are not suggested.
      const deckNames = new Set(
        matched.filter((e) => e.card).map((e) => e.card.name.toLowerCase())
      );
      const searchCache = new Map();
      for (const entry of matched) {
        if (!entry.card) continue;
        const tag = TAG_BY_CATEGORY.get(entry.category.toLowerCase());
        if (!tag) continue;

        const mv = cardManaValue(entry.card);
        const query = `otag:${tag} mv:${mv}${ciFilter} order:edhrec`;
        if (!searchCache.has(query)) {
          await rateLimitDelay();
          const { data: found = [] } = await searchCards(query);
          searchCache.set(query, found);
        }
        entry.similarCards = searchCache
          .get(query)
          .filter((s) => !deckNames.has(s.name.toLowerCase()))
          .slice(0, 3);
      }

      setResults(matched);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <div>
      <h1>Deck Brewer</h1>
      <p className="subtitle">
        Pick your commander, then enter up to {CARD_COUNT} cards — a third of
        the deck — tagging each with a category. Card names autocomplete from
        Scryfall; only suggested names can be saved. Submitting looks every
        card up on Scryfall.
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
              Color identity: <strong>{cardColorIdentity(commanderCard) || "C"}</strong>
            </p>
          )}
        </div>

        <div className="deck-grid">
          {rows.map((row, i) => (
            <div className="deck-row" key={i}>
              <span className="row-num">{i + 1}</span>
              <CardNameInput
                ariaLabel={`Card ${i + 1} name`}
                placeholder="Card name"
                value={row.name}
                onCommit={(name) => updateRow(i, "name", name)}
                disabled={status === "loading"}
              />
              <input
                type="text"
                className="card-category"
                list="category-suggestions"
                placeholder="Category"
                aria-label={`Card ${i + 1} category`}
                value={row.category}
                onChange={(e) => updateRow(i, "category", e.target.value)}
              />
            </div>
          ))}
        </div>
        <datalist id="category-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="form-actions">
          <span className="hint">
            {filledCount} of {CARD_COUNT} cards entered
            {!commander.trim() && " — commander required"}
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
            disabled={
              filledCount === 0 || !commander.trim() || status === "loading"
            }
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

      {results && (
        <>
          <CategorySummary results={results} />
          <LookupResults results={results} />
        </>
      )}
    </div>
  );
}

function CategorySummary({ results }) {
  const counts = new Map();
  for (const { category } of results) {
    const key = category || "Uncategorized";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="detail">
      <h3>Category Breakdown ({results.length} cards)</h3>
      <div className="table-wrap">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Count</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([category, count]) => (
              <tr key={category} className="static-row">
                <td>{category}</td>
                <td>{count}</td>
                <td>{((count / results.length) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LookupResults({ results }) {
  const foundCount = results.filter((r) => r.card).length;

  return (
    <>
      <h2>Scryfall Results</h2>
      <p className="hint">
        {foundCount} of {results.length} cards found
      </p>
      <div className="table-wrap">
        <table className="summary-table results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Card</th>
              <th>Mana Cost</th>
              <th>Type</th>
              <th>Category</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <Fragment key={r.index}>
                <tr className="static-row">
                  <td>{r.index + 1}</td>
                  <td>
                    {r.card ? (
                      <a
                        href={r.card.scryfall_uri}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.card.name}
                      </a>
                    ) : (
                      r.name
                    )}
                    {r.matchType === "fuzzy" && (
                      <span className="hint"> (entered: {r.name})</span>
                    )}
                  </td>
                  <td className="mana-cost">
                    {r.card ? cardManaCost(r.card) : ""}
                  </td>
                  <td>{r.card ? cardTypeLine(r.card) : ""}</td>
                  <td>{r.category || <span className="hint">—</span>}</td>
                  <td>
                    {r.card ? (
                      <span className={`badge badge-${r.matchType}`}>
                        {r.matchType === "fuzzy" ? "fuzzy" : "found"}
                      </span>
                    ) : (
                      <span className="badge badge-none">not found</span>
                    )}
                  </td>
                </tr>
                {r.similarCards && (
                  <tr>
                    <td colSpan="6" className="similar-cards-cell">
                      <SimilarCardsDetail similar={r.similarCards} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SimilarCardsDetail({ similar }) {
  return (
    <div className="similar-cards">
      <h4>Similar cards (same tag &amp; mana value)</h4>
      {similar.length > 0 ? (
        <div className="similar-grid">
          {similar.map((card) => (
            <div key={card.id} className="similar-card">
              <a href={card.scryfall_uri} target="_blank" rel="noreferrer">
                {card.name}
              </a>
              <div className="card-details">
                <span className="mana-cost">{cardManaCost(card)}</span>
                <span className="card-type">{cardTypeLine(card)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">No similar cards found with this tag and mana value.</p>
      )}
    </div>
  );
}

export default DeckBrewer;
