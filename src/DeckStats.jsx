import { useMemo } from "react";
import { brewStats } from "./brewStats";
import { WUBRGC, COLOR_HEX, COLOR_NAME } from "./colors";

/**
 * Deck-wide stats below the Brewer workspace: the mana-value curve, plus a
 * per-colour breakdown of mana symbols (share of coloured pips) and how many
 * cards can produce each colour. `cards` is the resolved Scryfall cards.
 */
function DeckStats({ cards }) {
  const s = useMemo(() => brewStats(cards), [cards]);
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
            {WUBRGC.map((c) => {
              const share = c === "C" ? null : pct(s.pips[c], s.totalColorPips);
              return (
                <div key={c} className="color-row">
                  <span
                    className="color-dot"
                    style={{ background: COLOR_HEX[c] }}
                    aria-hidden="true"
                  />
                  <span className="color-name">{COLOR_NAME[c]}</span>
                  <span className="color-bar-track">
                    <span
                      className="color-bar-fill"
                      style={{ width: `${share ?? 0}%`, background: COLOR_HEX[c] }}
                    />
                  </span>
                  <span className="color-pct">
                    {share == null ? "—" : `${share}%`}
                  </span>
                  <span className="color-prod">{s.production[c]} produce</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default DeckStats;
