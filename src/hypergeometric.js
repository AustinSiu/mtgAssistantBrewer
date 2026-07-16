/**
 * Hypergeometric distribution — the exact probability of drawing specific
 * cards from a finite deck without replacement.
 *
 * PMF: P(X = k) = C(K, k) * C(N-K, n-k) / C(N, n)
 *   N = deck size (population)
 *   K = copies in deck (successes in population)
 *   n = cards drawn (sample size)
 *   k = copies drawn (observed successes)
 */

const logFactorialCache = [0, 0]; // logFactorial(0) = logFactorial(1) = 0

function logFactorial(n) {
  if (n < logFactorialCache.length) return logFactorialCache[n];
  let sum = logFactorialCache[logFactorialCache.length - 1];
  for (let i = logFactorialCache.length; i <= n; i++) {
    sum += Math.log(i);
    logFactorialCache[i] = sum;
  }
  return sum;
}

function logComb(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

export function hypergeometricPmf(k, N, K, n) {
  const kMin = Math.max(0, n - (N - K));
  const kMax = Math.min(n, K);
  if (k < kMin || k > kMax) return 0;
  return Math.exp(logComb(K, k) + logComb(N - K, n - k) - logComb(N, n));
}

/** Expected number of successes drawn: E[X] = n * K / N. */
export function expectedValue(N, K, n) {
  return (n * K) / N;
}

/** Full PMF as an array indexed by k, for k = 0 .. min(n, K). */
export function distribution(N, K, n) {
  const max = Math.min(n, K);
  const probs = [];
  for (let k = 0; k <= max; k++) {
    probs.push(hypergeometricPmf(k, N, K, n));
  }
  return probs;
}

/** P(X >= threshold) — the upper tail. */
export function cumulativeAtLeast(probs, threshold) {
  let sum = 0;
  for (let i = threshold; i < probs.length; i++) sum += probs[i];
  return sum;
}

/** P(X <= k) — the lower cumulative (CDF). */
export function cumulativeUpTo(probs, k) {
  let sum = 0;
  for (let i = 0; i <= k && i < probs.length; i++) sum += probs[i];
  return sum;
}

/**
 * Cards seen by a given turn. The opening hand is `handSize` cards; each
 * later turn draws one more, except that a player "on the play" skips their
 * turn-1 draw (rule 103.8a).
 */
export function cardsSeenByTurn(turn, handSize, onThePlay) {
  if (turn === 0) return handSize;
  return handSize + (onThePlay ? turn - 1 : turn);
}

/**
 * Turn-by-turn odds. For each turn (0 = opening hand) returns the cards seen
 * and the probability of having drawn exactly / at least `successes` copies,
 * plus the whiff probability P(0). Stops once cards seen exceed the deck.
 */
export function drawSteps({
  deckSize,
  copies,
  handSize = 7,
  onThePlay = true,
  successes = 1,
  turns = 10,
}) {
  const steps = [];
  for (let turn = 0; turn <= turns; turn++) {
    const cardsSeen = cardsSeenByTurn(turn, handSize, onThePlay);
    if (cardsSeen > deckSize) break;
    const probs = distribution(deckSize, copies, cardsSeen);
    steps.push({
      turn,
      label: turn === 0 ? "Opening" : `Turn ${turn}`,
      cardsSeen,
      pExact: probs[successes] ?? 0,
      pAtLeast: cumulativeAtLeast(probs, successes),
      p0: probs[0] ?? 0,
    });
  }
  return steps;
}

/**
 * P(>= successes) and P(0) as the sample size grows from 1 to maxDraws
 * (capped at the deck size) — the data behind the probability curve.
 */
export function curvePoints({ deckSize, copies, successes = 1, maxDraws = 30 }) {
  const points = [];
  const upper = Math.min(maxDraws, deckSize);
  for (let n = 1; n <= upper; n++) {
    const probs = distribution(deckSize, copies, n);
    points.push({
      n,
      pAtLeast: cumulativeAtLeast(probs, successes),
      p0: probs[0] ?? 0,
    });
  }
  return points;
}
