import { cardColorIdentity } from "./scryfall";

// Color-identity pip colors (design tokens); R isn't in the handoff, so use a
// muted MTG red. Colorless shows a single grey pip.
const PIP_COLORS = {
  W: "#f7f0d8",
  U: "#4a7fd0",
  B: "#3a3a3a",
  R: "#c0564a",
  G: "#5a9e63",
};

function ColorPips({ commanderCard }) {
  if (!commanderCard) return null;
  const identity = cardColorIdentity(commanderCard); // "WUBG" order
  const colors = identity ? [...identity] : ["C"];
  return (
    <span className="ci-pips" aria-label={`Color identity ${identity || "colorless"}`}>
      {colors.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className="ci-pip"
          style={{ background: PIP_COLORS[c] ?? "#888" }}
        />
      ))}
    </span>
  );
}

/**
 * Workspace header bar: commander lockup + live color-identity pips on the
 * left; cards-placed counter and commander/clear actions on the right.
 */
function WorkspaceHeader({
  commander,
  commanderCard,
  totalPlaced,
  totalSlots,
  onChangeCommander,
  onPlaytest,
  onExport,
  onClear,
}) {
  return (
    <div className="ws-header">
      <div className="ws-commander">
        <span className="brand-tile lg" aria-hidden="true">
          ⚔
        </span>
        <div>
          <div className="ws-commander-name">{commander}</div>
          <div className="ws-commander-sub">
            Commander · color identity
            <ColorPips commanderCard={commanderCard} />
          </div>
        </div>
      </div>
      <div className="ws-actions">
        <div className="ws-counter">
          <div className="ws-count">
            {totalPlaced}
            <span className="ws-count-total"> / {totalSlots}</span>
          </div>
          <div className="ws-count-label">cards placed</div>
        </div>
        <button type="button" className="ws-secondary" onClick={onPlaytest}>
          ▶ Playtest
        </button>
        <button type="button" className="ws-secondary" onClick={onExport}>
          Export
        </button>
        <button type="button" className="ws-secondary" onClick={onChangeCommander}>
          Change commander
        </button>
        <button type="button" className="link-btn ws-clear" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}

export default WorkspaceHeader;
