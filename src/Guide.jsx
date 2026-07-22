/**
 * The Guide tab: an in-app illustration of the 33-card sub-deck strategy that
 * the whole tool is built around, so a new user understands *why* the Deck
 * Brewer is shaped the way it is and how to use it. The canonical write-up is
 * docs/33-card-strategy.md — this is its user-facing companion.
 *
 * `onNavigate(tabId)` lets the "jump to" buttons switch tabs.
 */

const TENETS = [
  ["Plan before cards", "Decide what the deck should do across a game before you pick a single card."],
  ["Roles, not names", "Translate the plan into functional roles with target counts — “3 draw”, “3 removal”, “1 wipe”. Names come last."],
  ["One canonical slice", "Perfect a single 33-card deck (33 A). It’s the source of truth the others imitate."],
  ["Replicate, don’t diverge", "The other slices mirror 33 A slot-for-slot in role — same tag, similar mana value, in color identity."],
  ["Count your themes", "Slicing makes trends countable: how many of each effect, and how likely you are to draw one."],
  ["Cut off-plan one-offs", "A strong card that doesn’t serve the core focus is still a cut. Prefer what the plan needs."],
  ["Consistency is the point", "The three slices being the same shape is the whole deliverable — that’s what makes the deck reliable."],
];

const PROCESS = [
  ["State the game plan", "Write, in plain language, what the deck wants to do turn by turn — early, mid, and how it closes.", null],
  ["Derive the role checklist", "Turn the plan into functional roles with target quantities across the whole game.", null],
  ["Build the canonical slice (33 A)", "Fill 33 A so it satisfies the checklist — including enough lands and ramp to cast everything.", "brewer"],
  ["Replicate into 33 B and 33 C", "For each slot, find another card in the same role: same tag, comparable mana value, in color identity.", "brewer"],
  ["Read the trends", "With the slices side by side, count each theme and spot the uneven splits.", "brewer"],
  ["Refine", "Cut off-plan one-offs, swap generic value for the specific effect the plan calls for, even out the splits.", null],
  ["Test", "Goldfish or play a 33-card slice — low variance shows the core plan quickly. Feed it back into Refine.", "brewer"],
];

const WHY = [
  ["Focus", "With little room, every card must earn its slot. The deck has to be built around one coherent plan."],
  ["Impact", "No 60-card bulk or extra mulligans to hide a bad curve, thin draw, or too few lands — you feel it at once."],
  ["Reliability", "You don’t want randomness, you want to reliably do your cool thing. Be a goose reliably, not a pigeon."],
];

const ROLES = [
  ["Card draw", "3"],
  ["Single-target removal", "3"],
  ["Spell copy", "1"],
  ["Board wipe", "1"],
  ["Counterspell", "1"],
  ["Evasion", "1"],
  ["Cost reduction", "1"],
  ["Graveyard recursion", "1"],
  ["Finisher / reach", "1"],
  ["Commander synergy", "1"],
  ["Lands + ramp", "enough"],
];

const TABMAP = [
  [
    "Deck Brewer",
    "brewer",
    "The strategy made interactive: 33 shared slots × up to 3 sub-decks. Tag each slot with its role, write the intent as a note, let 33 A drive same-role alternatives, and compare the slices side by side.",
    "Open the Deck Brewer",
  ],
  [
    "Deck List",
    "list",
    "Paste or review a flat 100-card list, grouped by type or tag, with a mana curve and color breakdown — a bird’s-eye view of the assembled deck.",
    "Open the Deck List",
  ],
  [
    "Hypergeometric Calculator",
    "calculator",
    "Make “how likely am I to draw this role?” quantitative — the math behind counting your themes and hitting land drops.",
    "Open the Calculator",
  ],
];

function Guide({ onNavigate }) {
  return (
    <div className="guide">
      <header className="guide-hero">
        <h1>The 33-Card Deck-Building Strategy</h1>
        <p className="subtitle">
          The philosophy this tool is built around. Perfect one focused 33-card
          deck, then replicate it — as faithfully as you can — two more times.
        </p>
        <div className="guide-eq" aria-label="One commander plus three 33-card sub-decks equals one hundred">
          <span className="guide-eq-part">1 commander</span>
          <span className="guide-eq-op">+</span>
          <span className="guide-eq-part">3 × 33 cards</span>
          <span className="guide-eq-op">=</span>
          <span className="guide-eq-part guide-eq-total">100</span>
        </div>
        <p className="guide-lede">
          You draw roughly <strong>a third</strong> of your deck in an average
          game, so a single 33-card slice models what one game actually looks
          like. Tune the slice, and you’ve tuned the game.
        </p>
      </header>

      <section className="guide-section" aria-labelledby="guide-why">
        <h2 id="guide-why">Why build smaller?</h2>
        <p className="guide-note">
          Small formats — draft, pre-release, 40-card limited — teach lessons
          Commander lets you skip, because a small deck gives you nowhere to hide.
        </p>
        <div className="guide-cards guide-cards-3">
          {WHY.map(([title, body]) => (
            <div key={title} className="guide-card">
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-section" aria-labelledby="guide-tenets">
        <h2 id="guide-tenets">The seven tenets</h2>
        <ol className="guide-tenets">
          {TENETS.map(([title, body], i) => (
            <li key={title} className="guide-tenet">
              <span className="guide-num" aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section" aria-labelledby="guide-process">
        <h2 id="guide-process">The process</h2>
        <p className="guide-note">
          A repeatable loop for building a new deck — or auditing one you already
          own. Steps that this tool helps with are marked.
        </p>
        <ol className="guide-steps">
          {PROCESS.map(([title, body, tab], i) => (
            <li key={title} className="guide-step">
              <span className="guide-num" aria-hidden="true">{i + 1}</span>
              <div className="guide-step-body">
                <h3>{title}</h3>
                <p>{body}</p>
                {tab && (
                  <button
                    type="button"
                    className="guide-jump"
                    onClick={() => onNavigate?.(tab)}
                  >
                    → in the Deck Brewer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-section" aria-labelledby="guide-roles">
        <h2 id="guide-roles">A deck is a set of roles</h2>
        <p className="guide-note">
          Step 2’s output is a checklist of <em>functional roles</em> with target
          counts — not a pile of card names. One example shape (yours will differ
          per deck); the point is that the deck becomes something you can{" "}
          <em>count</em>.
        </p>
        <ul className="guide-roles">
          {ROLES.map(([role, count]) => (
            <li key={role} className="guide-role">
              <span className="guide-role-count">{count}</span>
              <span className="guide-role-name">{role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="guide-section" aria-labelledby="guide-tabs">
        <h2 id="guide-tabs">Using this tool</h2>
        <div className="guide-cards">
          {TABMAP.map(([title, tab, body, cta]) => (
            <div key={tab} className="guide-card">
              <h3>{title}</h3>
              <p>{body}</p>
              <button
                type="button"
                className="guide-cta"
                onClick={() => onNavigate?.(tab)}
              >
                {cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      <footer className="guide-footer">
        <p>
          Full write-up:{" "}
          <a
            href="https://github.com/AustinSiu/mtgAssistantBrewer/blob/main/docs/33-card-strategy.md"
            target="_blank"
            rel="noreferrer"
          >
            docs/33-card-strategy.md
          </a>
          . Methodology synthesized from Brother Frog’s{" "}
          <em>“The 33-Card Commander Deck.”</em>
        </p>
      </footer>
    </div>
  );
}

export default Guide;
