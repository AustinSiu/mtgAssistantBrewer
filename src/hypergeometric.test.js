import { describe, it, expect } from 'vitest';
import {
  hypergeometricPmf,
  expectedValue,
  distribution,
  cumulativeAtLeast,
  cumulativeUpTo,
  cardsSeenByTurn,
  drawSteps,
  curvePoints,
} from './hypergeometric';

describe('hypergeometricPmf', () => {
  // 60-card deck, 24 successes, 7-card sample — verified against Python output
  const N = 60, K = 24, n = 7;

  it('returns 0 for k out of valid range', () => {
    expect(hypergeometricPmf(-1, N, K, n)).toBe(0);
    expect(hypergeometricPmf(8, N, K, n)).toBe(0);
  });

  it('P(0) ≈ 0.0216 for 60/24/7', () => {
    expect(hypergeometricPmf(0, N, K, n)).toBeCloseTo(0.0216, 4);
  });

  it('P(3) ≈ 0.3087 for 60/24/7', () => {
    expect(hypergeometricPmf(3, N, K, n)).toBeCloseTo(0.3087, 4);
  });

  it('matches the scrollvault reference: 100/9/9, P(0) ≈ 0.4120', () => {
    expect(hypergeometricPmf(0, 100, 9, 9)).toBeCloseTo(0.412, 3);
  });

  it('handles edge case: all successes drawn from all-success deck', () => {
    expect(hypergeometricPmf(5, 5, 5, 5)).toBeCloseTo(1.0, 10);
  });

  it('handles edge case: 0 successes in deck', () => {
    expect(hypergeometricPmf(0, 60, 0, 7)).toBeCloseTo(1.0, 10);
    expect(hypergeometricPmf(1, 60, 0, 7)).toBe(0);
  });
});

describe('expectedValue', () => {
  it('E[X] = n * K / N', () => {
    expect(expectedValue(60, 24, 7)).toBeCloseTo(2.8, 10);
  });

  it('100-card deck, 9 copies, 9 draws → 0.81', () => {
    expect(expectedValue(100, 9, 9)).toBeCloseTo(0.81, 10);
  });
});

describe('distribution', () => {
  it('returns min(n, K) + 1 entries summing to ~1.0', () => {
    const probs = distribution(60, 24, 7);
    expect(probs).toHaveLength(8); // 0 through 7
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);
  });

  it('length is min(n, K) + 1 when K < n', () => {
    expect(distribution(60, 3, 7)).toHaveLength(4); // 0 through 3
  });
});

describe('cumulativeAtLeast', () => {
  const probs = distribution(60, 24, 7);

  it('P(>= 0) = 1.0', () => {
    expect(cumulativeAtLeast(probs, 0)).toBeCloseTo(1.0, 10);
  });

  it('P(>= 1) ≈ 0.9784', () => {
    expect(cumulativeAtLeast(probs, 1)).toBeCloseTo(0.9784, 4);
  });

  it('monotonically decreasing', () => {
    for (let k = 1; k < probs.length; k++) {
      expect(cumulativeAtLeast(probs, k)).toBeLessThanOrEqual(
        cumulativeAtLeast(probs, k - 1)
      );
    }
  });
});

describe('cumulativeUpTo', () => {
  const probs = distribution(100, 9, 9);

  it('P(<= 0) equals P(0)', () => {
    expect(cumulativeUpTo(probs, 0)).toBeCloseTo(probs[0], 10);
  });

  it('P(<= k) + P(>= k+1) = 1', () => {
    expect(cumulativeUpTo(probs, 2) + cumulativeAtLeast(probs, 3)).toBeCloseTo(1.0, 10);
  });

  it('reaches 1.0 at the top of the range', () => {
    expect(cumulativeUpTo(probs, probs.length - 1)).toBeCloseTo(1.0, 10);
  });
});

describe('cardsSeenByTurn', () => {
  it('opening hand is handSize cards', () => {
    expect(cardsSeenByTurn(0, 7, true)).toBe(7);
  });

  it('on the play skips the turn-1 draw', () => {
    expect(cardsSeenByTurn(1, 7, true)).toBe(7);
    expect(cardsSeenByTurn(2, 7, true)).toBe(8);
    expect(cardsSeenByTurn(10, 7, true)).toBe(16);
  });

  it('on the draw adds a card every turn', () => {
    expect(cardsSeenByTurn(1, 7, false)).toBe(8);
    expect(cardsSeenByTurn(10, 7, false)).toBe(17);
  });
});

describe('drawSteps', () => {
  it('opens with the hand then one row per turn (on the play)', () => {
    const steps = drawSteps({ deckSize: 100, copies: 9, onThePlay: true });
    expect(steps[0].label).toBe('Opening');
    expect(steps[0].cardsSeen).toBe(7);
    expect(steps[1].label).toBe('Turn 1');
    expect(steps[1].cardsSeen).toBe(7); // no turn-1 draw on the play
    expect(steps[3].cardsSeen).toBe(9);
  });

  it('carries the requested success threshold into the odds', () => {
    const steps = drawSteps({ deckSize: 100, copies: 9, successes: 1, onThePlay: true });
    const turn3 = steps.find((s) => s.cardsSeen === 9);
    expect(turn3.pAtLeast).toBeCloseTo(0.588, 3); // scrollvault: 58.8%
    expect(turn3.p0).toBeCloseTo(0.412, 3);
  });

  it('stops when cards seen would exceed the deck', () => {
    const steps = drawSteps({ deckSize: 10, copies: 4, onThePlay: false });
    expect(steps[steps.length - 1].cardsSeen).toBeLessThanOrEqual(10);
  });
});

describe('curvePoints', () => {
  it('spans 1..min(maxDraws, deckSize) and rises monotonically for P(X+)', () => {
    const pts = curvePoints({ deckSize: 100, copies: 9, successes: 1, maxDraws: 30 });
    expect(pts).toHaveLength(30);
    expect(pts[0].n).toBe(1);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].pAtLeast).toBeGreaterThanOrEqual(pts[i - 1].pAtLeast);
    }
  });

  it('caps at the deck size', () => {
    const pts = curvePoints({ deckSize: 12, copies: 4, maxDraws: 30 });
    expect(pts).toHaveLength(12);
  });
});
