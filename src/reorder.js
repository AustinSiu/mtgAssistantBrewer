/** Move an array item from one index to another, returning a new array. */
export function reorder(arr, from, to) {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Where an index ends up after reorder(from, to). */
export function remapIndex(idx, from, to) {
  if (idx === from) return to;
  if (from < to) return idx > from && idx <= to ? idx - 1 : idx;
  return idx >= to && idx < from ? idx + 1 : idx;
}
