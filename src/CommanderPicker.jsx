import CardNameInput from "./CardNameInput";

/**
 * Entry screen: pick a commander (which sets the deck's color identity) before
 * opening the workspace. A centered single column, matching the design's
 * brand lockup + intro + autocomplete + primary action.
 */
function CommanderPicker({ commander, onCommit, onLookUp, onImport }) {
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
        Pick a commander to set the color identity, then fill three 33-card
        sub-decks on one shared 33-slot skeleton. Each slot's Tag drives card
        suggestions and the consistency rail keeps your thirds aligned.
      </p>

      <ul className="brew-tenets" aria-label="Deckbuilding tenets">
        <li>
          <strong>Plan ~5 core functions.</strong> You need about 12 copies of
          an effect to see it most games, so a 99-card deck realistically
          supports ~5 roles — build 12–15 cards toward each.
        </li>
        <li>
          <strong>Start from baselines:</strong> ~37 lands · ~10 ramp · ~10
          card draw · ~8–10 removal, then tune to your commander.
        </li>
        <li>
          <strong>Consistency beats spice.</strong> Three sub-decks on the same
          slots keep every build's shape aligned.
        </li>
      </ul>

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

      {onImport && (
        <button type="button" className="link-btn picker-import" onClick={onImport}>
          or import a saved brew
        </button>
      )}
    </div>
  );
}

export default CommanderPicker;
