import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TournamentStats, { tournamentTimeValue } from './TournamentStats';

const run = {
  analysis_enabled: 0,
  p1_elo: 1024,
  p2_elo: 976,
  p1_total_time_ms: 492000,
  p2_total_time_ms: 468000,
  p1_erf: 61.2,
  p2_erf: 38.8,
  p1_eff: 94.1,
  p2_eff: 87.6,
  p1_cma: 0,
  p2_cma: 0,
  p1_blunder: 0,
  p2_blunder: 0,
  p1_moves_analyzed: 0,
  p2_moves_analyzed: 0,
  p1_critical_total: 0,
  p2_critical_total: 0,
  p1_crashes: 0,
  p2_crashes: 0
};

const rowFor = (name) =>
  screen
    .getByRole('rowheader', {
      name
    })
    .closest('[role="row"]');

describe('tournamentTimeValue', () => {
  it.each([
    [842, '842ms'],
    [12000, '12s'],
    [492000, '8m12s'],
    [3599000, '59m59s'],
    [3600000, '1h00'],
    [4020000, '1h07'],
    [99 * 3600000 + 59 * 60000, '99h59'],
    [100 * 3600000, '100h+'],
    [150 * 3600000, '100h+']
  ])('formats %i as %s', (value, expected) => {
    expect(tournamentTimeValue(value)).toBe(expected);
  });

  it('rejects unavailable and invalid values', () => {
    expect(tournamentTimeValue(null)).toBe('-');

    expect(tournamentTimeValue(-1)).toBe('-');

    expect(tournamentTimeValue('bad')).toBe('-');
  });
});

describe('TournamentStats', () => {
  it('renders the relaxed core matrix with P1 and P2', () => {
    render(<TournamentStats run={run} />);

    const table = screen.getByRole('table');

    expect(table).toHaveClass('stats-table', 'core');

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['', 'Elo', 'Time', 'ERF', 'Eff']);

    expect(rowFor('P1').textContent).toBe('P110248m12s61.2%94.1%');

    expect(rowFor('P2').textContent).toBe('P29767m48s38.8%87.6%');

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('keeps both analysis columns stable before samples exist', () => {
    render(
      <TournamentStats
        run={{
          ...run,
          analysis_enabled: 1
        }}
      />
    );

    const table = screen.getByRole('table');

    expect(table).toHaveClass('analyzed');

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['', 'Elo', 'Time', 'ERF', 'Eff', 'CMA', 'Bln']);

    expect(within(rowFor('P1')).getAllByText('-')).toHaveLength(2);

    expect(within(rowFor('P2')).getAllByText('-')).toHaveLength(2);
  });

  it('preserves independently sampled zeroes', () => {
    render(
      <TournamentStats
        run={{
          ...run,
          analysis_enabled: 1,
          p1_moves_analyzed: 10,
          p1_critical_total: 4,
          p2_moves_analyzed: 8
        }}
      />
    );

    expect(within(rowFor('P1')).getAllByText('0.0%')).toHaveLength(2);

    expect(rowFor('P2')).toHaveTextContent('-0.0%');
  });

  it('replaces Time with Crash', () => {
    render(
      <TournamentStats
        run={{
          ...run,
          p2_crashes: 2
        }}
      />
    );

    expect(
      screen.getByRole('columnheader', {
        name: 'Crash'
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('columnheader', {
        name: 'Time'
      })
    ).not.toBeInTheDocument();

    expect(rowFor('P1')).toHaveTextContent('P11024061.2%94.1%');

    expect(rowFor('P2')).toHaveTextContent('P2976238.8%87.6%');
  });

  it('compacts exceptional efficiency precision', () => {
    render(
      <TournamentStats
        run={{
          ...run,
          p1_eff: 175.4,
          p2_eff: null
        }}
      />
    );

    expect(rowFor('P1')).toHaveTextContent('175%');

    expect(rowFor('P2')).toHaveTextContent('-');
  });
});
