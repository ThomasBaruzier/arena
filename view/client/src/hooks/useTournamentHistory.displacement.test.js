import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useTournamentHistory } from './useTournamentHistory';

const response = (data) => ({
  ok: true,
  json: async () => data
});

const game = (id) => ({
  id,
  external_id: `run_${id}_0`,
  group_id: `run_${id}`,
  run_id: 'run',
  timestamp: '2026-01-01T00:00:00Z',
  winner_color: 0,
  move_count: id,
  black_slot: 1,
  white_slot: 2,
  board_size: 20,
  opening_len: 0,
  duration: id * 100
});

const pair = (id) => ({
  group_id: `run_${id}`,
  pair_size: 1,
  latest_ts: '2026-01-01T00:00:00Z',
  max_id: id,
  min_moves: id,
  max_moves: id,
  live_count: 1,
  duration: id * 100,
  slot1_wins: 0,
  games: [game(id)]
});

const stream = () => {
  let listener = null;

  return {
    subscribe: (callback) => {
      listener = callback;

      return () => {
        listener = null;
      };
    },
    emit: (event) => listener?.(event)
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

it('restores a live-displaced boundary pair after pagination', async () => {
  const firstPage = Array.from({ length: 50 }, (_, index) => pair(100 - index));
  const source = stream();
  const onPrepared = vi.fn();

  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response(firstPage))
    .mockResolvedValueOnce(response([pair(50)]));

  const { result, rerender } = renderHook(
    ({ phase, token }) =>
      useTournamentHistory({
        runId: 'run',
        phase,
        preparationToken: token,
        subscribe: source.subscribe,
        onPrepared
      }),
    {
      initialProps: {
        phase: 'preparing',
        token: 1
      }
    }
  );

  await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));

  expect(result.current.pairs.at(-1).max_id).toBe(51);

  rerender({
    phase: 'open',
    token: null
  });

  act(() => {
    source.emit({
      type: 'game_start',
      run_id: 'run',
      pair: pair(1000)
    });
  });

  await waitFor(() => expect(result.current.pairs[0].max_id).toBe(1000));

  expect(result.current.pairs).toHaveLength(50);
  expect(result.current.pairs.some((current) => current.max_id === 51)).toBe(false);

  act(() => {
    result.current.loadMore();
  });

  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.fetching).toBe(false));

  const ids = result.current.pairs.map((current) => current.max_id);

  expect(ids.filter((id) => id === 51)).toHaveLength(1);
  expect(ids.filter((id) => id === 50)).toHaveLength(1);
  expect(result.current.pairs).toHaveLength(52);
});

it('exposes live growth beyond a short initial page without refetching', async () => {
  const source = stream();
  const onPrepared = vi.fn();
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response([pair(1)]));

  const { result, rerender } = renderHook(
    ({ phase, token }) =>
      useTournamentHistory({
        runId: 'run',
        phase,
        preparationToken: token,
        subscribe: source.subscribe,
        onPrepared
      }),
    {
      initialProps: {
        phase: 'preparing',
        token: 1
      }
    }
  );

  await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));

  rerender({
    phase: 'open',
    token: null
  });

  act(() => {
    for (let id = 2; id <= 60; id += 1) {
      source.emit({
        type: 'game_start',
        run_id: 'run',
        pair: pair(id)
      });
    }
  });

  await waitFor(() => expect(result.current.pairs).toHaveLength(50));

  expect(result.current.hasMore).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.loadMore();
  });

  await waitFor(() => expect(result.current.pairs).toHaveLength(60));

  const ids = result.current.pairs.map((current) => current.max_id);

  expect(new Set(ids).size).toBe(60);
  expect(ids).toEqual(Array.from({ length: 60 }, (_, index) => 60 - index));
  expect(result.current.hasMore).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
