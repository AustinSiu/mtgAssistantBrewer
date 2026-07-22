# The 33-Card Sub-Deck Strategy

The deck-building philosophy this project exists to support. Every Deck Brewer
feature should serve this strategy; when a design decision is ambiguous, this
document is the tie-breaker.

> **Origin.** Synthesized from Brother Frog's video *"The 33-Card Commander
> Deck"* (the "base deck" method). The idea grew out of a discussion about
> mathematically sound deck templates and what Commander players miss by never
> playing 40-card limited formats.

---

## The core thesis

Build a Commander deck as **one focused 33-card deck**, tuned until it does its
job perfectly — then **replicate it, as faithfully as possible, into two more
33-card decks**. Together with the commander, the three ~33-card slices
reconstitute a full 100-card deck:

```
1 commander  +  3 × 33 cards  =  100
```

You draw roughly **a third** of your deck in an average game, so a single
33-card slice is a good model of "what one game actually looks like." Tune the
slice, and you've tuned the game.

---

## Why fewer cards (the rationale)

Small formats (draft, pre-release, 40-card limited) teach deck-building lessons
that Commander lets you skip, because a small deck **gives you nowhere to hide**:

- **Low flexibility forces focus.** With little real estate, every card must
  earn its slot. The deck has to be built around a specific, coherent plan.
- **Every card is high-impact.** There is no 60-card bulk and there are no extra
  mulligans to paper over a bad curve, thin card advantage, or too few lands —
  you feel each weakness *immediately and constantly.*
- **Reliability beats randomness.** Players think they want randomness; what they
  actually want is *uniqueness* — to reliably do their cool, silly-goose thing.
  A powerful interaction only counts if it happens **consistently**, not once a
  year. "Be a goose reliably, not a pigeon."

Shrinking the problem also makes deck-building **tangible instead of esoteric**,
especially for newer players, and makes a new concept **fast to test** —
goldfishing or a trial run across 33 cards, with far less variance, shows you how
the core plan really plays out.

---

## Core tenets

1. **Plan before cards.** Decide what the deck should *do* across a game before
   you pick a single card.
2. **Roles and quantities, not names.** Translate the plan into a checklist of
   *functional roles* with target counts (e.g. "3 sources of card draw", "3
   single-target removal", "1 board wipe"). Names come last.
3. **One canonical slice (33 A).** Perfect a single 33-card deck first. It is the
   source of truth the other slices imitate.
4. **Replicate, don't diverge.** The second and third slices should mirror the
   first slot-for-slot in *role* — same tag, similar mana value, inside the
   commander's color identity. Divergence is a signal to investigate, not a
   default.
5. **Count your themes.** Splitting into slices makes trends countable — exactly
   how many of each effect you run, and therefore how *likely* you are to draw
   one. If you can't count it, you can't rely on it.
6. **Cut the off-plan one-offs.** Good cards that don't serve the core focus are
   still cuts. Prefer the card the plan *needs* (e.g. specific recursion) over a
   generically strong value engine.
7. **Consistency is the deliverable.** The three slices existing to be *the same
   shape* is the whole point — that is what makes the deck reliable.

---

## The process

A repeatable loop for building a new deck **or** auditing one you already own.

1. **State the game plan.** Write, in plain language, what the deck wants to do
   turn by turn — the early game, the mid game, and how it closes.
   *Example (Grixis pseudo-control): hit land drops; two ramp sources to land
   the commander by turn 4–5; build a board over the next few turns; win via
   evasion or by flinging the board.*

2. **Derive the role checklist.** Turn the plan into functional roles with target
   quantities *across the whole game*. See the worked example below.

3. **Build / lay out 33 A.** Fill the canonical slice so it satisfies the
   checklist — including enough lands and ramp to actually cast everything.

4. **Replicate into 33 B and 33 C.** For each slot, find another card that fills
   the same role: same tag, comparable mana value, within color identity.

5. **Read the trends.** With the slices side by side, count each theme and spot
   the uneven splits — the missing land, the extra counterspell you needed, the
   role that only appears in one slice.

6. **Refine.** Cut off-plan one-offs; swap generic value for the specific effect
   the plan calls for; even out the splits. Re-read the checklist.

7. **Test.** Goldfish or play the 33-card slice. Low variance means the core plan
   reveals itself quickly. Feed what you learn back into step 6.

---

## Worked example — the role/quantity checklist

The target *shape* Brother Frog derived for his Sauron spellslinger deck, as an
illustration of step 2's output (yours will differ per deck):

| Role                         | Target count |
| ---------------------------- | -----------: |
| Card draw                    | 3            |
| Spell copy                   | 1            |
| Grow the board (army)        | 1            |
| Fling / reach finisher       | 1            |
| Single-target removal        | 3            |
| Ring-tempt (commander synergy) | 1          |
| Evasion                      | 1            |
| Cost reduction               | 1            |
| Board wipe                   | 1            |
| Counterspell                 | 1            |
| Graveyard recursion          | 1            |
| Lands + ramp                 | enough to power the above |

The point is not these specific numbers — it's that the deck is expressed as a
**countable set of roles** you can check each slice against.

---

## How this maps to the app

The Deck Brewer *is* this methodology made interactive. Each mechanic traces to a
tenet above:

- **Commander + up to 3 × 33-card sub-decks on a shared slot skeleton** — the
  core thesis (tenet 3, 4). One deck, replicated.
- **Per-slot `tag` + free-form `note`** — roles-not-names (tenet 2). The tag is
  the functional role; the note is the plan intent for that slot.
- **33 A drives per-slot alternatives** (same tag, same mana value, in color
  identity) — replicate-don't-diverge (tenet 4). 33 A is canonical (tenet 3).
- **Change-warnings / amber flags** when a tag or card no longer fits its
  row-mates — surfacing divergence to investigate (tenet 4).
- **Composition-by-tag summary** comparing sub-decks side by side — count your
  themes; spot uneven splits (tenet 5).
- **Commander-singleton enforcement across slices** (basics exempt) — keeps the
  three slices legal replicas of one deck.
- **Deck Stats (mana curve, symbol/production breakdown)** — the "feel the curve
  and mana base immediately" discipline of small decks (rationale).
- **Land Draw / hypergeometric calculator** — makes "how likely am I to draw
  this role?" quantitative (tenet 5, reliability).

## Product principles for new features

When proposing or evaluating a Deck Brewer feature, check it against these:

1. **Does it strengthen focus and reliability, or just add options?** Prefer
   features that make the plan clearer and the draw more consistent.
2. **Does it think in roles/quantities?** Features should reason about
   *functional composition* (tags, counts, curve), not just individual cards.
3. **Does it keep 33 A canonical and the slices consistent?** Anything that
   compares slices, or helps a slice imitate 33 A, is on-strategy.
4. **Does it make trends countable?** Surfacing "how many of X, how likely to
   draw X" is core, not nice-to-have.
5. **Does it lower the deck-building barrier?** Making the problem smaller and
   more tangible — especially for newer players — is a first-class goal.
6. **Does it respect the player's weird plan?** Optimize for *this* player's
   silly-goose idea and its reliability, not for a globally "correct" list
   (see the README's Goal).

If a proposed feature doesn't clearly serve at least one of these — and doesn't
work against any — reconsider it.
