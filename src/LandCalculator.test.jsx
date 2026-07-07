import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import LandCalculator from './LandCalculator';

describe('LandCalculator', () => {
  it('renders the title', () => {
    render(<LandCalculator />);
    expect(screen.getByText('MTG Land Draw Calculator')).toBeInTheDocument();
  });

  it('renders form with default values', () => {
    render(<LandCalculator />);
    expect(screen.getByLabelText('Deck Size')).toHaveValue(60);
    expect(screen.getByLabelText(/Lands in Deck/)).toHaveValue(24);
  });

  it('shows land percentage in label', () => {
    render(<LandCalculator />);
    const label = screen.getByText(/Lands in Deck/).closest('label');
    expect(label).toHaveTextContent('40.0%');
  });

  it('preset 60 button is active by default', () => {
    render(<LandCalculator />);
    const inputRow = screen.getByLabelText('Deck Size').closest('.input-row');
    const btn60 = within(inputRow).getByRole('button', { name: '60' });
    expect(btn60).toHaveClass('active');
  });

  it('clicking 100 preset updates deck size', () => {
    render(<LandCalculator />);
    const inputRow = screen.getByLabelText('Deck Size').closest('.input-row');
    const btn100 = within(inputRow).getByRole('button', { name: '100' });
    fireEvent.click(btn100);
    expect(screen.getByLabelText('Deck Size')).toHaveValue(100);
    expect(btn100).toHaveClass('active');
  });

  it('renders summary table with 11 data rows', () => {
    render(<LandCalculator />);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    // 1 header row + 11 data rows
    expect(rows).toHaveLength(12);
  });

  it('opening hand row shows correct expected lands', () => {
    render(<LandCalculator />);
    const table = screen.getByRole('table');
    const row = within(table).getByText('Opening Hand').closest('tr');
    expect(within(row).getByText('2.80')).toBeInTheDocument();
  });

  it('clicking a summary row reveals the detail panel', () => {
    render(<LandCalculator />);
    expect(screen.queryByText(/cards seen/)).not.toBeInTheDocument();

    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByText('Opening Hand').closest('tr'));

    expect(screen.getByText(/7 cards seen/)).toBeInTheDocument();
    expect(screen.getByText('Distribution')).toBeInTheDocument();
  });

  it('clicking the same row again hides the detail panel', () => {
    render(<LandCalculator />);
    const table = screen.getByRole('table');
    const openingRow = within(table).getByText('Opening Hand').closest('tr');
    fireEvent.click(openingRow);
    expect(screen.getByText(/7 cards seen/)).toBeInTheDocument();
    fireEvent.click(openingRow);
    expect(screen.queryByText(/7 cards seen/)).not.toBeInTheDocument();
  });

  it('changing lands updates percentage display', () => {
    render(<LandCalculator />);
    fireEvent.change(screen.getByLabelText(/Lands in Deck/), {
      target: { value: '30' },
    });
    const label = screen.getByText(/Lands in Deck/).closest('label');
    expect(label).toHaveTextContent('50.0%');
  });

  it('lands are clamped to deck size', () => {
    render(<LandCalculator />);
    const landsInput = screen.getByLabelText(/Lands in Deck/);
    fireEvent.change(landsInput, { target: { value: '999' } });
    expect(landsInput).toHaveValue(60);
  });

  it('switching to 100-card preset preserves valid land count', () => {
    render(<LandCalculator />);
    const inputRow = screen.getByLabelText('Deck Size').closest('.input-row');
    fireEvent.click(within(inputRow).getByRole('button', { name: '100' }));
    expect(screen.getByLabelText(/Lands in Deck/)).toHaveValue(24);
  });

  it('hand size 7 is active by default', () => {
    render(<LandCalculator />);
    const handField = screen.getByText('Hand Size').closest('.field');
    const btn7 = within(handField).getByRole('button', { name: '7' });
    expect(btn7).toHaveClass('active');
  });

  it('clicking mulligan to 6 updates results', () => {
    render(<LandCalculator />);
    const handField = screen.getByText('Hand Size').closest('.field');
    fireEvent.click(within(handField).getByRole('button', { name: '6' }));

    const table = screen.getByRole('table');
    const row = within(table).getByText('Opening Hand').closest('tr');
    // 6 cards from 60-card deck with 24 lands: E = 6*24/60 = 2.40
    expect(within(row).getByText('2.40')).toBeInTheDocument();
    // Cards seen should be 6
    expect(within(row).getByText('6')).toBeInTheDocument();
  });
});
