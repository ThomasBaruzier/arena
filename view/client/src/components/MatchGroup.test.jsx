import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MatchGroup, { pairsReducer } from './MatchGroup';

describe('pairsReducer', () => {
  it('normalizes completed game starts', () => {
    const next = pairsReducer([], {
      type: 'game_start',
      game: {
        id: 1,
        group_id: 'run_1',
        winner_color: 1,
        black_slot: 1,
        white_slot: 2,
        moves: '10,10,1;11,11,2',
        timestamp: '2026-01-01T00:00:00Z'
      },
      sort: { col: 'id', asc: false },
      firstSlot: 1
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      live_count: 0,
      max_moves: 2,
      min_moves: 2,
      hero_wins: 1
    });
    expect(next[0].games[0].move_count).toBe(2);
  });

  it('counts reversed-color wins for the canonical first slot', () => {
    const next = pairsReducer([], {
      type: 'game_start',
      game: {
        id: 2,
        group_id: 'run_1',
        winner_color: 2,
        black_slot: 2,
        white_slot: 1,
        moves: '10,10,1;11,11,2',
        timestamp: '2026-01-01T00:00:00Z'
      },
      sort: { col: 'id', asc: false },
      firstSlot: 1
    });

    expect(next[0].hero_wins).toBe(1);
  });
});

describe('MatchGroup', () => {
  const group = {
    runId: 'run',
    hero: {
      id: 'run:1',
      slot: 1,
      name: 'alpha',
      version: '1.0'
    },
    villain: {
      id: 'run:2',
      slot: 2,
      name: 'zeta',
      version: '99.0'
    },
    heroWins: 4,
    villainWins: 2,
    draws: 3
  };

  const run = {
    id: 'run',
    games_played: 9,
    total_games: 10,
    p1_elo: 1111,
    p1_erf: 61.2,
    p1_cma: 83.4,
    p1_blunder: 4.5,
    p1_crashes: 0,
    p2_elo: 999,
    p2_erf: 38.8,
    p2_cma: 79.1,
    p2_blunder: 6.2,
    p2_crashes: 2
  };

  const renderGroup = () =>
    render(
      <MatchGroup
        group={group}
        run={run}
        selectedGameId={null}
        onSelectGame={vi.fn()}
        subscribe={() => () => {}}
        open={false}
        onToggle={vi.fn()}
        onLoaded={vi.fn()}
      />
    );

  it('renders canonical player order and mapped metrics', () => {
    renderGroup();

    const first = screen.getByTestId('player-row-1');
    const second = screen.getByTestId('player-row-2');

    expect(within(first).getByText('alpha')).toBeInTheDocument();
    expect(within(first).getByText('1111')).toBeInTheDocument();
    expect(within(first).getByText('61.2')).toBeInTheDocument();
    expect(within(first).getByText('83.4%')).toBeInTheDocument();

    expect(within(second).getByText('zeta')).toBeInTheDocument();
    expect(within(second).getByText('999')).toBeInTheDocument();
    expect(within(second).getByText('38.8')).toBeInTheDocument();
    expect(within(second).getByText('2')).toBeInTheDocument();
  });

  it('does not render visible slot labels', () => {
    renderGroup();

    expect(screen.queryByText('S1')).not.toBeInTheDocument();
    expect(screen.queryByText('S2')).not.toBeInTheDocument();
  });

  it('renders one authoritative summary', () => {
    renderGroup();

    expect(screen.getByText('W 4')).toBeInTheDocument();
    expect(screen.getByText('L 2')).toBeInTheDocument();
    expect(screen.getByText('D 3')).toBeInTheDocument();
    expect(screen.getByText('9/10')).toBeInTheDocument();
  });
});
