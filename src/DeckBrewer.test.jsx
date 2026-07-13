import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DeckBrewer, { CARD_COUNT } from './DeckBrewer';

function mockCard(name, overrides = {}) {
  return {
    name,
    mana_cost: '{1}{G}',
    type_line: 'Creature — Elf Druid',
    scryfall_uri: `https://scryfall.com/card/test/${encodeURIComponent(name)}`,
    cmc: 2,
    color_identity: ['G'],
    id: `id-${name}`,
    ...overrides,
  };
}

const CATALOG = [
  "Atraxa, Praetors' Voice",
  'Llanowar Elves',
  'Elvish Mystic',
  'Sol Ring',
  'Counterspell',
  'Beast Within',
  'Not A Real Card',
];

const ok = (data) => ({ ok: true, json: async () => data });

// Routes fetch calls by URL substring (matched against the decoded URL).
// Later setupFetch calls override earlier ones.
function setupFetch(routes) {
  fetch.mockImplementation(async (url, options = {}) => {
    const decoded = decodeURIComponent(String(url));
    for (const [pattern, respond] of routes) {
      if (decoded.includes(pattern)) return respond(decoded, options);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

// Serves name suggestions from CATALOG; tests layer lookup routes on top.
const autocompleteRoute = [
  'cards/autocomplete',
  (url) => {
    const q = url.split('q=')[1].toLowerCase();
    return ok({ data: CATALOG.filter((n) => n.toLowerCase().includes(q)) });
  },
];

// Types into an autocomplete field and commits a name from the suggestions.
async function pick(label, typed, fullName) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: typed } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: fullName }));
}

