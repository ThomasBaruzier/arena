import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchupsReducer, useRuns } from './useData';

const baseMatchup = {
  runId: 'run_full',
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

afterEach(() => {
  vi.restoreAllMocks();
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
          slot1_name: 'alpha',
          slot1_version: '1.0',
          slot1_cmd: './alpha',
          slot1_mtime: 1,
          slot2_name: 'zeta',
          slot2_version: '99.0',
          slot2_cmd: './zeta',
          slot2_mtime: 999999,
          wins: 4,
          losses: 2,
          draws: 5,
          games_played: 11
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
    const first = [{ id: 'r1', games_played: 1 }];
    const second = [{ id: 'r1', games_played: 2 }];

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        json: async () => first
      })
      .mockResolvedValueOnce({
        json: async () => second
      });

    const subscribe = vi.fn(() => () => {});
    const { result } = renderHook(() => useRuns(subscribe));

    await waitFor(() => expect(result.current.runs).toEqual(first));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.runs).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/runs');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/runs');
  });
});
