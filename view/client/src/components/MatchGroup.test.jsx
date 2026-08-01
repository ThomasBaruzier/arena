import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MatchGroup from './MatchGroup';

class FakeIntersectionObserver {
  observe() {}
  disconnect() {}
}

const group = {
  runId: 'run',
  status: 'live',
  hero: {
    id: 'run:1',
    slot: 1,
    name: 'AlphaLongName',
    version: '1.0'
  },
  villain: {
    id: 'run:2',
    slot: 2,
    name: 'BetaLongName',
    version: '2.0'
  },
  heroWins: 4,
  villainWins: 2,
  draws: 3,
  total: 9
};

const run = {
  id: 'run',
  status: 'live',
  analysis_enabled: 1,
  games_played: 9,
  total_games: 10,
  p1_elo: 1111,
  p2_elo: 999,
  p1_total_time_ms: 1200,
  p2_total_time_ms: 1000,
  p1_erf: 61.2,
  p2_erf: 38.8,
  p1_eff: 83.3,
  p2_eff: 75,
  p1_cma: 83.4,
  p2_cma: 79.1,
  p1_blunder: 4.5,
  p2_blunder: 6.2,
  p1_moves_analyzed: 10,
  p2_moves_analyzed: 8,
  p1_critical_total: 4,
  p2_critical_total: 3,
  p1_crashes: 0,
  p2_crashes: 0
};

const game = (id, blackSlot, overrides = {}) => ({
  id,
  external_id: `run_1_${blackSlot === 1 ? 0 : 1}`,
  group_id: 'run_1',
  run_id: 'run',
  timestamp: '2026-01-01T12:00:00Z',
  winner_color: 1,
  move_count: 1,
  black_slot: blackSlot,
  white_slot: blackSlot === 1 ? 2 : 1,
  board_size: 20,
  opening_len: 0,
  duration: 1234,
  ...overrides
});

const pair = {
  group_id: 'run_1',
  pair_size: 2,
  latest_ts: '2026-01-01T12:00:00Z',
  max_id: 12,
  min_moves: 1,
  max_moves: 2,
  live_count: 0,
  duration: 1500,
  slot1_wins: 1,
  games: [
    game(12, 2, {
      winner_color: 2,
      move_count: 2,
      duration: 1500
    }),
    game(11, 1)
  ]
};

const response = (data, ok = true) => ({
  ok,
  json: async () => data
});

const baseProps = {
  group,
  run,
  selectedGameId: null,
  onSelectGame: vi.fn(),
  subscribe: () => () => {},
  phase: 'closed',
  preparationToken: null,
  onRequest: vi.fn(),
  onPrepared: vi.fn(),
  onTransitionEnd: vi.fn()
};

const renderPhase = (phase, props = {}) =>
  render(<MatchGroup {...baseProps} phase={phase} {...props} />);

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([]));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MatchGroup', () => {
  it('renders compact summary badges and aligned identities', () => {
    renderPhase('closed');

    const first = screen.getByTestId('player-row-1');

    expect(within(first).getByText('AlphaLongName')).toBeInTheDocument();

    expect(within(first).getByText('1.0')).toBeInTheDocument();

    expect(screen.getByText('W 4')).toHaveClass('badge', 'win');

    expect(screen.getByText('L 2')).toHaveClass('badge', 'loss');

    expect(screen.getByText('D 3')).toHaveClass('badge', 'draw');

    expect(screen.getByText('LIVE')).toHaveClass('badge', 'run-status', 'live');

    expect(screen.getByText('9/10')).toHaveClass('badge', 'run-progress', 'live');
  });

  it('keeps one arrow mounted through every phase', async () => {
    const onPrepared = vi.fn();

    const { rerender } = renderPhase('closed', {
      onPrepared
    });

    const indicator = document.querySelector('.group-indicator');

    const arrow = indicator.querySelector('.group-arrow');

    rerender(
      <MatchGroup {...baseProps} phase="preparing" preparationToken={1} onPrepared={onPrepared} />
    );

    expect(document.querySelector('.group-arrow')).toBe(arrow);

    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));

    for (const phase of ['opening', 'open', 'closing']) {
      rerender(<MatchGroup {...baseProps} phase={phase} onPrepared={onPrepared} />);

      expect(document.querySelector('.group-arrow')).toBe(arrow);
    }
  });

  it('keeps matrix and history in one animated body', async () => {
    globalThis.fetch.mockResolvedValueOnce(response([pair]));

    const onPrepared = vi.fn();

    const { rerender } = renderPhase('preparing', {
      preparationToken: 1,
      onPrepared
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));

    rerender(<MatchGroup {...baseProps} phase="opening" onPrepared={onPrepared} />);

    const body = document.querySelector('.group-list');

    expect(body).toHaveClass('opening');

    expect(
      within(body).getByRole('table', {
        name: 'Player statistics comparison'
      })
    ).toBeInTheDocument();

    expect(within(body).getAllByTestId('match-row')).toHaveLength(2);
  });

  it('opens initial failure into matrix and Retry', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(
        response(
          {
            error: 'failed'
          },
          false
        )
      )
      .mockResolvedValueOnce(response([]));

    const onPrepared = vi.fn();

    const { rerender } = renderPhase('preparing', {
      preparationToken: 1,
      onPrepared
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalled());

    rerender(<MatchGroup {...baseProps} phase="open" onPrepared={onPrepared} />);

    expect(
      screen.getByRole('table', {
        name: 'Player statistics comparison'
      })
    ).toBeInTheDocument();

    const retry = screen.getByRole('alert', {
      name: 'Could not load game history'
    });

    fireEvent.click(
      within(retry).getByRole('button', {
        name: 'Retry'
      })
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('renders canonical history rows', async () => {
    globalThis.fetch.mockResolvedValueOnce(response([pair]));

    const onPrepared = vi.fn();

    const onSelectGame = vi.fn();

    const { rerender } = renderPhase('preparing', {
      preparationToken: 1,
      onPrepared,
      onSelectGame
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalled());

    rerender(
      <MatchGroup {...baseProps} phase="open" onPrepared={onPrepared} onSelectGame={onSelectGame} />
    );

    expect(document.querySelector('.match-header-row').textContent).toBe('IDSideMvsDurRes');

    const rows = screen.getAllByTestId('match-row');

    expect(rows[0].querySelector('.side-stone.black')).toBeInTheDocument();

    expect(rows[1].querySelector('.side-stone.white')).toBeInTheDocument();

    expect(rows[0].querySelector('.row-duration')).toHaveTextContent('1.2s');

    fireEvent.click(rows[0]);

    expect(onSelectGame).toHaveBeenCalledWith(11);
  });

  it('requests strict canonical server sorting', async () => {
    globalThis.fetch.mockResolvedValue(response([pair]));

    const onPrepared = vi.fn();

    const { rerender } = renderPhase('preparing', {
      preparationToken: 1,
      onPrepared
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalled());

    rerender(<MatchGroup {...baseProps} phase="open" onPrepared={onPrepared} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /Sort by duration/
      })
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    const url = globalThis.fetch.mock.calls[1][0];

    expect(url).toContain('sort=duration');

    expect(url).not.toContain('hero_slot');
  });
});
