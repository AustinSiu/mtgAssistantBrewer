import { useState } from "react";
import {
  lookupCollection,
  lookupFuzzy,
  rateLimitDelay,
  cardManaCost,
  cardTypeLine,
} from "./scryfall";

export const CARD_COUNT = 33;

// Placeholder suggestions until the real category list is defined.
const CATEGORY_SUGGESTIONS = [
  "Land",
  "Ramp",
  "Card Draw",
  "Removal",
  "Board Wipe",
  "Win Condition",
  "Protection",
  "Synergy",
  "Other",
];

const emptyRows = () =>
  Array.from({ length: CARD_COUNT }, () => ({ name: "", category: "" }));

function DeckBrewer() {
  const [rows, setRows] = useState(emptyRows);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const filledCount = rows.filter((row) => row.name.trim()).length;

  function updateRow(index, field, value) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function clearAll() {
    setRows(emptyRows());
    setResults(null);
    setStatus("idle");
    setError(null);
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
    if (filled.length === 0) return;

    setStatus("loading");
    setError(null);
    setResults(null);

    try {
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
        Enter up to {CARD_COUNT} cards — a third of a Commander deck (excluding
        the commander) — and tag each with a category. Submitting looks every
        card up on Scryfall.
      </p>

      <form className="deck-form" onSubmit={handleSubmit}>
        <div className="deck-grid">
          {rows.map((row, i) => (
            <div className="deck-row" key={i}>
              <span className="row-num">{i + 1}</span>
              <input
                type="text"
                className="card-name"
                placeholder="Card name"
                aria-label={`Card ${i + 1} name`}
                value={row.name}
                onChange={(e) => updateRow(i, "name", e.target.value)}
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
            disabled={filledCount === 0 || status === "loading"}
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
              <tr key={r.index} className="static-row">
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
                <td className="mana-cost">{r.card ? cardManaCost(r.card) : ""}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default DeckBrewer;
