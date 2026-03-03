/**
 * Hypergeometric distribution calculator for MTG land draws.
 *
 * PMF: P(X = k) = C(K, k) * C(N-K, n-k) / C(N, n)
 *   N = deck size
 *   K = total lands in deck
 *   n = cards drawn
 *   k = lands drawn
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

export function expectedValue(N, K, n) {
  return (n * K) / N;
}

export function landProbabilities(N, K, n) {
  const max = Math.min(n, K);
  const probs = [];
  for (let k = 0; k <= max; k++) {
    probs.push(hypergeometricPmf(k, N, K, n));
  }
  return probs;
}

export function cumulativeAtLeast(probs, threshold) {
  let sum = 0;
  for (let i = threshold; i < probs.length; i++) sum += probs[i];
  return sum;
}

export function calculateDrawSteps(deckSize, lands, handSize = 7, turns = 10) {
  const steps = [];

  for (let turn = 0; turn <= turns; turn++) {
    const cardsSeen = handSize + turn;
    if (cardsSeen > deckSize) break;

    const label = turn === 0 ? "Opening Hand" : `Turn ${turn}`;
    const ev = expectedValue(deckSize, lands, cardsSeen);
    const probs = landProbabilities(deckSize, lands, cardsSeen);
    const p0 = probs[0] || 0;

    steps.push({ label, cardsSeen, ev, probs, p0 });
  }

  return steps;
}
