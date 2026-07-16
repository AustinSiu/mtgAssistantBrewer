import CardNameInput from "./CardNameInput";

/**
 * Entry screen: pick a commander (which sets the deck's color identity) before
 * opening the workspace. A centered single column, matching the design's
 * brand lockup + intro + autocomplete + primary action.
 */
function CommanderPicker({ commander, onCommit, onLookUp }) {
  const ready = commander.trim() !== "";
  return (
    <div className="brew-picker">
      <div className="brand">
        <span className="brand-tile" aria-hidden="true">
          ⚔
        </span>
        <span className="brand-name">Deck Brewer</span>
      </div>
      <p className="brand-intro">
        Pick your commander to set the deck's color identity, then build three
        consistent 33-card sub-decks into a 99-card deck.
      </p>

      <label className="picker-label" htmlFor="commander">
        Commander <span className="required">*</span>
      </label>
      <CardNameInput
        id="commander"
        ariaLabel="Commander"
        placeholder="Search a legendary creature…"
        value={commander}
        onCommit={onCommit}
      />

      <button
        type="button"
        className="submit look-up"
        disabled={!ready}
        onClick={onLookUp}
      >
        Look Up Cards →
      </button>
    </div>
  );
}

export default CommanderPicker;
