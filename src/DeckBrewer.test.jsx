import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DeckBrewer, { CARD_COUNT } from './DeckBrewer';
import { reorder, remapIndex } from './reorder';
import { clearAutocompleteCache } from './scryfall';
import { clearSimilarCache, clearOtagCache } from './brew';
import { card as mockCard, catalogMatches } from '../test/fixtures';

const ok = (data) => ({ ok: true, json: async () => data });

// Routes fetch calls by URL substring (matched against the decoded URL).
function setupFetch(routes) {
  fetch.mockImplementation(async (url, options = {}) => {
    const decoded = decodeURIComponent(String(url));
    for (const [pattern, respond] of routes) {
      if (decoded.includes(pattern)) return respond(decoded, options);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

const autocompleteRoute = [
  'cards/autocomplete',
  (url) => ok({ data: catalogMatches(url.split('q=')[1]) }),
];

const commanderRoute = [
  'cards/named?fuzzy=Atraxa',
  () => ok(mockCard("Atraxa, Praetors' Voice", { color_identity: ['W', 'U', 'B', 'G'] })),
];

// Resolves every requested name to a found card.
const collectionRoute = [
  'cards/collection',
  (url, options) => {
    const { identifiers } = JSON.parse(options.body);
    return ok({
      data: identifiers.map(({ name }) => mockCard(name, { cmc: 1 })),
      not_found: [],
    });
  },
];

// Types into an autocomplete field and commits a name from the suggestions.
// Scoped to the open listbox so tag-select <option>s aren't matched.
async function pick(label, typed, fullName) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: typed } });
  const listbox = await screen.findByRole('listbox');
  fireEvent.mouseDown(within(listbox).getByRole('option', { name: fullName }));
}

