import { useEffect, useState } from "react";
import { cardTokenParts, lookupCardsByIds } from "./scryfall";

/**
 * The set of tokens a resolved deck can create, as [{ name, card }] where
 * `card` is the token's Scryfall card (with art). Reads each card's
 * `all_parts` token relations, dedupes, and fetches the token cards once per
 * unique id set. Best-effort — resolves to [] on any fetch failure.
 *
 * `cards` is an array of resolved Scryfall card objects (nulls are ignored).
 */
export function useDeckTokens(cards) {
  const [tokens, setTokens] = useState([]);

  // Unique token ids across the deck, as a stable dependency key.
  const parts = new Map();
  for (const c of cards) {
    for (const p of cardTokenParts(c)) parts.set(p.id, p.name);
  }
  const idKey = [...parts.keys()].sort().join(",");

  useEffect(() => {
    const ids = idKey ? idKey.split(",") : [];
    let cancelled = false;
    // lookupCardsByIds([]) resolves to [] without a request, so the empty case
    // clears tokens through the same async path (no synchronous setState).
    lookupCardsByIds(ids)
      .then((cs) => !cancelled && setTokens(cs.map((c) => ({ name: c.name, card: c }))))
      .catch(() => !cancelled && setTokens([]));
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  return tokens;
}
