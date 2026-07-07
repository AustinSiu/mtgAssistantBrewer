import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DeckBrewer, { CARD_COUNT } from './DeckBrewer';

function mockCard(name, overrides = {}) {
  return {
    name,
    mana_cost: '{1}{G}',
    type_line: 'Creature — Elf Druid',
    scryfall_uri: `https://scryfall.com/card/test/${encodeURIComponent(name)}`,
    ...overrides,
  };
}

describe('DeckBrewer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(`renders ${CARD_COUNT} card name and category inputs`, () => {
    render(<DeckBrewer />);
    expect(screen.getAllByPlaceholderText('Card name')).toHaveLength(CARD_COUNT);
    expect(screen.getAllByPlaceholderText('Category')).toHaveLength(CARD_COUNT);
  });

  it('disables submit until a card name is entered', () => {
    render(<DeckBrewer />);
    const submit = screen.getByRole('button', { name: 'Look Up Cards' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Card 1 name'), {
      target: { value: 'Llanowar Elves' },
    });
    expect(submit).toBeEnabled();
    expect(screen.getByText(`1 of ${CARD_COUNT} cards entered`)).toBeInTheDocument();
  });

  it('submits filled rows to the Scryfall collection endpoint and shows results', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [mockCard('Llanowar Elves'), mockCard('Sol Ring', { mana_cost: '{1}', type_line: 'Artifact' })],
        not_found: [],
      }),
    });

    render(<DeckBrewer />);
    fireEvent.change(screen.getByLabelText('Card 1 name'), {
      target: { value: 'Llanowar Elves' },
    });
    fireEvent.change(screen.getByLabelText('Card 1 category'), {
      target: { value: 'Ramp' },
    });
    fireEvent.change(screen.getByLabelText('Card 3 name'), {
      target: { value: 'Sol Ring' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByText('Scryfall Results')).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.scryfall.com/cards/collection');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      identifiers: [{ name: 'Llanowar Elves' }, { name: 'Sol Ring' }],
    });

    expect(screen.getByRole('link', { name: 'Llanowar Elves' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sol Ring' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 cards found')).toBeInTheDocument();
  });

  it('shows a category breakdown after lookup', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [mockCard('Llanowar Elves'), mockCard('Elvish Mystic')],
        not_found: [],
      }),
    });

    render(<DeckBrewer />);
    fireEvent.change(screen.getByLabelText('Card 1 name'), {
      target: { value: 'Llanowar Elves' },
    });
    fireEvent.change(screen.getByLabelText('Card 1 category'), {
      target: { value: 'Ramp' },
    });
    fireEvent.change(screen.getByLabelText('Card 2 name'), {
      target: { value: 'Elvish Mystic' },
    });
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

  it('falls back to fuzzy lookup for names the collection endpoint misses', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
          not_found: [{ name: 'Lanowar Elfs' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCard('Llanowar Elves'),
      });

    render(<DeckBrewer />);
    fireEvent.change(screen.getByLabelText('Card 1 name'), {
      target: { value: 'Lanowar Elfs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByText('Scryfall Results')).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe(
      'https://api.scryfall.com/cards/named?fuzzy=Lanowar%20Elfs'
    );
    expect(screen.getByRole('link', { name: 'Llanowar Elves' })).toBeInTheDocument();
    expect(screen.getByText('(entered: Lanowar Elfs)')).toBeInTheDocument();
    expect(screen.getByText('fuzzy')).toBeInTheDocument();
  });

  it('marks cards not found anywhere', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
          not_found: [{ name: 'Not A Real Card' }],
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    render(<DeckBrewer />);
    fireEvent.change(screen.getByLabelText('Card 1 name'), {
      target: { value: 'Not A Real Card' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByText('not found')).toBeInTheDocument();
    });
    expect(screen.getByText('0 of 1 cards found')).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    render(<DeckBrewer />);
    fireEvent.change(screen.getByLabelText('Card 1 name'), {
      target: { value: 'Sol Ring' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look Up Cards' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Scryfall request failed (HTTP 500)'
      );
    });
  });
});
