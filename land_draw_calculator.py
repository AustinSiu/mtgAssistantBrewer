#!/usr/bin/env python3
"""
MTG Land Draw Calculator

Calculates the expected number of lands and full probability distributions
for your opening hand and each subsequent draw using the hypergeometric
distribution.

Hypergeometric PMF: P(X = k) = C(K, k) * C(N-K, n-k) / C(N, n)
  N = deck size
  K = total lands in deck
  n = number of cards drawn so far
  k = number of lands drawn
"""

import argparse
from math import comb


def hypergeometric_pmf(k: int, N: int, K: int, n: int) -> float:
    """P(X = k) for hypergeometric distribution."""
    if k < max(0, n - (N - K)) or k > min(n, K):
        return 0.0
    return comb(K, k) * comb(N - K, n - k) / comb(N, n)


def expected_value(N: int, K: int, n: int) -> float:
    """Expected number of lands drawn: E[X] = n * K / N."""
    return n * K / N


def land_probabilities(N: int, K: int, n: int) -> list[float]:
    """Full probability distribution P(X = 0), P(X = 1), ..., P(X = min(n, K))."""
    return [hypergeometric_pmf(k, N, K, n) for k in range(min(n, K) + 1)]


def cumulative_at_least(probs: list[float], threshold: int) -> float:
    """P(X >= threshold) from a probability list."""
    return sum(probs[threshold:])


def print_draw_step(label: str, N: int, K: int, n: int) -> None:
    """Print expected value and probability distribution for a draw step."""
    ev = expected_value(N, K, n)
    probs = land_probabilities(N, K, n)

    print(f"\n{'=' * 60}")
    print(f"  {label}  (cards seen: {n})")
    print(f"  Expected lands: {ev:.2f}")
    print(f"{'=' * 60}")
    print(f"  {'Lands':>5}  {'P(exact)':>10}  {'P(>=)':>10}  Distribution")
    print(f"  {'-' * 54}")

    for k, p in enumerate(probs):
        p_at_least = cumulative_at_least(probs, k)
        bar = "#" * int(p * 50)
        print(f"  {k:>5}  {p:>10.4f}  {p_at_least:>10.4f}  {bar}")


def main():
    parser = argparse.ArgumentParser(
        description="MTG Land Draw Calculator (Hypergeometric Distribution)"
    )
    parser.add_argument(
        "-d", "--deck-size", type=int, default=60,
        help="Total cards in deck (default: 60)"
    )
    parser.add_argument(
        "-l", "--lands", type=int, default=24,
        help="Number of lands in deck (default: 24)"
    )
    parser.add_argument(
        "-t", "--turns", type=int, default=10,
        help="Number of turns to simulate after opening hand (default: 10)"
    )
    parser.add_argument(
        "--hand-size", type=int, default=7,
        help="Opening hand size (default: 7)"
    )
    args = parser.parse_args()

    N = args.deck_size
    K = args.lands
    turns = args.turns
    hand = args.hand_size

    if K > N:
        print(f"Error: lands ({K}) cannot exceed deck size ({N})")
        return
    if hand > N:
        print(f"Error: hand size ({hand}) cannot exceed deck size ({N})")
        return

    print(f"\nDeck: {N} cards | Lands: {K} ({K/N*100:.1f}%)")
    print(f"Opening hand: {hand} cards | Turns to calculate: {turns}")

    # Opening hand
    print_draw_step("Opening Hand", N, K, hand)

    # Each subsequent draw
    for turn in range(1, turns + 1):
        cards_seen = hand + turn
        if cards_seen > N:
            break
        print_draw_step(f"Turn {turn} Draw", N, K, cards_seen)

    # Summary table
    print(f"\n{'=' * 60}")
    print("  SUMMARY: Expected Lands by Draw")
    print(f"{'=' * 60}")
    print(f"  {'Draw':>15}  {'Cards Seen':>10}  {'E[Lands]':>10}  {'P(0 lands)':>10}")
    print(f"  {'-' * 50}")

    ev = expected_value(N, K, hand)
    p0 = hypergeometric_pmf(0, N, K, hand)
    print(f"  {'Opening Hand':>15}  {hand:>10}  {ev:>10.2f}  {p0:>10.4f}")

    for turn in range(1, turns + 1):
        cards_seen = hand + turn
        if cards_seen > N:
            break
        ev = expected_value(N, K, cards_seen)
        p0 = hypergeometric_pmf(0, N, K, cards_seen)
        print(f"  {'Turn ' + str(turn):>15}  {cards_seen:>10}  {ev:>10.2f}  {p0:>10.4f}")

    print()


if __name__ == "__main__":
    main()
