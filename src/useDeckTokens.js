import { useEffect, useState } from "react";
import { cardTokenParts, lookupCardsByIds } from "./scryfall";

/**
 * The tokens a resolved deck can create, as [{ name, card }].
 *
 * The *list* comes from each card's `all_parts` token relations, which are
 * reliably present on resolved cards — so tokens always show even if the art
 * lookup fails or is rate-limited. `card` is the token's Scryfall card (for
 * its art), or null when the best-effort art fetch didn't resolve it.
 *
 * `cards` is an array of resolved Scryfall card objects (nulls are ignored).
 */
export function useDeckTokens(cards) {
  // Distinct tokens from all_parts: id -> name. This is the source of truth
  // for *which* tokens exist; it doesn't depend on any network call.
  const parts = new Map();
  for (const c of cards) {
    for (const p of cardTokenParts(c)) parts.set(p.id, p.name);
  }
  const idKey = [...parts.keys()].sort().join(",");

  // Token card art, fetched by id — best-effort enrichment keyed by id.
  const [art, setArt] = useState({});

  useEffect(() => {
    const ids = idKey ? idKey.split(",") : [];
    let cancelled = false;
    // lookupCardsByIds([]) resolves to [] without a request, so the empty case
    // clears art through the same async path (no synchronous setState).
    lookupCardsByIds(ids)
      .then((cs) => {
        if (cancelled) return;
        const next = {};
        for (const c of cs) if (c?.id) next[c.id] = c;
        setArt(next);
      })
      .catch(() => !cancelled && setArt({}));
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  return [...parts].map(([id, name]) => ({ name, card: art[id] ?? null }));
}
