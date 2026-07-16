import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import HypergeometricCalculator from './HypergeometricCalculator';

// Reset the URL between tests so deep-link params don't leak across cases.
function setSearch(search) {
  window.history.replaceState({}, '', `/${search}`);
}

describe('HypergeometricCalculator', () => {
  beforeEach(() => setSearch(''));

  it('renders the title and default inputs', () => {
    render(<HypergeometricCalculator />);
    expect(screen.getByText('Hypergeometric Calculator')).toBeInTheDocument();
    expect(screen.getByLabelText(/Deck Size/)).toHaveValue(100);
    expect(screen.getByLabelText(/Copies in Deck/)).toHaveValue(10);
    expect(screen.getByLabelText(/Cards Drawn/)).toHaveValue(7);
    expect(screen.getByLabelText(/Successes Desired/)).toHaveValue(1);
  });

  it('reads deck/copies/draws from the URL (?d=100&c=9&n=9)', () => {
    setSearch('?d=100&c=9&n=9');
    render(<HypergeometricCalculator />);
    expect(screen.getByLabelText(/Copies in Deck/)).toHaveValue(9);
    expect(screen.getByLabelText(/Cards Drawn/)).toHaveValue(9);
    // Reference value for 100/9/9, drawing 1+.
    const headline = document.querySelector('.headline');
    expect(within(headline).getByText('58.8%')).toBeInTheDocument();
    expect(screen.getByText(/9 copies in a 100-card deck, drawing 9 cards/)).toBeInTheDocument();
  });

  it('recomputes live as inputs change', () => {
    render(<HypergeometricCalculator />);
    fireEvent.change(screen.getByLabelText(/Copies in Deck/), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/Cards Drawn/), { target: { value: '9' } });
    expect(within(document.querySelector('.headline')).getByText('58.8%')).toBeInTheDocument();
  });

  it('clamps copies and draws to the deck size', () => {
    render(<HypergeometricCalculator />);
    fireEvent.change(screen.getByLabelText(/Deck Size/), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText(/Copies in Deck/), { target: { value: '999' } });
    expect(screen.getByLabelText(/Copies in Deck/)).toHaveValue(40);
  });

  it('exact-probability table has a row per possible count (0..copies)', () => {
    setSearch('?d=100&c=9&n=9');
    render(<HypergeometricCalculator />);
    const table = screen.getByText('Exact Probabilities').closest('.hyp-results')
      .querySelector('.exact-table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + 10); // header + X=0..9
    expect(within(table).getByText('X = 0')).toBeInTheDocument();
    expect(within(table).getByText('X = 9')).toBeInTheDocument();
  });

  it('turn table highlights the turn whose cards-seen equals the draw count', () => {
    setSearch('?d=100&c=9&n=9&play=1');
    render(<HypergeometricCalculator />);
    const turnTable = document.querySelector('.turn-table');
    const highlighted = turnTable.querySelector('tr.selected');
    // On the play, 9 cards seen lands on Turn 3.
    expect(within(highlighted).getByText('Turn 3')).toBeInTheDocument();
    expect(within(highlighted).getByText('9')).toBeInTheDocument();
  });

  it('on-the-play vs on-the-draw changes turn-1 cards seen', () => {
    render(<HypergeometricCalculator />);
    const turn1Cells = () =>
      within(document.querySelector('.turn-table'))
        .getByText('Turn 1')
        .closest('tr');
    expect(within(turn1Cells()).getByText('7')).toBeInTheDocument(); // on the play (default)
    fireEvent.click(screen.getByRole('button', { name: 'On the draw' }));
    expect(within(turn1Cells()).getByText('8')).toBeInTheDocument();
  });

  it('successes-desired preset updates the headline copy', () => {
    render(<HypergeometricCalculator />);
    fireEvent.click(screen.getByRole('button', { name: '2+' }));
    expect(within(document.querySelector('.headline')).getByText(/2 or more/)).toBeInTheDocument();
    expect(screen.getByText(/P\(fewer than 2\):/)).toBeInTheDocument();
  });

  it('renders the probability curve', () => {
    render(<HypergeometricCalculator />);
    expect(
      screen.getByRole('img', { name: /Probability curve/ })
    ).toBeInTheDocument();
  });

  it('Copy Link writes a shareable URL to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setSearch('?d=100&c=9&n=9');
    render(<HypergeometricCalculator />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('d=100&c=9&n=9')
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSearch('');
  });
});
