import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTournamentHistory } from './useTournamentHistory';

const response = (data, ok = true) => ({
  ok,
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

const game = (id, groupId, blackSlot = 1, overrides = {}) => ({
  id,
  external_id: `${groupId}_${blackSlot === 1 ? 0 : 1}`,
  group_id: groupId,
  run_id: 'run',
  timestamp: '2026-01-01T00:00:00Z',
  winner_color: 0,
  move_count: 0,
  black_slot: blackSlot,
  white_slot: blackSlot === 1 ? 2 : 1,
  board_size: 20,
  opening_len: 0,
  duration: 0,
  ...overrides
});

const pair = (id, overrides = {}) => {
  const groupId = `run_${id}`;
  const currentGame = game(id, groupId, id % 2 ? 1 : 2, {
    move_count: id,
    duration: id * 100,
    ...overrides.game
  });

  return {
    group_id: groupId,
    pair_size: 1,
    latest_ts: currentGame.timestamp,
    max_id: id,
    min_moves: currentGame.move_count,
    max_moves: currentGame.move_count,
    live_count: currentGame.winner_color === 0 ? 1 : 0,
    duration: currentGame.duration,
    slot1_wins: 0,
    games: [currentGame]
  };
};

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

const setup = ({
  phase = 'preparing',
  token = 1,
  onPrepared = vi.fn(),
  source = stream()
} = {}) => {
  const hook = renderHook(
    ({ currentPhase, currentToken }) =>
      useTournamentHistory({
        runId: 'run',
        phase: currentPhase,
        preparationToken: currentToken,
        subscribe: source.subscribe,
        onPrepared
      }),
    {
      initialProps: {
        currentPhase: phase,
        currentToken: token
      }
    }
  );

  return {
    ...hook,
    onPrepared,
    source
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTournamentHistory', () => {
  it('prepares a canonical first page', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([pair(1)]));

    const { result, onPrepared } = setup();

    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));

    expect(fetchMock.mock.calls[0][0]).not.toContain('hero_slot');
    expect(result.current.pairs).toHaveLength(1);
  });

  it('replays buffered state after success without regression', async () => {
    const request = deferred();
    const source = stream();

    vi.spyOn(globalThis, 'fetch').mockReturnValue(request.promise);

    const { result, onPrepared } = setup({
      source
    });

    act(() => {
      source.emit({
        type: 'game_move',
        run_id: 'run',
        pair: pair(1, {
          game: {
            move_count: 4,
            duration: 100
          }
        })
      });
    });

    await act(async () => {
      request.resolve(
        response([
          pair(1, {
            game: {
              move_count: 12,
              duration: 900,
              winner_color: 1
            }
          })
        ])
      );

      await request.promise;
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalled());

    expect(result.current.pairs[0].games[0]).toMatchObject({
      move_count: 12,
      duration: 900,
      winner_color: 1
    });
  });

  it('replays buffered state after initial failure', async () => {
    const request = deferred();
    const source = stream();

    vi.spyOn(globalThis, 'fetch').mockReturnValue(request.promise);

    const { result, onPrepared } = setup({
      source
    });

    act(() => {
      source.emit({
        type: 'game_move',
        run_id: 'run',
        pair: pair(1)
      });
    });

    await act(async () => {
      request.resolve(
        response(
          {
            error: 'failed'
          },
          false
        )
      );

      await request.promise;
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalled());

    expect(result.current.pairs).toHaveLength(1);
    expect(result.current.error).toBe(true);
  });

  it('opens Retry when a fresh preparation fails over cached rows', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response([pair(1)]))
      .mockResolvedValueOnce(
        response(
          {
            error: 'failed'
          },
          false
        )
      )
      .mockResolvedValueOnce(response([pair(2)]));

    const { result, rerender, onPrepared } = setup();

    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));
    expect(result.current.pairs.map((current) => current.max_id)).toEqual([1]);

    rerender({
      currentPhase: 'open',
      currentToken: null
    });

    rerender({
      currentPhase: 'closed',
      currentToken: null
    });

    rerender({
      currentPhase: 'preparing',
      currentToken: 2
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(2));

    expect(result.current.error).toBe(true);
    expect(result.current.pairs.map((current) => current.max_id)).toEqual([1]);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.fetching).toBe(false));

    expect(result.current.error).toBe(false);
    expect(result.current.pairs.map((current) => current.max_id)).toEqual([2]);
  });

  it('keeps Retry visible when Retry fails over cached rows', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response([pair(1)]))
      .mockResolvedValue(
        response(
          {
            error: 'failed'
          },
          false
        )
      );

    const { result, rerender, onPrepared } = setup();

    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));

    rerender({
      currentPhase: 'preparing',
      currentToken: 2
    });

    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBe(true);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.fetching).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.pairs).toHaveLength(1);
  });

  it('keeps rows visible after a sort failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response([pair(2), pair(1)]))
      .mockResolvedValueOnce(
        response(
          {
            error: 'failed'
          },
          false
        )
      );

    const { result, rerender } = setup();

    await waitFor(() => expect(result.current.pairs).toHaveLength(2));

    rerender({
      currentPhase: 'open',
      currentToken: null
    });

    act(() => {
      result.current.sortBy('duration');
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(result.current.fetching).toBe(false));

    expect(result.current.pairs).toHaveLength(2);
    expect(result.current.error).toBe(false);
    expect(result.current.paginationError).toBe(false);
    expect(result.current.pendingSort).toBeNull();
  });

  it('keeps pagination available after failure and retries it', async () => {
    const firstPage = Array.from(
      {
        length: 50
      },
      (_, index) => pair(100 - index)
    );

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(
        response(
          {
            error: 'failed'
          },
          false
        )
      )
      .mockResolvedValueOnce(response([pair(50)]));

    const { result, rerender } = setup();

    await waitFor(() => expect(result.current.hasMore).toBe(true));

    rerender({
      currentPhase: 'open',
      currentToken: null
    });

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.paginationError).toBe(true));

    expect(result.current.pairs).toHaveLength(50);
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.retryPage();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await waitFor(() => expect(result.current.fetching).toBe(false));

    expect(result.current.paginationError).toBe(false);
    expect(result.current.pairs).toHaveLength(51);
    expect(result.current.hasMore).toBe(false);
  });

  it('bounds streamed pairs to loaded capacity', async () => {
    const source = stream();
    const firstPage = Array.from(
      {
        length: 50
      },
      (_, index) => pair(100 - index)
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(firstPage));

    const { result, rerender } = setup({
      source
    });

    await waitFor(() => expect(result.current.pairs).toHaveLength(50));

    rerender({
      currentPhase: 'open',
      currentToken: null
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
  });

  it('shows initial Retry without usable rows', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(
        {
          error: 'failed'
        },
        false
      )
    );

    const { result, onPrepared } = setup();

    await waitFor(() => expect(onPrepared).toHaveBeenCalled());

    expect(result.current.pairs).toEqual([]);
    expect(result.current.error).toBe(true);
    expect(result.current.paginationError).toBe(false);
  });
});
