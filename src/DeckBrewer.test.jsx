import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DeckBrewer, { CARD_COUNT, MAX_SUB_DECKS } from './DeckBrewer';
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

async function submitAndWait() {
  fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));
  await waitFor(() => {
    expect(screen.getByText('Composition by tag')).toBeInTheDocument();
  });
}

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

  it('renders commander, one sub-deck, and shared slot columns', () => {
    render(<DeckBrewer />);
    expect(screen.getByLabelText('Commander')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Card name')).toHaveLength(CARD_COUNT);
    expect(screen.getAllByPlaceholderText('Note')).toHaveLength(CARD_COUNT);
    expect(screen.getAllByPlaceholderText('Tag')).toHaveLength(CARD_COUNT);
    expect(screen.getByRole('button', { name: '+ Add 33' })).toBeInTheDocument();
  });

  it('requires both a commander and at least one card before submitting', async () => {
    render(<DeckBrewer />);
    const submit = screen.getByRole('button', { name: 'Look Up Cards' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/commander required/)).toBeInTheDocument();

    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    expect(submit).toBeDisabled();

    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    expect(
      screen.getByText(`1 of ${CARD_COUNT * MAX_SUB_DECKS} cards entered`)
    ).toBeInTheDocument();
    expect(submit).toBeEnabled();
  });

  it('does not persist free text that was never selected', () => {
    render(<DeckBrewer />);
    const input = screen.getByLabelText('33 A card 1');
    fireEvent.change(input, { target: { value: 'totally made up card' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('');
  });

  it('adds and removes sub-deck columns (max 3)', () => {
    render(<DeckBrewer />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    expect(screen.getAllByPlaceholderText('Card name')).toHaveLength(CARD_COUNT * 3);
    expect(screen.queryByRole('button', { name: '+ Add 33' })).not.toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove 33 C' }));
    expect(screen.getAllByPlaceholderText('Card name')).toHaveLength(CARD_COUNT * 2);
  });

  it('looks up all sub-deck cards and shows the composition summary', async () => {
    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    await pick('33 B card 1', 'cultivate', 'Cultivate');
    await submitAndWait();

    const collectionCall = fetch.mock.calls.find(([u]) => String(u).includes('collection'));
    expect(JSON.parse(collectionCall[1].body)).toEqual({
      identifiers: [{ name: 'Sol Ring' }, { name: 'Cultivate' }],
    });

    const summary = within(screen.getByText('Composition by tag').closest('.detail'));
    const rockRow = summary.getByText('Mana Rock').closest('tr');
    // 1 slot tagged Mana Rock, filled in both 33 A and 33 B
    expect(within(rockRow).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Mana Rock', '1', '1', '1',
    ]);
  });

  it('suggests alternatives excluding cards already in the deck, and takes into another sub-deck', async () => {
    setupFetch([
      autocompleteRoute,
      commanderRoute,
      collectionRoute,
      ['cards/search', () => ok({
        data: [
          mockCard('Sol Ring', { cmc: 1 }), // already used: excluded
          mockCard('Mana Vault', { cmc: 1 }),
          mockCard('Mox Amber', { cmc: 1 }),
          mockCard('Sol Talisman', { cmc: 1 }),
          mockCard('Springleaf Drum', { cmc: 1 }),
        ],
      })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    fireEvent.click(screen.getByRole('button', { name: '+ Add 33' }));
    await submitAndWait();

    fireEvent.click(
      screen.getByRole('button', { name: 'Suggest alternatives for 33 A card 1' })
    );
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Mana Vault' })).toBeInTheDocument();
    });

    const searchUrl = fetch.mock.calls.find(([u]) => String(u).includes('cards/search'))[0];
    expect(decodeURIComponent(String(searchUrl))).toContain(
      'otag:mana-rock mv:1 id<=WUBG order:edhrec'
    );
    // Sol Ring itself is excluded; only 3 shown
    expect(screen.queryByRole('link', { name: 'Sol Ring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Springleaf Drum' })).not.toBeInTheDocument();

    // Take Mana Vault into 33 B, same slot
    const strip = screen.getByRole('link', { name: 'Mana Vault' }).closest('.sugg');
    fireEvent.click(within(strip).getByRole('button', { name: '→ 33 B' }));
    expect(screen.getByLabelText('33 B card 1')).toHaveValue('Mana Vault');
  });

  it('takes a suggestion into a brand new sub-deck seeded with just that card', async () => {
    setupFetch([
      autocompleteRoute,
      commanderRoute,
      collectionRoute,
      ['cards/search', () => ok({ data: [mockCard('Mana Vault', { cmc: 1 })] })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    await submitAndWait();

    fireEvent.click(
      screen.getByRole('button', { name: 'Suggest alternatives for 33 A card 1' })
    );
    const vault = await screen.findByRole('link', { name: 'Mana Vault' });
    fireEvent.click(within(vault.closest('.sugg')).getByRole('button', { name: '→ new 33' }));

    expect(screen.getByLabelText('33 B card 1')).toHaveValue('Mana Vault');
    expect(screen.getByLabelText('33 B card 2')).toHaveValue('');
  });

  it('warns when changing a shared tag and flags same-row cards on confirm', async () => {
    render(<DeckBrewer />);
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
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    setTag(1, 'Mana Rock');
    unmount();

    render(<DeckBrewer />);
    expect(screen.getByLabelText('Commander')).toHaveValue("Atraxa, Praetors' Voice");
    expect(screen.getByLabelText('33 A card 1')).toHaveValue('Sol Ring');
    expect(screen.getByLabelText('Slot 1 tag')).toHaveValue('Mana Rock');
  });

  it('shows an error message when the lookup request fails', async () => {
    setupFetch([
      autocompleteRoute,
      commanderRoute,
      ['cards/collection', () => ({ ok: false, status: 500, json: async () => ({}) })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('33 A card 1', 'sol ring', 'Sol Ring');
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Scryfall request failed (HTTP 500)'
      );
    });
  });
});
