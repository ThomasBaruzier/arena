import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchupsReducer, useMatchups, useRuns } from './useData';

const baseMatchup = {
  runId: 'run_full',
  status: 'live',
  hero: {
    id: 'run_full:1',
    slot: 1,
    name: 'agent',
    version: '0.3'
  },
  villain: {
    id: 'run_full:2',
    slot: 2,
    name: 'shrek',
    version: '6.2'
  },
  heroWins: 0,
  villainWins: 0,
  draws: 0,
  total: 0,
  live_count: 0,
  lastActivity: '2026-01-01T00:00:00Z'
};

const subscribe = vi.fn(() => () => {});

const deferred = () => {
  let resolve;

  return {
    promise: new Promise((done) => {
      resolve = done;
    }),
    resolve
  };
};

const response = (data) => ({
  ok: true,
  json: async () => data
});

afterEach(() => {
  vi.restoreAllMocks();
  subscribe.mockClear();
});

describe('matchupsReducer', () => {
  it('attaches live starts to existing run-backed matchups', () => {
    const next = matchupsReducer([baseMatchup], {
      type: 'game_start',
      event: {
        game: {
          id: 10,
          run_id: 'run_full',
          black_slot: 2,
          white_slot: 1,
          black_name: 'shrek',
          black_ver: '6.2',
          white_name: 'agent',
          white_ver: '0.3',
          timestamp: '2026-01-01T00:00:01Z',
          winner_color: 0
        }
      }
    });

    expect(next).toHaveLength(1);
    expect(next[0].hero.slot).toBe(1);
    expect(next[0].villain.slot).toBe(2);
    expect(next[0].live_count).toBe(1);
  });

  it('creates canonical slot order from reversed-color games', () => {
    const next = matchupsReducer([], {
      type: 'game_start',
      event: {
        game: {
          id: 10,
          run_id: 'new_run',
          black_slot: 2,
          white_slot: 1,
          black_name: 'slot2',
          black_ver: '2.0',
          white_name: 'slot1',
          white_ver: '1.0',
          timestamp: '2026-01-01T00:00:01Z',
          winner_color: 0
        }
      }
    });

    expect(next[0].hero).toMatchObject({
      id: 'new_run:1',
      slot: 1,
      name: 'slot1',
      version: '1.0'
    });

    expect(next[0].villain).toMatchObject({
      id: 'new_run:2',
      slot: 2,
      name: 'slot2',
      version: '2.0'
    });
  });

  it('does not change totals on game_result before run_update', () => {
    const state = [
      {
        ...baseMatchup,
        live_count: 1,
        heroWins: 2,
        villainWins: 1,
        draws: 3,
        total: 6
      }
    ];

    const next = matchupsReducer(state, {
      type: 'game_result',
      event: {
        id: 10,
        run_id: 'run_full',
        black_slot: 2,
        white_slot: 1,
        winner_color: 1
      }
    });

    expect(next[0]).toMatchObject({
      heroWins: 2,
      villainWins: 1,
      draws: 3,
      total: 6,
      live_count: 0
    });
  });

  it('keeps slot order and slot-perspective totals on run_update', () => {
    const next = matchupsReducer([baseMatchup], {
      type: 'run_update',
      event: {
        run: {
          id: 'run_full',
          status: 'stopped',
          slot1_name: 'alpha',
          slot1_version: '1.0',
          slot1_cmd: './alpha',
          slot2_name: 'zeta',
          slot2_version: '99.0',
          slot2_cmd: './zeta',
          wins: 4,
          losses: 2,
          draws: 5,
          games_played: 11,
          total_games: 20,
          p1_eff: 91.5
        }
      }
    });

    expect(next[0].hero).toMatchObject({
      slot: 1,
      name: 'alpha',
      version: '1.0',
      cmd: './alpha'
    });

    expect(next[0].villain).toMatchObject({
      slot: 2,
      name: 'zeta',
      version: '99.0',
      cmd: './zeta'
    });

    expect(next[0].heroWins).toBe(4);
    expect(next[0].villainWins).toBe(2);
    expect(next[0].draws).toBe(5);
    expect(next[0].total).toBe(11);
    expect(next[0].status).toBe('stopped');

    expect(next[0].run).toMatchObject({
      id: 'run_full',
      status: 'stopped',
      total_games: 20,
      p1_eff: 91.5
    });
  });

  it('keeps same-name slots distinct', () => {
    const state = [
      {
        ...baseMatchup,
        runId: 'mirror',
        hero: {
          id: 'mirror:1',
          slot: 1,
          name: 'agent',
          version: '1.0'
        },
        villain: {
          id: 'mirror:2',
          slot: 2,
          name: 'agent',
          version: '1.0'
        },
        live_count: 1
      }
    ];

    const next = matchupsReducer(state, {
      type: 'game_result',
      event: {
        run_id: 'mirror',
        black_slot: 2,
        white_slot: 1,
        winner_color: 1
      }
    });

    expect(next[0].hero.id).toBe('mirror:1');
    expect(next[0].villain.id).toBe('mirror:2');
    expect(next[0].live_count).toBe(0);
  });
});

describe('useRuns', () => {
  it('exposes an authoritative refresh operation', async () => {
    const first = [
      {
        id: 'r1',
        games_played: 1
      }
    ];
    const second = [
      {
        id: 'r1',
        games_played: 2
      }
    ];

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second));

    const { result } = renderHook(() => useRuns(subscribe));

    await waitFor(() => expect(result.current.runs).toEqual(first));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.runs).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe('/api/runs');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('ignores an older response after a newer refresh', async () => {
    const first = deferred();
    const second = deferred();

    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useRuns(subscribe));

    let refreshPromise;

    act(() => {
      refreshPromise = result.current.refresh();
    });

    await act(async () => {
      second.resolve(
        response([
          {
            id: 'new',
            games_played: 2
          }
        ])
      );

      await refreshPromise;
    });

    expect(result.current.runs).toEqual([
      {
        id: 'new',
        games_played: 2
      }
    ]);

    await act(async () => {
      first.resolve(
        response([
          {
            id: 'old',
            games_played: 1
          }
        ])
      );

      await first.promise;
    });

    expect(result.current.runs).toEqual([
      {
        id: 'new',
        games_played: 2
      }
    ]);
  });

  it('does not accept a failed HTTP response as run data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => [
        {
          id: 'should-not-load'
        }
      ]
    });

    const { result } = renderHook(() => useRuns(subscribe));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runs).toEqual([]);
  });

  it('does not accept a non-array run response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'bad shape'
      })
    });

    const { result } = renderHook(() => useRuns(subscribe));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runs).toEqual([]);
  });
});

describe('useMatchups', () => {
  it('does not install an error object as matchup state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'unavailable'
      })
    });

    const { result } = renderHook(() => useMatchups(subscribe));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.matchups).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });
});
