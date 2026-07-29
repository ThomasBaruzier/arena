import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MatchGroup, { gamesCursor, liveEventInvalidatesCursor, pairsReducer } from './MatchGroup';

describe('gamesCursor', () => {
  const pair = {
    max_id: 20,
    min_moves: 4,
    max_moves: 12,
    latest_ts: '2026-01-01T00:00:00Z',
    live_count: 1,
    hero_wins: 2,
    duration: 900
  };

  it('uses the active stable sort boundary', () => {
    expect(
      JSON.parse(
        gamesCursor(pair, {
          col: 'id',
          asc: false
        })
      )
    ).toEqual({
      id: 20
    });

    expect(
      JSON.parse(
        gamesCursor(pair, {
          col: 'moves',
          asc: true
        })
      )
    ).toEqual({
      id: 20,
      value: 4
    });

    expect(
      JSON.parse(
        gamesCursor(pair, {
          col: 'status',
          asc: false
        })
      )
    ).toEqual({
      id: 20,
      value: 1,
      secondary: 2
    });
  });
});

describe('liveEventInvalidatesCursor', () => {
  it('refreshes only when live data can cross the active boundary', () => {
    expect(liveEventInvalidatesCursor('game_start', 'id')).toBe(true);

    expect(liveEventInvalidatesCursor('game_move', 'moves')).toBe(true);

    expect(liveEventInvalidatesCursor('game_result', 'status')).toBe(true);

    expect(liveEventInvalidatesCursor('game_result', 'duration')).toBe(true);

    expect(liveEventInvalidatesCursor('game_move', 'status')).toBe(false);

    expect(liveEventInvalidatesCursor('game_result', 'id')).toBe(false);

    expect(liveEventInvalidatesCursor('game_result', 'time')).toBe(false);
  });
});

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
      sort: {
        col: 'id',
        asc: false
      },
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

  it('counts reversed-color wins for canonical S1', () => {
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
      sort: {
        col: 'id',
        asc: false
      },
      firstSlot: 1
    });

    expect(next[0].hero_wins).toBe(1);
  });
});

describe('MatchGroup', () => {
  const group = {
    runId: 'run',
    status: 'live',
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
    draws: 3,
    total: 9
  };

  const run = {
    id: 'run',
    status: 'live',
    games_played: 9,
    total_games: 10,
    p1_elo: 1111,
    p1_erf: 61.2,
    p1_total_time_ms: 1200,
    p1_eff: 83.3,
    p1_cma: 83.4,
    p1_blunder: 4.5,
    p1_moves_analyzed: 10,
    p1_critical_total: 4,
    p1_crashes: 0,
    p2_elo: 999,
    p2_erf: 38.8,
    p2_total_time_ms: 1000,
    p2_eff: 75,
    p2_cma: 79.1,
    p2_blunder: 6.2,
    p2_moves_analyzed: 8,
    p2_critical_total: 3,
    p2_crashes: 2
  };

  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => []
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderGroup = (props = {}) =>
    render(
      <MatchGroup
        group={group}
        run={run}
        selectedGameId={null}
        onSelectGame={vi.fn()}
        subscribe={() => () => {}}
        open={false}
        onToggle={vi.fn()}
        {...props}
      />
    );

  it('groups names and versions in canonical order', () => {
    renderGroup();

    const first = screen.getByTestId('player-row-1');

    const second = screen.getByTestId('player-row-2');

    expect(within(first).getByText('alpha')).toBeInTheDocument();

    expect(within(first).getByText('1.0')).toBeInTheDocument();

    expect(within(second).getByText('zeta')).toBeInTheDocument();

    expect(within(second).getByText('99.0')).toBeInTheDocument();
  });

  it('renders one authoritative S1 record', () => {
    renderGroup();

    expect(screen.getByText('W')).toBeInTheDocument();

    expect(screen.getByText('L')).toBeInTheDocument();

    expect(screen.getByText('D')).toBeInTheDocument();

    expect(screen.getByLabelText('4 wins, 2 losses, 3 draws')).toBeInTheDocument();

    expect(screen.getByText('9/10')).toBeInTheDocument();
  });

  it('renders no arrows or slot labels', () => {
    const { container } = renderGroup();

    expect(container.querySelector('.icon-col')).toBeNull();

    expect(screen.queryByText('S1')).not.toBeInTheDocument();

    expect(screen.queryByText('S2')).not.toBeInTheDocument();

    expect(screen.queryByText('4W')).not.toBeInTheDocument();

    expect(screen.queryByText('2W')).not.toBeInTheDocument();
  });

  it('keeps only the current leader gold', () => {
    renderGroup();

    expect(screen.getByText('alpha')).toHaveClass('gold-text');

    expect(screen.getByText('zeta')).not.toHaveClass('gold-text');

    expect(screen.getByText('1.0')).not.toHaveClass('gold-text');
  });

  it('does not highlight either name on ties', () => {
    renderGroup({
      group: {
        ...group,
        heroWins: 2,
        villainWins: 2
      }
    });

    expect(screen.getByText('alpha')).not.toHaveClass('gold-text');

    expect(screen.getByText('zeta')).not.toHaveClass('gold-text');
  });

  it.each([
    ['live', 'LIVE'],
    ['ended', 'ENDED'],
    ['stopped', 'STOPPED']
  ])('uses authoritative %s status', (status, label) => {
    renderGroup({
      run: {
        ...run,
        status
      }
    });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('does not infer status from progress', () => {
    renderGroup({
      run: {
        ...run,
        status: 'stopped',
        games_played: 10,
        total_games: 10
      }
    });

    expect(screen.getByText('STOPPED')).toBeInTheDocument();

    expect(screen.queryByText('ENDED')).not.toBeInTheDocument();
  });

  it('exposes expanded state semantically', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    renderGroup({
      open: true
    });

    expect(
      screen.getByRole('button', {
        name: /alpha/i
      })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not mount expanded controls while collapsed', () => {
    renderGroup();

    expect(
      screen.queryByRole('region', {
        name: 'Tournament statistics'
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('button', {
        name: /sort by/i
      })
    ).not.toBeInTheDocument();
  });

  it('uses the matchup run snapshot when the summary list omits the run', () => {
    renderGroup({
      run: undefined,
      group: {
        ...group,
        status: 'live',
        total: 9,
        run: {
          ...run,
          status: 'stopped',
          games_played: 10,
          total_games: 10
        }
      }
    });

    expect(screen.getByText('STOPPED')).toBeInTheDocument();

    expect(screen.getByText('10/10')).toBeInTheDocument();
  });

  it('renders statistics while history is still loading', () => {
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise(() => {}));

    renderGroup({
      open: true
    });

    expect(
      screen.getByRole('region', {
        name: 'Tournament statistics'
      })
    ).toBeInTheDocument();

    expect(screen.getByText('Eff')).toBeInTheDocument();
  });

  it('stops after one failed request and retries only on demand', async () => {
    fetchMock.mockReset();

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'unavailable'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

    renderGroup({
      open: true
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load game history.');

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Retry'
      })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('rejects malformed successful history responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        games: []
      })
    });

    renderGroup({
      open: true
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load game history.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
