import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DeckBrewer, { CARD_COUNT } from './DeckBrewer';
import { clearAutocompleteCache } from './scryfall';
import { clearSimilarCache } from './brew';
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
async function pick(label, typed, fullName) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: typed } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: fullName }));
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

  it('enters the workspace with one sub-deck and shared slot columns', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    expect(screen.getAllByPlaceholderText('Card name…')).toHaveLength(CARD_COUNT);
    expect(screen.getAllByPlaceholderText('Why this slot…')).toHaveLength(CARD_COUNT);
    expect(screen.getAllByPlaceholderText('Tag')).toHaveLength(CARD_COUNT);
    expect(screen.getByRole('button', { name: '+ Add 33' })).toBeInTheDocument();
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

  it('adds and removes sub-deck columns (max 3)', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    expect(screen.getAllByPlaceholderText('Card name…')).toHaveLength(CARD_COUNT * 3);
    expect(screen.queryByRole('button', { name: '+ Add 33' })).not.toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove 33 C' }));
    expect(screen.getAllByPlaceholderText('Card name…')).toHaveLength(CARD_COUNT * 2);
  });

  it('resolves committed cards on commit and shows the composition summary', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    await waitFor(() => {
      expect(collectionBodies()).toEqual(
        expect.arrayContaining(['Sol Ring', 'Cultivate'])
      );
    });

    const summary = within(screen.getByText('Composition by tag').closest('.detail'));
    const rockRow = summary.getByText('Mana Rock').closest('tr');
    // 1 slot tagged Mana Rock, filled in both 33 A and 33 B
    expect(within(rockRow).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Mana Rock', '1', '1', '1',
    ]);
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
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));

    // Click the empty 33 B cell in the same row → it becomes the active column;
    // suggestions are driven by the 33 A "main" card (Sol Ring).
    fireEvent.click(screen.getByLabelText('33 B card 1'));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Mana Vault' })).toBeInTheDocument();
    });

    const searchUrl = fetch.mock.calls.find(([u]) => String(u).includes('cards/search'))[0];
    expect(decodeURIComponent(String(searchUrl))).toContain(
      'otag:mana-rock mv:1 t:artifact id<=WUBG order:edhrec'
    );
    // Sol Ring is excluded (already in the deck); up to 5 qualifiers are shown,
    // so the 6th (Springleaf Drum) is dropped by the cap.
    expect(screen.queryByRole('link', { name: 'Sol Ring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Springleaf Drum' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.strip-card')).toHaveLength(5);

    const vaultCard = screen.getByRole('link', { name: 'Mana Vault' }).closest('.strip-card');
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
    const searchUrl = fetch.mock.calls.find(([u]) => String(u).includes('cards/search'))[0];
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

  it('warns when changing a shared tag and flags same-row cards on confirm', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    setTag(1, 'Ramp');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('“Mana Rock” → “Ramp”');
    expect(dialog).toHaveTextContent('Sol Ring (33 A)');
    expect(dialog).toHaveTextContent('Cultivate (33 B)');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Change & flag' }));
    expect(screen.getByLabelText('Slot 1 tag')).toHaveValue('Ramp');
    expect(screen.getAllByText(/picked when slot 1 tag was “Mana Rock”/)).toHaveLength(2);

    // Dismissing a flag clears it
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss warning on 33 A card 1' })
    );
    expect(screen.getAllByText(/picked when slot 1 tag was/)).toHaveLength(1);
  });

  it('cancelling the tag warning reverts the tag and flags nothing', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    setTag(1, 'Ramp');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Slot 1 tag')).toHaveValue('Mana Rock');
    expect(screen.queryByText(/picked when/)).not.toBeInTheDocument();
  });

  it('warns when replacing a chosen card and reverts on cancel', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    await pick('33 B card 1', 'cultivate', 'Cultivate');

    await pick('33 A card 1', 'counterspell', 'Counterspell');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('“Sol Ring” → “Counterspell”');
    expect(dialog).toHaveTextContent('Cultivate (33 B)');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('33 A card 1')).toHaveValue('Sol Ring');
    expect(screen.queryByText(/picked when/)).not.toBeInTheDocument();
  });

  it('flags cross-sub-deck duplicates, exempting basic lands', async () => {
    render(<DeckBrewer />);
    await enterWorkspace();
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
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