function setTag(slot, value) {
  const input = screen.getByLabelText(`Slot ${slot} tag`);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

// Picks a commander on the entry screen and opens the workspace.
async function enterWorkspace(typed = 'atraxa', full = "Atraxa, Praetors' Voice") {
  await pick('Commander', typed, full);
  fireEvent.click(screen.getByRole('button', { name: /Look Up Cards/ }));
  await screen.findAllByPlaceholderText('Card name…');
}

const collectionBodies = () =>
  fetch.mock.calls
    .filter(([u]) => String(u).includes('collection'))
    .flatMap(([, o]) => JSON.parse(o.body).identifiers.map((x) => x.name));

describe('DeckBrewer', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAutocompleteCache();
    clearSimilarCache();
    clearOtagCache();
    vi.stubGlobal('fetch', vi.fn());
    setupFetch([autocompleteRoute, commanderRoute, collectionRoute]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens on the commander picker; Look Up is gated on a commander', async () => {
    render(<DeckBrewer />);
    expect(screen.getByText('Deck Brewer')).toBeInTheDocument();
    expect(screen.getByLabelText('Commander')).toBeInTheDocument();
    // No workspace yet.
    expect(screen.queryByPlaceholderText('Card name…')).not.toBeInTheDocument();

    const lookUp = screen.getByRole('button', { name: /Look Up Cards/ });
    expect(lookUp).toBeDisabled();

    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    expect(lookUp).toBeEnabled();
  });

  it('always shows three sub-decks and shared slot columns', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    // Three sub-decks are always present (no add/remove).
    expect(screen.getAllByPlaceholderText('Card name…')).toHaveLength(CARD_COUNT * 3);
    expect(screen.getAllByPlaceholderText('Why this slot…')).toHaveLength(CARD_COUNT);
    expect(screen.getAllByLabelText(/^Slot \d+ tag$/)).toHaveLength(CARD_COUNT);
    expect(screen.getByLabelText('33 A card 1')).toBeInTheDocument();
    expect(screen.getByLabelText('33 C card 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add 33' })).not.toBeInTheDocument();
    // Commander header shows the resolved commander and the cards-placed counter.
    expect(screen.getByText("Atraxa, Praetors' Voice")).toBeInTheDocument();
    expect(screen.getByText('cards placed')).toBeInTheDocument();
  });

  it('does not persist free text that was never selected', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    const input = screen.getByLabelText('33 A card 1');
    fireEvent.change(input, { target: { value: 'totally made up card' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('');
  });

  it('restricts the tag to known categories or Custom (no free text)', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    const tag = screen.getByLabelText('Slot 1 tag');
    expect(tag.tagName).toBe('SELECT');
    expect(within(tag).getByRole('option', { name: 'Ramp' })).toBeInTheDocument();
    expect(within(tag).getByRole('option', { name: 'Custom' })).toBeInTheDocument();
    fireEvent.change(tag, { target: { value: 'Custom' } });
    expect(tag).toHaveValue('Custom');
  });

  it('resolves committed cards on commit and shows the composition summary', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    await waitFor(() => {
      expect(collectionBodies()).toEqual(
        expect.arrayContaining(['Sol Ring', 'Cultivate'])
      );
    });

    const summary = within(
      screen.getByText('Composition & role targets').closest('.detail')
    );
    const rockRow = summary.getByRole('cell', { name: 'Mana Rock' }).closest('tr');
    // Tag, Target (empty input), Slots (1), then 33 A / 33 B / 33 C fill counts:
    // 1 slot tagged Mana Rock, filled in 33 A and 33 B, empty in 33 C.
    expect(within(rockRow).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Mana Rock', '', '1', '1', '1', '0',
    ]);
  });

  it('tracks a role target and flags it as short until met', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    setTag(1, 'Removal');

    const detail = () =>
      within(screen.getByText('Composition & role targets').closest('.detail'));
    const removalRow = () =>
      detail().getByRole('cell', { name: 'Removal' }).closest('tr');
    // Set a target of 2 for Removal; only 1 slot carries it → short 1.
    fireEvent.change(within(removalRow()).getByLabelText('Removal target'), {
      target: { value: '2' },
    });
    expect(within(removalRow()).getByText('short 1')).toBeInTheDocument();

    // A second Removal slot meets the target.
    setTag(2, 'Removal');
    expect(within(removalRow()).getByText('✓')).toBeInTheDocument();
  });

  it('opens the suggestion strip for the active cell, excludes deck cards, and takes into the active column', async () => {
    // Resolve cards as artifacts so the suggestion query filters by type.
    const artifactCollection = [
      'cards/collection',
      (url, options) => {
        const { identifiers } = JSON.parse(options.body);
        return ok({
          data: identifiers.map(({ name }) =>
            mockCard(name, { cmc: 1, type_line: 'Artifact' })
          ),
          not_found: [],
        });
      },
    ];
    setupFetch([
      autocompleteRoute,
      commanderRoute,
      artifactCollection,
      ['cards/search', () => ok({
        data: [
          mockCard('Sol Ring', { cmc: 1 }), // already used: excluded
          mockCard('Mana Vault', { cmc: 1 }),
          mockCard('Mox Amber', { cmc: 1 }),
          mockCard('Sol Talisman', { cmc: 1 }),
          mockCard('Fellwar Stone', { cmc: 1 }),
          mockCard('Mind Stone', { cmc: 1 }),
          mockCard('Springleaf Drum', { cmc: 1 }), // 6th qualifier: past the cap
        ],
      })],
    ]);

    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');

    // Click the empty 33 B cell in the same row → it becomes the active column;
    // suggestions are driven by the 33 A "main" card (Sol Ring).
    fireEvent.click(screen.getByLabelText('33 B card 1'));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Mana Vault' })).toBeInTheDocument();
    });

    const searchUrl = fetch.mock.calls.find(([u]) => decodeURIComponent(String(u)).includes('order:edhrec'))[0];
    expect(decodeURIComponent(String(searchUrl))).toContain(
      'otag:mana-rock mv:1 t:artifact id<=WUBG order:edhrec'
    );
    // Sol Ring is excluded (already in the deck); up to 5 qualifiers are shown,
    // so the 6th (Springleaf Drum) is dropped by the cap.
    expect(screen.queryByRole('link', { name: 'Sol Ring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Springleaf Drum' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.strip-card')).toHaveLength(5);

    // Each suggestion can be sent to any sub-deck, not just the active one.
    const vaultCard = screen.getByRole('link', { name: 'Mana Vault' }).closest('.strip-card');
    expect(within(vaultCard).getByRole('button', { name: '→ 33 A' })).toBeInTheDocument();
    fireEvent.click(within(vaultCard).getByRole('button', { name: '→ 33 B' }));
    expect(screen.getByLabelText('33 B card 1')).toHaveValue('Mana Vault');
  });

  it('searches lands by type when a slot is tagged Land', async () => {
    const landCollection = [
      'cards/collection',
      (url, options) => {
        const { identifiers } = JSON.parse(options.body);
        return ok({
          data: identifiers.map(({ name }) =>
            mockCard(name, { cmc: 0, type_line: 'Basic Land — Mountain' })
          ),
          not_found: [],
        });
      },
    ];
    setupFetch([
      autocompleteRoute,
      commanderRoute,
      landCollection,
      ['cards/search', () => ok({
        data: [
          mockCard('Command Tower', { cmc: 0, type_line: 'Land' }),
          mockCard('Exotic Orchard', { cmc: 0, type_line: 'Land' }),
        ],
      })],
    ]);

    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'mountain', 'Mountain');
    setTag(1, 'Land');
    fireEvent.click(screen.getByLabelText('33 A card 1'));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Command Tower' })).toBeInTheDocument();
    });
    // Land rows search by card type, not an oracle tag.
    const searchUrl = fetch.mock.calls.find(([u]) => decodeURIComponent(String(u)).includes('order:edhrec'))[0];
    expect(decodeURIComponent(String(searchUrl))).toContain('t:land id<=WUBG order:edhrec');
  });

  it('renders the consistency rail: fill bars, needs-attention, and MV curve', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');

    expect(screen.getByText('Consistency')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    // 33 A has one of its 33 slots filled.
    expect(screen.getByText('1 / 33')).toBeInTheDocument();
    // The active sub-deck's empty slots are surfaced.
    expect(screen.getByText(/32 empty slots in 33 A/)).toBeInTheDocument();
  });

  it('flags a sub-deck card that diverges from the 33 A main card', async () => {
    const cardDb = {
      'Sol Ring': { cmc: 1, type_line: 'Artifact' },
      Counterspell: { cmc: 2, type_line: 'Instant' },
    };
    setupFetch([
      autocompleteRoute,
      commanderRoute,
      ['cards/collection', (url, options) => {
        const { identifiers } = JSON.parse(options.body);
        return ok({
          data: identifiers.map(({ name }) => mockCard(name, cardDb[name] ?? { cmc: 1 })),
          not_found: [],
        });
      }],
      // Oracle-tag membership: Sol Ring is a mana-rock, Counterspell is not.
      ['cards/search', (url) =>
        ok({ data: url.includes('Sol Ring') ? [mockCard('Sol Ring')] : [] })],
    ]);

    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    await pick('33 B card 1', 'counterspell', 'Counterspell');

    // Counterspell differs from Sol Ring in mana value, card type, and tag.
    // Two async chains feed this (card resolution + otag membership).
    await waitFor(
      () => {
        expect(
          screen.getByText(/differs from 33 A: mana value, card type, tag/)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    expect(screen.getByText(/1 card differs from 33 A/)).toBeInTheDocument();
  });

  it('replaces a chosen card with no warning', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    // Changing a card that other columns were picked alongside no longer warns.
    await pick('33 A card 1', 'counterspell', 'Counterspell');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('33 A card 1')).toHaveValue('Counterspell');
    expect(screen.getByLabelText('33 B card 1')).toHaveValue('Cultivate');
    expect(screen.queryByText(/picked when/)).not.toBeInTheDocument();
  });

  it('flags cross-sub-deck duplicates, exempting basic lands', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    await pick('33 B card 2', 'sol ring', 'Sol Ring');
    expect(screen.getAllByText('duplicate in deck')).toHaveLength(2);

    await pick('33 A card 3', 'mountain', 'Mountain');
    await pick('33 B card 3', 'mountain', 'Mountain');
    expect(screen.getAllByText('duplicate in deck')).toHaveLength(2); // still just Sol Ring
  });

  it('persists the matrix to localStorage and restores it on remount', async () => {
    const { unmount } = render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    unmount();

    // A saved commander reopens straight into the workspace.
    render(<DeckBrewer />);
    expect(await screen.findByText("Atraxa, Praetors' Voice")).toBeInTheDocument();
    expect(screen.getByLabelText('33 A card 1')).toHaveValue('Sol Ring');
    expect(screen.getByLabelText('Slot 1 tag')).toHaveValue('Mana Rock');
  });

  it('reorders rows live as the drag crosses another row', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    setTag(1, 'Ramp');
    setTag(2, 'Removal');

    const handle1 = screen.getByLabelText('Reorder row 1');
    const row2 = screen.getByLabelText('Reorder row 2').closest('tr');
    fireEvent.dragStart(handle1);
    // Crossing row 2 shifts the dragged row there immediately (no drop needed).
    fireEvent.dragOver(row2);
    fireEvent.dragEnd(handle1);

    // Row 1 (Ramp) moved down into row 2's position; Removal shifts up.
    expect(screen.getByLabelText('Slot 1 tag')).toHaveValue('Removal');
    expect(screen.getByLabelText('Slot 2 tag')).toHaveValue('Ramp');
  });

  it('opens the Playtest setup, gates on cards, and starts the simulator', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    fireEvent.click(screen.getByRole('button', { name: '▶ Playtest' }));
    const setup = screen.getByRole('dialog', { name: 'Playtest setup' });
    expect(within(setup).getByText(/2 cards \+ Atraxa/)).toBeInTheDocument();

    // Unticking every sub-deck disables Start.
    fireEvent.click(within(setup).getByRole('checkbox', { name: '33 A' }));
    fireEvent.click(within(setup).getByRole('checkbox', { name: '33 B' }));
    fireEvent.click(within(setup).getByRole('checkbox', { name: '33 C' }));
    expect(within(setup).getByRole('button', { name: 'Start Playtest' })).toBeDisabled();
    fireEvent.click(within(setup).getByRole('checkbox', { name: '33 A' }));

    fireEvent.click(within(setup).getByRole('button', { name: 'Start Playtest' }));
    // Only 33 A's card is in the game: a 1-card deck, all drawn to hand.
    const overlay = screen.getByRole('dialog', { name: 'Playtest' });
    expect(overlay).toBeInTheDocument();
    expect(screen.getByText('Hand (1)')).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'Sol Ring' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close playtest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' })); // confirm close
    expect(screen.queryByRole('dialog', { name: 'Playtest' })).not.toBeInTheDocument();
  });

  it('exports selected sub-decks to a Moxfield decklist', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const textarea = screen.getByLabelText('Moxfield decklist');
    // Whole deck by default: commander + both sub-decks.
    expect(textarea.value).toContain("Commander\n1 Atraxa, Praetors' Voice");
    expect(textarea.value).toContain('1 Sol Ring');
    expect(textarea.value).toContain('1 Cultivate');

    // Untick 33 B → its card drops out.
    fireEvent.click(screen.getByRole('checkbox', { name: '33 B' }));
    expect(textarea.value).toContain('1 Sol Ring');
    expect(textarea.value).not.toContain('Cultivate');

    // Untick Commander → the commander section drops out.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Commander' }));
    expect(textarea.value).toBe('1 Sol Ring');
  });

  it('round-trips a brew through the sub-deck export/import format', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    await pick('33 B card 1', 'cultivate', 'Cultivate');
    setTag(1, 'Ramp');

    // Export in the Brewer sub-deck format and capture the text.
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Brewer sub-decks' }));
    const exported = screen.getByLabelText('Brewer sub-deck list').value;
    expect(exported).toContain('Commander: Atraxa');
    expect(exported).toContain('Ramp');
    expect(exported).toContain('Sol Ring');
    expect(exported).toContain('Cultivate');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Change something first to prove import overwrote it, then re-import.
    setTag(1, 'Removal');
    fireEvent.click(screen.getByRole('button', { name: 'Import' })); // header opens the modal
    const dialog = screen.getByRole('dialog', { name: 'Import brew' });
    fireEvent.change(within(dialog).getByLabelText('Brew to import'), {
      target: { value: exported },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));

    await screen.findAllByPlaceholderText('Card name…');
    expect(screen.getByLabelText('33 A card 1')).toHaveValue('Sol Ring');
    expect(screen.getByLabelText('33 B card 1')).toHaveValue('Cultivate');
    expect(screen.getByLabelText('Slot 1 tag')).toHaveValue('Ramp');
  });

  it('rejects a non-sub-deck import with an error', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Import' })); // header opens the modal
    const dialog = screen.getByRole('dialog', { name: 'Import brew' });
    fireEvent.change(within(dialog).getByLabelText('Brew to import'), {
      target: { value: '1 Sol Ring\n2 Forest' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
    expect(screen.getByText(/Deck Brewer sub-deck export/)).toBeInTheDocument();
  });

  it('shows an error message when a card resolution request fails', async () => {
    setupFetch([
      autocompleteRoute,
      commanderRoute,
      ['cards/collection', () => ({ ok: false, status: 500, json: async () => ({}) })],
    ]);

    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Scryfall request failed (HTTP 500)'
      );
    });
  });
});

describe('reorder', () => {
  it('moves an item down', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('remapIndex', () => {
  it('tracks where each index lands when moving down (0 → 2)', () => {
    expect([0, 1, 2, 3].map((i) => remapIndex(i, 0, 2))).toEqual([2, 0, 1, 3]);
  });

  it('tracks where each index lands when moving up (3 → 1)', () => {
    expect([0, 1, 2, 3].map((i) => remapIndex(i, 3, 1))).toEqual([0, 2, 3, 1]);
  });
});
