import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TournamentStats from './TournamentStats';

const group = {
  hero: {
    name: 'Alpha'
  },
  villain: {
    name: 'Beta'
  }
};

const baseRun = {
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

describe('TournamentStats', () => {
  it('renders the stable core', () => {
    render(<TournamentStats group={group} run={baseRun} />);

    expect(screen.getByText('Elo')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('ERF')).toBeInTheDocument();
    expect(screen.getByText('Eff')).toBeInTheDocument();
    expect(screen.getByText('8m 12s')).toBeInTheDocument();
    expect(screen.getByText('7m 48s')).toBeInTheDocument();
    expect(screen.getByText('94.1%')).toBeInTheDocument();
  });

  it('does not render uncomputed evaluator rows', () => {
    render(<TournamentStats group={group} run={baseRun} />);

    expect(screen.queryByText('CMA')).not.toBeInTheDocument();
    expect(screen.queryByText('Blunder')).not.toBeInTheDocument();
  });

  it('renders evaluator rows from their own samples', () => {
    render(
      <TournamentStats
        group={group}
        run={{
          ...baseRun,
          p1_cma: 80,
          p1_blunder: 5,
          p2_blunder: 7,
          p1_moves_analyzed: 20,
          p2_moves_analyzed: 10,
          p1_critical_total: 5
        }}
      />
    );

    expect(screen.getByText('CMA')).toBeInTheDocument();
    expect(screen.getByText('Blunder')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(1);
  });

  it('hides crashes when both values are zero', () => {
    render(<TournamentStats group={group} run={baseRun} />);

    expect(screen.queryByText('Crashes')).not.toBeInTheDocument();
  });

  it('shows crashes when either slot crashed', () => {
    render(
      <TournamentStats
        group={group}
        run={{
          ...baseRun,
          p2_crashes: 2
        }}
      />
    );

    expect(screen.getByText('Crashes')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders unavailable efficiency as a dash', () => {
    render(
      <TournamentStats
        group={group}
        run={{
          ...baseRun,
          p1_eff: null,
          p2_eff: null
        }}
      />
    );

    expect(screen.getAllByText('-')).toHaveLength(2);
  });
});
