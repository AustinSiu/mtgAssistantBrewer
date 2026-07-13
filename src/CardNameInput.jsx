import { useEffect, useRef, useState } from "react";
import { autocompleteCardNames } from "./scryfall";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

/**
 * Card-name field backed by Scryfall autocomplete. Only a name picked from
 * the suggestions (mouse, or ArrowUp/Down + Enter) is committed to the form
 * via onCommit; free text reverts to the last committed value on blur, so
 * the form can never hold a name Scryfall doesn't know. Clearing the field
 * commits "" — an empty row is valid, an invalid name is not.
 */
function CardNameInput({ id, value, onCommit, placeholder, ariaLabel, disabled }) {
  const [draft, setDraft] = useState(value);
  const [suggestions, setSuggestions] = useState(null); // null = nothing fetched
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debounceTimer = useRef(null);
  const requestSeq = useRef(0);

  // Stay in sync when the committed value changes from outside (e.g. Clear).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  function handleChange(e) {
    const text = e.target.value;
    setDraft(text);
    clearTimeout(debounceTimer.current);
    if (text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions(null);
      setOpen(false);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      const names = await autocompleteCardNames(text.trim());
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setSuggestions(names);
      setHighlight(-1);
      setOpen(true);
    }, DEBOUNCE_MS);
  }

  function commit(name) {
    clearTimeout(debounceTimer.current);
    requestSeq.current++; // drop any in-flight fetch
    onCommit(name);
    setDraft(name);
    setSuggestions(null);
    setOpen(false);
  }

  function handleBlur() {
    if (draft.trim() === "") {
      commit("");
      return;
    }
    const match = (suggestions ?? []).find(
      (s) => s.toLowerCase() === draft.trim().toLowerCase()
    );
    if (match) {
      commit(match);
    } else {
      setDraft(value); // revert: unselected free text is not persisted
      setOpen(false);
    }
  }

  function handleKeyDown(e) {
    if (!open || !suggestions?.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(suggestions[highlight >= 0 ? highlight : 0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="autocomplete">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions && (
        <ul className="suggestions" role="listbox">
          {suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <li
                key={s}
                role="option"
                aria-selected={i === highlight}
                className={i === highlight ? "highlighted" : ""}
                // mousedown (not click) so it fires before the input's blur
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(s);
                }}
              >
                {s}
              </li>
            ))
          ) : (
            <li className="no-match" aria-disabled="true">
              No matching card names
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default CardNameInput;
