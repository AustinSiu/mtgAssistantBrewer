import { useMemo, useState } from "react";
import {
  distribution,
  expectedValue,
  cumulativeAtLeast,
  cumulativeUpTo,
  drawSteps,
  curvePoints,
} from "./hypergeometric";

const DECK_PRESETS = [40, 60, 80, 99, 100];
const COPY_PRESETS = [1, 2, 3, 4, 8, 12];
const DRAW_PRESETS = [
  [7, "hand"],
  [8, "T2"],
  [10, "T4"],
  [13, "T7"],
  [15, ""],
];
const SUCCESS_PRESETS = [1, 2, 3, 4];
const CURVE_MAX = 30;

// Read a shareable state from the URL (?d=&c=&n=&x=&play=), so links like
// ?d=100&c=9&n=9 open pre-filled.
function readParams() {
  const p = new URLSearchParams(window.location.search);
  const int = (k) => {
    const v = parseInt(p.get(k) ?? "", 10);
    return Number.isFinite(v) ? v : null;
  };
  const play = p.get("play");
  return {
    d: int("d"),
    c: int("c"),
    n: int("n"),
    x: int("x"),
    play: play === "0" ? false : play === "1" ? true : null,
  };
}

function HypergeometricCalculator() {
  const init = readParams();
  const [deckSize, setDeckSize] = useState(init.d ?? 100);
  const [copies, setCopiesRaw] = useState(init.c ?? 10);
  const [draws, setDrawsRaw] = useState(init.n ?? 7);
  const [successes, setSuccessesRaw] = useState(init.x ?? 1);
  const [onThePlay, setOnThePlay] = useState(init.play ?? true);
  const [copied, setCopied] = useState(false);

  // Keep every value in a valid range as inputs change.
  function setDeck(value) {
    const n = Math.max(1, Math.floor(Number(value) || 1));
    setDeckSize(n);
    if (copies > n) setCopiesRaw(n);
    if (draws > n) setDrawsRaw(n);
  }
  const setCopies = (v) =>
    setCopiesRaw(Math.min(Math.max(0, Math.floor(Number(v) || 0)), deckSize));
  const setDraws = (v) =>
    setDrawsRaw(Math.min(Math.max(1, Math.floor(Number(v) || 1)), deckSize));
  const setSuccesses = (v) =>
    setSuccessesRaw(Math.max(1, Math.floor(Number(v) || 1)));

  // Effective, clamped values used for every calculation.
  const N = Math.max(1, deckSize);
  const K = Math.min(Math.max(0, copies), N);
  const n = Math.min(Math.max(1, draws), N);
  const X = Math.min(Math.max(1, successes), Math.max(1, Math.min(n, K)));

  const model = useMemo(() => {
    const probs = distribution(N, K, n);
    const pAtLeast = cumulativeAtLeast(probs, X);
    const rows = probs.map((p, k) => ({
      k,
      exact: p,
      cumul: cumulativeUpTo(probs, k),
      success: k >= X,
    }));
    return {
      probs,
      pAtLeast,
      pExact: probs[X] ?? 0,
      pFewer: cumulativeUpTo(probs, X - 1),
      ev: expectedValue(N, K, n),
      rows,
      maxExact: Math.max(...probs),
      steps: drawSteps({ deckSize: N, copies: K, successes: X, onThePlay }),
      curve: curvePoints({ deckSize: N, copies: K, successes: X, maxDraws: CURVE_MAX }),
    };
  }, [N, K, n, X, onThePlay]);

  function copyLink() {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      d: N,
      c: K,
      n,
      x: X,
      play: onThePlay ? "1" : "0",
    }).toString();
    navigator.clipboard?.writeText(url.toString()).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  const pct = (v) => `${(v * 100).toFixed(v >= 0.9995 ? 0 : 1)}%`;
  const pct2 = (v) => `${(v * 100).toFixed(2)}%`;

  return (
    <div className="hyp">
      <div className="hyp-head">
        <h1>Hypergeometric Calculator</h1>
        <p className="subtitle">
          Calculate the exact probability of drawing specific cards from your
          deck. See full distribution tables and turn-by-turn odds.
        </p>
      </div>

      <div className="hyp-grid">
        <aside className="hyp-params">
          <h2 className="panel-title">Parameters</h2>

          <NumberField
            id="deckSize"
            label="Deck Size"
            hint="total cards"
            value={deckSize}
            min={1}
            onChange={setDeck}
            presets={DECK_PRESETS.map((v) => [v, String(v)])}
            active={deckSize}
            onPreset={setDeck}
          />
          <NumberField
            id="copies"
            label="Copies in Deck"
            hint="successes in population"
            value={copies}
            min={0}
            max={deckSize}
            onChange={setCopies}
            presets={COPY_PRESETS.map((v) => [v, String(v)])}
            active={copies}
            onPreset={setCopies}
          />
          <NumberField
            id="draws"
            label="Cards Drawn"
            hint="sample size"
            value={draws}
            min={1}
            max={deckSize}
            onChange={setDraws}
            presets={DRAW_PRESETS.map(([v, tag]) => [v, tag ? `${v} (${tag})` : String(v)])}
            active={draws}
            onPreset={setDraws}
          />
          <NumberField
            id="successes"
            label="Successes Desired"
            hint="at least X"
            value={successes}
            min={1}
            onChange={setSuccesses}
            presets={SUCCESS_PRESETS.map((v) => [v, `${v}+`])}
            active={successes}
            onPreset={setSuccesses}
          />

          <div className="field">
            <label>
              Turn-by-turn table <span className="hint">(who goes first)</span>
            </label>
            <div className="group-toggle play-toggle">
              <button
                type="button"
                className={onThePlay ? "toggle on" : "toggle"}
                onClick={() => setOnThePlay(true)}
              >
                On the play
              </button>
              <button
                type="button"
                className={!onThePlay ? "toggle on" : "toggle"}
                onClick={() => setOnThePlay(false)}
              >
                On the draw
              </button>
            </div>
          </div>

          <div className="how-it-works">
            <h3>How It Works</h3>
            <p>
              The hypergeometric distribution models drawing cards{" "}
              <strong>without replacement</strong> from a finite deck. Unlike
              binomial probability, it accounts for the changing composition of
              your library as you draw.
            </p>
            <p className="formula">
              P(X=k) = C(K,k) · C(N−K, n−k) / C(N,n)
            </p>
            <p>
              Where N = deck size, K = copies in deck, n = cards drawn, k =
              successes.
            </p>
          </div>

          <button type="button" className="preset copy-link" onClick={copyLink}>
            {copied ? "Link copied!" : "Copy Link"}
          </button>
        </aside>

        <section className="hyp-results">
          <h2 className="panel-title">Results</h2>

          <div className="headline">
            <div className="headline-label">
              Probability of drawing <strong>{X} or more</strong>{" "}
              {X === 1 ? "copy" : "copies"}
            </div>
            <div className="headline-value">{pct(model.pAtLeast)}</div>
            <div className="headline-sub">
              {K} {K === 1 ? "copy" : "copies"} in a {N}-card deck, drawing {n}{" "}
              {n === 1 ? "card" : "cards"}
            </div>
          </div>

          <h3 className="section-title">Exact Probabilities</h3>
          <div className="table-wrap">
            <table className="summary-table exact-table">
              <thead>
                <tr>
                  <th>Copies</th>
                  <th className="dist-col">P(X = k)</th>
                  <th className="num-cell">Exact</th>
                  <th className="num-cell">Cumul.</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((r) => (
                  <tr key={r.k} className="static-row">
                    <td>X = {r.k}</td>
                    <td className="bar-cell">
                      <div
                        className={`bar ${r.success ? "" : "muted"}`}
                        style={{
                          width: `${model.maxExact > 0 ? (r.exact / model.maxExact) * 100 : 0}%`,
                        }}
                      />
                    </td>
                    <td className="num-cell strong">{pct2(r.exact)}</td>
                    <td className="num-cell dim">{pct2(r.cumul)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="section-title">Probability by Turn</h3>
          <p className="hint">
            {onThePlay
              ? "On the play — the starting player skips their turn-1 draw (rule 103.8a)."
              : "On the draw — you draw for your first turn."}{" "}
            Cards seen = 7 (opening hand) + turns after the first.
          </p>
          <div className="table-wrap">
            <table className="summary-table turn-table">
              <thead>
                <tr>
                  <th>Turn</th>
                  <th className="num-cell">Cards Seen</th>
                  <th className="num-cell">P(exactly {X})</th>
                  <th className="num-cell">P({X}+)</th>
                  <th className="num-cell">P(0)</th>
                </tr>
              </thead>
              <tbody>
                {model.steps.map((s) => (
                  <tr
                    key={s.turn}
                    className={`static-row ${s.cardsSeen === n ? "selected" : ""}`}
                  >
                    <td>{s.label}</td>
                    <td className="num-cell">{s.cardsSeen}</td>
                    <td className="num-cell">{pct(s.pExact)}</td>
                    <td className="num-cell strong">{pct(s.pAtLeast)}</td>
                    <td className="num-cell dim">{pct(s.p0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="section-title">Probability Curve</h3>
          <p className="hint">P({X}+ copies) as you see more cards from your deck.</p>
          <ProbabilityCurve curve={model.curve} />

          <div className="quick-stats">
            <h3>Quick Stats</h3>
            <div>
              <strong>Expected value:</strong> {model.ev.toFixed(2)}{" "}
              {model.ev === 1 ? "copy" : "copies"} in your sample of {n} cards
            </div>
            <div>
              <strong>P(exactly {X}):</strong> {pct2(model.pExact)}
            </div>
            <div>
              <strong>P(fewer than {X}):</strong> {pct2(model.pFewer)}
            </div>
            <div>
              <strong>P({X} or more):</strong> {pct2(model.pAtLeast)}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// A labelled number input with a row of quick-set preset buttons.
function NumberField({ id, label, hint, value, min, max, onChange, presets, active, onPreset }) {
  return (
    <div className="field hyp-field">
      <label htmlFor={id}>
        {label} {hint && <span className="hint">({hint})</span>}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="preset-row">
        {presets.map(([v, text]) => (
          <button
            key={v}
            type="button"
            className={active === v ? "preset active" : "preset"}
            onClick={() => onPreset(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

// Inline SVG line chart of P(X+) (accent) and P(0) (red dashed) vs cards drawn.
function ProbabilityCurve({ curve }) {
  const W = 600;
  const H = 220;
  const pad = { l: 34, r: 10, t: 10, b: 22 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const maxN = curve.length;
  const xFor = (i) => pad.l + (maxN <= 1 ? 0 : (i / (maxN - 1)) * plotW);
  const yFor = (p) => pad.t + (1 - p) * plotH;

  const line = (key) =>
    curve.map((pt, i) => `${xFor(i)},${yFor(pt[key])}`).join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  // A handful of x labels across the range.
  const xLabelStep = Math.max(1, Math.round(maxN / 10));

  return (
    <div className="curve-wrap">
      <div className="curve-legend">
        <span className="lg atleast">P(X+ copies)</span>
        <span className="lg zero">P(0 copies)</span>
      </div>
      <svg
        className="curve-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Probability curve as cards drawn increases"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              className="curve-grid"
              x1={pad.l}
              x2={W - pad.r}
              y1={yFor(t)}
              y2={yFor(t)}
            />
            <text className="curve-axis" x={pad.l - 6} y={yFor(t) + 3} textAnchor="end">
              {t * 100}%
            </text>
          </g>
        ))}
        {curve.map((pt, i) =>
          (i % xLabelStep === 0 || i === maxN - 1) ? (
            <text
              key={pt.n}
              className="curve-axis"
              x={xFor(i)}
              y={H - 6}
              textAnchor="middle"
            >
              {pt.n}
            </text>
          ) : null
        )}
        <polyline className="curve-line zero" points={line("p0")} />
        <polyline className="curve-line atleast" points={line("pAtLeast")} />
      </svg>
    </div>
  );
}

export default HypergeometricCalculator;
