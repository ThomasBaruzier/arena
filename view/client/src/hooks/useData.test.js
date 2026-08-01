import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchupsReducer, useMatchups, useRuns } from './useData';

const baseMatchup = {
  runId: 'run',
  status: 'live',
  hero: {
    id: 'run:1',
    slot: 1,
    name: 'Alpha',
    version: '1.0'
  },
  villain: {
    id: 'run:2',
    slot: 2,
    name: 'Beta',
    version: '2.0'
  },
  heroWins: 0,
  villainWins: 0,
  draws: 0,
  total: 0,
  live_count: 0,
  lastActivity: '2026-01-01T00:00:00Z'
};

const response = (data) => ({
  ok: true,
  json: async () => data
});

const deferred = () => {
  let resolve;

  return {
    promise: new Promise((complete) => {
      resolve = complete;
    }),
    resolve
  };
};

const subscribe = vi.fn(() => () => {});

const liveSubscription = () => {
  let listener = null;

  return {
    subscribe: (callback) => {
      listener = callback;
      return () => {};
    },
    emit: (event) => listener?.(event)
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  subscribe.mockClear();
});

describe('matchupsReducer', () => {
  it('creates canonical slot order from a reversed game', () => {
    const next = matchupsReducer([], {
      type: 'game_start',
      event: {
        game: {
          id: 1,
          run_id: 'new',
          black_slot: 2,
          white_slot: 1,
          black_name: 'Beta',
          black_ver: '2.0',
          white_name: 'Alpha',
          white_ver: '1.0',
          winner_color: 0,
          timestamp: '2026-01-01T00:00:00Z'
        }
      }
    });

    expect(next[0].hero).toMatchObject({
      slot: 1,
      name: 'Alpha',
      version: '1.0'
    });

    expect(next[0].villain).toMatchObject({
      slot: 2,
      name: 'Beta',
      version: '2.0'
    });
  });

  it('merges the complete run snapshot', () => {
    const next = matchupsReducer([baseMatchup], {
      type: 'run_update',
      event: {
        run: {
          id: 'run',
          status: 'stopped',
          analysis_enabled: 1,
          games_played: 9,
          wins: 4,
          losses: 2,
          draws: 3,
          p1_eff: 92,
          slot1_name: 'Updated Alpha',
          slot1_version: '1.1',
          slot2_name: 'Updated Beta',
          slot2_version: '2.1'
        }
      }
    });

    expect(next[0]).toMatchObject({
      status: 'stopped',
      heroWins: 4,
      villainWins: 2,
      draws: 3,
      total: 9
    });

    expect(next[0].run).toMatchObject({
      id: 'run',
      analysis_enabled: 1,
      p1_eff: 92
    });

    expect(next[0].hero).toMatchObject({
      name: 'Updated Alpha',
      version: '1.1'
    });
  });

  it('leaves totals authoritative until a run update', () => {
    const current = {
      ...baseMatchup,
      heroWins: 2,
      villainWins: 1,
      draws: 3,
      total: 6,
      live_count: 1
    };

    const next = matchupsReducer([current], {
      type: 'game_result',
      event: {
        run_id: 'run',
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
});

describe('useRuns', () => {
  it('ignores an older refresh response', async () => {
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
            id: 'new'
          }
        ])
      );

      await refreshPromise;
    });

    expect(result.current.runs).toEqual([
      {
        id: 'new'
      }
    ]);

    await act(async () => {
      first.resolve(
        response([
          {
            id: 'old'
          }
        ])
      );

      await first.promise;
    });

    expect(result.current.runs).toEqual([
      {
        id: 'new'
      }
    ]);
  });

  it('does not let a late refresh erase a recovered run', async () => {
    const request = deferred();
    const stream = liveSubscription();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(request.promise);

    const { result } = renderHook(() => useRuns(stream.subscribe));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const signal = fetchMock.mock.calls[0][1].signal;

    act(() => {
      stream.emit({
        type: 'run_start',
        run: {
          id: 'recovered',
          status: 'live',
          games_played: 0
        }
      });
    });

    expect(signal.aborted).toBe(true);

    expect(result.current.runs).toEqual([
      {
        id: 'recovered',
        status: 'live',
        games_played: 0
      }
    ]);

    await act(async () => {
      request.resolve(response([]));

      await request.promise;
      await Promise.resolve();
    });

    expect(result.current.runs).toEqual([
      {
        id: 'recovered',
        status: 'live',
        games_played: 0
      }
    ]);
  });

  it('upserts a missing run update', async () => {
    const stream = liveSubscription();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([]));

    const { result } = renderHook(() => useRuns(stream.subscribe));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      stream.emit({
        type: 'run_update',
        run: {
          id: 'recovered',
          status: 'live',
          games_played: 3,
          wins: 2
        }
      });
    });

    expect(result.current.runs).toEqual([
      {
        id: 'recovered',
        status: 'live',
        games_played: 3,
        wins: 2
      }
    ]);
  });

  it('rejects unsuccessful collections', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'bad'
      })
    });

    const { result } = renderHook(() => useRuns(subscribe));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runs).toEqual([]);
  });
});

describe('useMatchups', () => {
  it('does not install an invalid response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'bad shape'
      })
    });

    const { result } = renderHook(() => useMatchups(subscribe));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.matchups).toEqual([]);

    expect(result.current.hasMore).toBe(false);
  });
});