describe('DeckBrewer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    setupFetch([autocompleteRoute]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(`renders a commander field and ${CARD_COUNT} card name and category inputs`, () => {
    render(<DeckBrewer />);
    expect(screen.getByLabelText('Commander')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Card name')).toHaveLength(CARD_COUNT);
    expect(screen.getAllByPlaceholderText('Category')).toHaveLength(CARD_COUNT);
  });

  it('requires both a commander and at least one card before submitting', async () => {
    render(<DeckBrewer />);
    const submit = screen.getByRole('button', { name: 'Look Up Cards' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/commander required/)).toBeInTheDocument();

    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    expect(screen.queryByText(/commander required/)).not.toBeInTheDocument();
    expect(submit).toBeDisabled(); // still no cards

    await pick('Card 1 name', 'llanowar', 'Llanowar Elves');
    expect(screen.getByText(`1 of ${CARD_COUNT} cards entered`)).toBeInTheDocument();
    expect(submit).toBeEnabled();
  });

  it('shows suggestions while typing and commits the clicked one', async () => {
    render(<DeckBrewer />);
    fireEvent.change(screen.getByLabelText('Card 1 name'), {
      target: { value: 'elv' },
    });
    // Both Llanowar Elves and Elvish Mystic match "elv"
    const llanowar = await screen.findByRole('option', { name: 'Llanowar Elves' });
    expect(screen.getByRole('option', { name: 'Elvish Mystic' })).toBeInTheDocument();

    fireEvent.mouseDown(llanowar);
    expect(screen.getByLabelText('Card 1 name')).toHaveValue('Llanowar Elves');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not persist free text that was never selected', async () => {
    render(<DeckBrewer />);
    const input = screen.getByLabelText('Card 1 name');
    fireEvent.change(input, { target: { value: 'atraxa the great' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('');
    expect(screen.getByText(`0 of ${CARD_COUNT} cards entered — commander required`)).toBeInTheDocument();
  });

  it('commits on blur when the text exactly matches a suggestion', async () => {
    render(<DeckBrewer />);
    const input = screen.getByLabelText('Card 1 name');
    fireEvent.change(input, { target: { value: 'sol ring' } });
    await screen.findByRole('option', { name: 'Sol Ring' });
    fireEvent.blur(input);
    expect(input).toHaveValue('Sol Ring');
    expect(screen.getByText(new RegExp(`1 of ${CARD_COUNT} cards entered`))).toBeInTheDocument();
  });

  it('supports keyboard selection with arrows and Enter', async () => {
    render(<DeckBrewer />);
    const input = screen.getByLabelText('Card 1 name');
    fireEvent.change(input, { target: { value: 'elv' } });
    await screen.findByRole('option', { name: 'Llanowar Elves' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('Elvish Mystic');
  });

  it('submits committed rows to the collection endpoint and shows results', async () => {
    setupFetch([
      autocompleteRoute,
      ['cards/named?fuzzy=Atraxa', () => ok(mockCard("Atraxa, Praetors' Voice", { color_identity: ['W', 'U', 'B', 'G'] }))],
      ['cards/collection', () => ok({
        data: [
          mockCard('Llanowar Elves', { cmc: 1 }),
          mockCard('Sol Ring', { mana_cost: '{1}', type_line: 'Artifact', cmc: 1, color_identity: [] }),
        ],
        not_found: [],
      })],
      ['cards/search', () => ok({ data: [] })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('Card 1 name', 'llanowar', 'Llanowar Elves');
    fireEvent.change(screen.getByLabelText('Card 1 category'), {
      target: { value: 'Ramp' },
    });
    await pick('Card 3 name', 'sol ring', 'Sol Ring');
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByText('Scryfall Results')).toBeInTheDocument();
    });

    const collectionCall = fetch.mock.calls.find(([u]) => String(u).includes('collection'));
    expect(collectionCall[1].method).toBe('POST');
    expect(JSON.parse(collectionCall[1].body)).toEqual({
      identifiers: [{ name: 'Llanowar Elves' }, { name: 'Sol Ring' }],
    });

    expect(screen.getByRole('link', { name: 'Llanowar Elves' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sol Ring' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 cards found')).toBeInTheDocument();
  });

  it('shows a category breakdown after lookup', async () => {
    setupFetch([
      autocompleteRoute,
      ['cards/named?fuzzy=Atraxa', () => ok(mockCard("Atraxa, Praetors' Voice"))],
      ['cards/collection', () => ok({
        data: [mockCard('Llanowar Elves'), mockCard('Elvish Mystic')],
        not_found: [],
      })],
      ['cards/search', () => ok({ data: [] })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('Card 1 name', 'llanowar', 'Llanowar Elves');
    fireEvent.change(screen.getByLabelText('Card 1 category'), {
      target: { value: 'Ramp' },
    });
    await pick('Card 2 name', 'elvish', 'Elvish Mystic');
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByText('Category Breakdown (2 cards)')).toBeInTheDocument();
    });
    const panel = within(
      screen.getByText('Category Breakdown (2 cards)').closest('.detail')
    );
    expect(panel.getByText('Ramp')).toBeInTheDocument();
    expect(panel.getByText('Uncategorized')).toBeInTheDocument();
    expect(panel.getAllByText('50.0%')).toHaveLength(2);
  });

  it('shows up to 3 similar cards per tagged card, filtered by commander identity', async () => {
    setupFetch([
      autocompleteRoute,
      ['cards/named?fuzzy=Atraxa', () => ok(mockCard("Atraxa, Praetors' Voice", { color_identity: ['W', 'U', 'B', 'G'] }))],
      ['cards/collection', () => ok({
        data: [mockCard('Llanowar Elves', { cmc: 1 })],
        not_found: [],
      })],
      ['cards/search', () => ok({
        data: [
          mockCard('Llanowar Elves', { cmc: 1 }),
          mockCard('Elvish Mystic', { cmc: 1 }),
          mockCard('Fyndhorn Elves', { cmc: 1 }),
          mockCard('Arbor Elf', { cmc: 1 }),
        ],
      })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('Card 1 name', 'llanowar', 'Llanowar Elves');
    fireEvent.change(screen.getByLabelText('Card 1 category'), {
      target: { value: 'ramp' }, // lowercase on purpose: matching is case-insensitive
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByText('Scryfall Results')).toBeInTheDocument();
    });

    const searchCall = fetch.mock.calls.find(([u]) => String(u).includes('cards/search'));
    expect(decodeURIComponent(String(searchCall[0]))).toContain(
      'otag:ramp mv:1 id<=WUBG order:edhrec'
    );

    expect(screen.getByRole('link', { name: 'Elvish Mystic' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fyndhorn Elves' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arbor Elf' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Llanowar Elves' })).toHaveLength(1);
    expect(screen.getByText('Color identity:')).toBeInTheDocument();
  });

  it('marks cards the lookup cannot resolve anywhere', async () => {
    setupFetch([
      autocompleteRoute,
      ['cards/named?fuzzy=Atraxa', () => ok(mockCard("Atraxa, Praetors' Voice"))],
      ['cards/named?fuzzy=Not A Real Card', () => ({ ok: false, status: 404, json: async () => ({}) })],
      ['cards/collection', () => ok({
        data: [],
        not_found: [{ name: 'Not A Real Card' }],
      })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('Card 1 name', 'not a real', 'Not A Real Card');
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByText('not found')).toBeInTheDocument();
    });
    expect(screen.getByText('0 of 1 cards found')).toBeInTheDocument();
  });

  it('shows an error message when the lookup request fails', async () => {
    setupFetch([
      autocompleteRoute,
      ['cards/named?fuzzy=Atraxa', () => ok(mockCard("Atraxa, Praetors' Voice"))],
      ['cards/collection', () => ({ ok: false, status: 500, json: async () => ({}) })],
    ]);

    render(<DeckBrewer />);
    await pick('Commander', 'atraxa', "Atraxa, Praetors' Voice");
    await pick('Card 1 name', 'sol ring', 'Sol Ring');
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Scryfall request failed (HTTP 500)'
      );
    });
  });
});
