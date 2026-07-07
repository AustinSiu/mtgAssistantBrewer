import { useState, useMemo } from "react";
import { calculateDrawSteps, cumulativeAtLeast } from "./hypergeometric";
import "./App.css";

function App() {
  const [deckSize, setDeckSize] = useState(60);
  const [lands, setLands] = useState(24);
  const [handSize, setHandSize] = useState(7);
  const [expandedStep, setExpandedStep] = useState(null);

  const steps = useMemo(() => {
    if (deckSize < 1 || lands < 0 || lands > deckSize || handSize < 1) return [];
    return calculateDrawSteps(deckSize, lands, handSize);
  }, [deckSize, lands, handSize]);

  function handleDeckSize(value) {
    const n = Math.max(1, Number(value) || 1);
    setDeckSize(n);
    if (lands > n) setLands(n);
  }

  function handlePreset(size) {
    setDeckSize(size);
    if (lands > size) setLands(size);
  }

  function handleLands(value) {
    const n = Math.min(Math.max(0, Number(value) || 0), deckSize);
    setLands(n);
  }

  return (
    <div className="app">
      <h1>MTG Land Draw Calculator</h1>
      <p className="subtitle">Hypergeometric probability distribution</p>

      <div className="form">
        <div className="field">
          <label htmlFor="deckSize">Deck Size</label>
          <div className="input-row">
            <input
              id="deckSize"
              type="number"
              min={1}
              value={deckSize}
              onChange={(e) => handleDeckSize(e.target.value)}
            />
            <button
              className={deckSize === 60 ? "preset active" : "preset"}
              onClick={() => handlePreset(60)}
            >
              60
            </button>
            <button
              className={deckSize === 100 ? "preset active" : "preset"}
              onClick={() => handlePreset(100)}
            >
              100
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="handSize">Hand Size</label>
          <div className="input-row">
            {[7, 6, 5, 4].map((size) => (
              <button
                key={size}
                className={handSize === size ? "preset active" : "preset"}
                onClick={() => setHandSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="lands">
            Lands in Deck
            <span className="hint">
              {deckSize > 0
                ? ` (${((lands / deckSize) * 100).toFixed(1)}%)`
                : ""}
            </span>
          </label>
          <input
            id="lands"
            type="number"
            min={0}
            max={deckSize}
            value={lands}
            onChange={(e) => handleLands(e.target.value)}
          />
        </div>
      </div>

      {steps.length > 0 && (
        <>
          <h2>Expected Lands by Draw</h2>
          <p className="hint">Click a row to see the full probability distribution</p>
          <div className="table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Draw</th>
                  <th>Cards Seen</th>
                  <th>E[Lands]</th>
                  <th>P(0 lands)</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr
                    key={i}
                    className={expandedStep === i ? "selected" : ""}
                    onClick={() =>
                      setExpandedStep(expandedStep === i ? null : i)
                    }
                  >
                    <td>{s.label}</td>
                    <td>{s.cardsSeen}</td>
                    <td>{s.ev.toFixed(2)}</td>
                    <td>{(s.p0 * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {expandedStep !== null && steps[expandedStep] && (
            <DrawDetail step={steps[expandedStep]} />
          )}
        </>
      )}
    </div>
  );
}

function DrawDetail({ step }) {
  const { label, cardsSeen, ev, probs } = step;
  const maxProb = Math.max(...probs);

  return (
    <div className="detail">
      <h3>
        {label} &mdash; {cardsSeen} cards seen &mdash; E[lands] ={" "}
        {ev.toFixed(2)}
      </h3>
      <div className="table-wrap">
        <table className="dist-table">
          <thead>
            <tr>
              <th>Lands</th>
              <th>P(exact)</th>
              <th>P(&ge;)</th>
              <th className="bar-col">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {probs.map((p, k) => {
              const pGe = cumulativeAtLeast(probs, k);
              const barWidth = maxProb > 0 ? (p / maxProb) * 100 : 0;
              return (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{(p * 100).toFixed(2)}%</td>
                  <td>{(pGe * 100).toFixed(2)}%</td>
                  <td className="bar-cell">
                    <div className="bar" style={{ width: `${barWidth}%` }} />
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

export default App;
