import { describe, it, expect } from 'vitest';
import {
  hypergeometricPmf,
  expectedValue,
  landProbabilities,
  cumulativeAtLeast,
  calculateDrawSteps,
} from './hypergeometric';

describe('hypergeometricPmf', () => {
  // 60-card deck, 24 lands, 7-card opening hand — verified against Python output
  const N = 60, K = 24, n = 7;

  it('returns 0 for k out of valid range', () => {
    expect(hypergeometricPmf(-1, N, K, n)).toBe(0);
    expect(hypergeometricPmf(8, N, K, n)).toBe(0);
  });

  it('P(0 lands) ≈ 0.0216 for 60/24/7', () => {
    expect(hypergeometricPmf(0, N, K, n)).toBeCloseTo(0.0216, 4);
  });

  it('P(3 lands) ≈ 0.3087 for 60/24/7', () => {
    expect(hypergeometricPmf(3, N, K, n)).toBeCloseTo(0.3087, 4);
  });

  it('P(7 lands) ≈ 0.0009 for 60/24/7', () => {
    expect(hypergeometricPmf(7, N, K, n)).toBeCloseTo(0.0009, 4);
  });

  it('handles edge case: all lands drawn from all-land deck', () => {
    expect(hypergeometricPmf(5, 5, 5, 5)).toBeCloseTo(1.0, 10);
  });

  it('handles edge case: 0 lands in deck', () => {
    expect(hypergeometricPmf(0, 60, 0, 7)).toBeCloseTo(1.0, 10);
    expect(hypergeometricPmf(1, 60, 0, 7)).toBe(0);
  });
});

describe('expectedValue', () => {
  it('E[X] = n * K / N', () => {
    expect(expectedValue(60, 24, 7)).toBeCloseTo(2.8, 10);
  });

  it('100-card deck with 40 lands, 7-card hand', () => {
    expect(expectedValue(100, 40, 7)).toBeCloseTo(2.8, 10);
  });

  it('scales linearly with cards drawn', () => {
    expect(expectedValue(60, 24, 8)).toBeCloseTo(3.2, 10);
    expect(expectedValue(60, 24, 17)).toBeCloseTo(6.8, 10);
  });
});

describe('landProbabilities', () => {
  it('returns correct number of entries', () => {
    const probs = landProbabilities(60, 24, 7);
    expect(probs).toHaveLength(8); // 0 through 7
  });

  it('probabilities sum to ~1.0', () => {
    const probs = landProbabilities(60, 24, 7);
    const sum = probs.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('length is min(n, K) + 1 when K < n', () => {
    const probs = landProbabilities(60, 3, 7);
    expect(probs).toHaveLength(4); // 0 through 3
  });

  it('sum is 1.0 for 100-card commander deck', () => {
    const probs = landProbabilities(100, 37, 7);
    const sum = probs.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

describe('cumulativeAtLeast', () => {
  const probs = landProbabilities(60, 24, 7);

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

  it('P(>= max+1) = 0', () => {
    expect(cumulativeAtLeast(probs, probs.length)).toBe(0);
  });
});

describe('calculateDrawSteps', () => {
  it('returns 11 steps for default 60-card deck (hand + 10 turns)', () => {
    const steps = calculateDrawSteps(60, 24);
    expect(steps).toHaveLength(11);
  });

  it('first step is "Opening Hand" with 7 cards seen', () => {
    const steps = calculateDrawSteps(60, 24);
    expect(steps[0].label).toBe('Opening Hand');
    expect(steps[0].cardsSeen).toBe(7);
  });

  it('subsequent steps are labeled "Turn N"', () => {
    const steps = calculateDrawSteps(60, 24);
    expect(steps[1].label).toBe('Turn 1');
    expect(steps[10].label).toBe('Turn 10');
  });

  it('cards seen increments by 1 each turn', () => {
    const steps = calculateDrawSteps(60, 24);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].cardsSeen).toBe(steps[i - 1].cardsSeen + 1);
    }
  });

  it('stops early when cards seen would exceed deck size', () => {
    const steps = calculateDrawSteps(10, 4, 7, 10);
    expect(steps).toHaveLength(4); // 7, 8, 9, 10 cards
    expect(steps[steps.length - 1].cardsSeen).toBe(10);
  });

  it('opening hand expected value matches', () => {
    const steps = calculateDrawSteps(60, 24);
    expect(steps[0].ev).toBeCloseTo(2.8, 10);
  });

  it('each step includes p0', () => {
    const steps = calculateDrawSteps(60, 24);
    expect(steps[0].p0).toBeCloseTo(0.0216, 4);
  });

  it('respects custom hand size (mulligan to 6)', () => {
    const steps = calculateDrawSteps(60, 24, 6);
    expect(steps[0].cardsSeen).toBe(6);
    expect(steps[0].ev).toBeCloseTo(2.4, 10);
    expect(steps[1].cardsSeen).toBe(7);
  });

  it('produces consistent results across repeated calls (memoization)', () => {
    const a = calculateDrawSteps(60, 24);
    const b = calculateDrawSteps(60, 24);
    expect(a[0].ev).toBe(b[0].ev);
    expect(a[0].p0).toBe(b[0].p0);
    for (let i = 0; i < a[0].probs.length; i++) {
      expect(a[0].probs[i]).toBe(b[0].probs[i]);
    }
  });
});
