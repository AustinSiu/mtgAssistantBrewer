import { cardManaValue, cardTypeLine } from "./scryfall";

/**
 * Right-hand rail summarising deck consistency: a fill bar per sub-deck, a
 * "needs attention" list, and the whole-deck mana-value curve. Everything is
 * derived live from the current matrix state + resolved-card lookup.
 */
function ConsistencyRail({
  slots,
  subDecks,
  subDeckNames,
  accents,
  activeIdx,
  lookup,
  duplicateNames,
  divergentCount,
  unmetTargets = 0,
}) {
  const total = slots.length;
  const resolvedCard = (name) => lookup?.get(name.trim().toLowerCase())?.card;
  const filled = (si) => subDecks[si].cards.filter((c) => c.trim()).length;

  // ---- fill bars ----
  const fillBars = subDecks.map((sd, si) => {
    const count = filled(si);
    return {
      si,
      count,
      total,
      pct: Math.round((count / total) * 100),
      active: si === activeIdx,
      accent: accents[si] ?? "#646cff",
    };
  });

  // ---- needs attention ----
  const attention = [];
  if (duplicateNames.size) {
    attention.push({
      kind: "red",
      dot: "●",
      text: `${duplicateNames.size} duplicate${duplicateNames.size > 1 ? "s" : ""} across sub-decks`,
    });
  }
  let notFound = 0;
  for (const sd of subDecks) {
    for (const name of sd.cards) {
      const key = name.trim().toLowerCase();
      if (key && lookup?.has(key) && !lookup.get(key).card) notFound++;
    }
  }
  if (notFound) {
    attention.push({
      kind: "red",
      dot: "●",
      text: `${notFound} card${notFound > 1 ? "s" : ""} not found on Scryfall`,
    });
  }
  if (divergentCount) {
    attention.push({
      kind: "amber",
      dot: "●",
      text:
        divergentCount === 1
          ? "1 card differs from 33 A"
          : `${divergentCount} cards differ from 33 A`,
    });
  }
  if (unmetTargets) {
    attention.push({
      kind: "amber",
      dot: "●",
      text:
        unmetTargets === 1
          ? "1 role is short of its target"
          : `${unmetTargets} roles are short of target`,
    });
  }
  const emptyActive = total - filled(activeIdx);
  if (emptyActive) {
    attention.push({
      kind: "empty",
      dot: "○",
      text: `${emptyActive} empty slot${emptyActive > 1 ? "s" : ""} in ${subDeckNames[activeIdx]}`,
    });
  }
  if (!attention.length) {
    attention.push({
      kind: "ok",
      dot: "✓",
      text: "All clear — sub-decks are consistent",
    });
  }

  // ---- MV curve (whole deck, excluding lands) ----
  const buckets = Array(7).fill(0); // MV 1..6, 7+
  let sum = 0;
  let n = 0;
  for (const sd of subDecks) {
    for (const name of sd.cards) {
      if (!name.trim()) continue;
      const card = resolvedCard(name);
      if (!card || cardTypeLine(card).includes("Land")) continue;
      const mv = cardManaValue(card);
      buckets[Math.min(Math.max(Math.round(mv), 1), 7) - 1]++;
      sum += mv;
      n++;
    }
  }
  const maxB = Math.max(1, ...buckets);
  const avgMv = n ? (sum / n).toFixed(1) : "0.0";

  return (
    <aside className="ws-rail">
      <div className="rail-heading">Consistency</div>
      <div className="fill-bars">
        {fillBars.map((b) => (
          <div key={b.si} className="fill-bar">
            <div className="fill-bar-top">
              <span>
                {subDeckNames[b.si]}
                {b.active && <span className="fill-active"> active</span>}
              </span>
              <span className="fill-count" style={{ color: b.accent }}>
                {b.count} / {b.total}
              </span>
            </div>
            <div className="fill-track">
              <div
                className="fill-fill"
                style={{ width: `${b.pct}%`, background: b.accent }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="rail-divider" />
      <div className="rail-heading">Needs attention</div>
      <div className="attention">
        {attention.map((a, i) => (
          <div key={i} className="attention-row">
            <span className={`attention-dot ${a.kind}`}>{a.dot}</span>
            <span>{a.text}</span>
          </div>
        ))}
      </div>

      <div className="rail-divider" />
      <div className="rail-heading">
        MV curve <span className="rail-sub">· avg {avgMv}</span>
      </div>
      <div className="mv-curve">
        {buckets.map((v, i) => (
          <div
            key={i}
            className="mv-bar"
            style={{ height: `${Math.max(3, Math.round((v / maxB) * 100))}%` }}
          />
        ))}
      </div>
      <div className="mv-axis">
        {buckets.map((_, i) => (
          <span key={i}>{i === 6 ? "7+" : i + 1}</span>
        ))}
      </div>
    </aside>
  );
}

export default ConsistencyRail;
