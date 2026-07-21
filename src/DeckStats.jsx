import { brewStats, COLORS } from "./brewStats";

const COLOR_STYLE = {
  W: "#f7f0d8",
  U: "#4a7fd0",
  B: "#5a5a5a",
  R: "#c0564a",
  G: "#5a9e63",
  C: "#9a9a9a",
};
const COLOR_NAME = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

/**
 * Deck-wide stats below the Brewer workspace: the mana-value curve, plus a
 * per-colour breakdown of mana symbols (share of coloured pips) and how many
 * cards can produce each colour. `cards` is the resolved Scryfall cards.
 */
function DeckStats({ cards }) {
  const s = brewStats(cards);
  const maxCurve = Math.max(1, ...s.curve);
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  return (
    <section className="deck-stats" aria-label="Deck stats">
      <h3>Deck Stats</h3>
      <div className="stats-grid">
        <div className="stats-curve">
          <div className="stats-heading">
            Mana curve{" "}
            <span className="stats-sub">
              avg {s.avgMv.toFixed(2)} · {s.nonLand} nonland
            </span>
          </div>
          <div className="curve-bars">
            {s.curve.map((n, mv) => (
              <div key={mv} className="curve-col">
                <div className="curve-track">
                  <div
                    className="curve-bar"
                    style={{ height: `${(n / maxCurve) * 100}%` }}
                  />
                  {n > 0 && <span className="curve-n">{n}</span>}
                </div>
                <div className="curve-x">{mv === 7 ? "7+" : mv}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="stats-colors">
          <div className="stats-heading">Mana symbols &amp; production</div>
          <div className="color-rows">
            {COLORS.map((c) => (
              <div key={c} className="color-row">
                <span
                  className="color-dot"
                  style={{ background: COLOR_STYLE[c] }}
                  aria-hidden="true"
                />
                <span className="color-name">{COLOR_NAME[c]}</span>
                <span className="color-bar-track">
                  <span
                    className="color-bar-fill"
                    style={{
                      width: `${c === "C" ? 0 : pct(s.pips[c], s.totalColorPips)}%`,
                      background: COLOR_STYLE[c],
                    }}
                  />
                </span>
                <span className="color-pct">
                  {c === "C" ? "—" : `${pct(s.pips[c], s.totalColorPips)}%`}
                </span>
                <span className="color-prod">{s.production[c]} produce</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default DeckStats;
