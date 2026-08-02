import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualBoard, visualBoardReducer } from './useVisualBoard';

const move = (x, y, c) => ({ x, y, c });

const line = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 4, y: 0 }
];

const state = () => ({
  stones: [
    {
      id: 'stone-in',
      status: 'entering',
      startAt: 1000,
      duration: 150
    },
    {
      id: 'stone-out',
      status: 'exiting',
      startAt: 1000,
      duration: 100
    }
  ],
  markers: [
    {
      id: 'marker-in',
      status: 'entering',
      startAt: 1000,
      duration: 150
    },
    {
      id: 'marker-out',
      status: 'exiting',
      startAt: 1000,
      duration: 100
    }
  ],
  line: {
    id: 'line',
    status: 'entering',
    startAt: 1000,
    duration: 260
  }
});

describe('visualBoardReducer', () => {
  it('settles only the matching entering stone', () => {
    const current = state();
    const next = visualBoardReducer(current, {
      type: 'FINISH_STONE',
      id: 'stone-in',
      status: 'entering'
    });

    expect(next.stones[0]).toMatchObject({
      id: 'stone-in',
      status: 'stable',
      startAt: 0,
      duration: 0
    });
    expect(next.stones[1]).toBe(current.stones[1]);
  });

  it('removes only matching exiting layers', () => {
    const stone = visualBoardReducer(state(), {
      type: 'FINISH_STONE',
      id: 'stone-out',
      status: 'exiting'
    });

    expect(stone.stones.map((current) => current.id)).toEqual(['stone-in']);

    const marker = visualBoardReducer(stone, {
      type: 'FINISH_MARKER',
      id: 'marker-out',
      status: 'exiting'
    });

    expect(marker.markers.map((current) => current.id)).toEqual(['marker-in']);
  });

  it('ignores stale completion', () => {
    const current = state();

    expect(
      visualBoardReducer(current, {
        type: 'FINISH_STONE',
        id: 'stone-in',
        status: 'exiting'
      })
    ).toBe(current);

    expect(
      visualBoardReducer(current, {
        type: 'FINISH_MARKER',
        id: 'marker-out',
        status: 'entering'
      })
    ).toBe(current);

    expect(
      visualBoardReducer(current, {
        type: 'FINISH_LINE',
        id: 'missing',
        status: 'entering'
      })
    ).toBe(current);
  });

  it('settles and removes the winning line', () => {
    const settled = visualBoardReducer(state(), {
      type: 'FINISH_LINE',
      id: 'line',
      status: 'entering'
    });

    expect(settled.line).toMatchObject({
      id: 'line',
      status: 'stable',
      startAt: 0,
      duration: 0
    });

    const exiting = {
      ...settled,
      line: {
        ...settled.line,
        status: 'exiting',
        duration: 260
      }
    };

    expect(
      visualBoardReducer(exiting, {
        type: 'FINISH_LINE',
        id: 'line',
        status: 'exiting'
      }).line
    ).toBeNull();
  });
});

describe('useVisualBoard', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an initial position as stable', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const { result } = renderHook(() =>
      useVisualBoard({
        gameId: 1,
        moves,
        winningLine: [],
        motion: null
      })
    );

    expect(result.current.stones.every((stone) => stone.status === 'stable')).toBe(
      true
    );
    expect(result.current.markers).toEqual([
      expect.objectContaining({
        x: 2,
        y: 2,
        status: 'stable'
      })
    ]);
  });

  it('schedules a batched append and marker together', () => {
    const first = [move(1, 1, 1)];
    const { result, rerender } = renderHook(
      ({ moves }) =>
        useVisualBoard({
          gameId: 1,
          moves,
          winningLine: [],
          motion: null
        }),
      {
        initialProps: { moves: first }
      }
    );

    rerender({
      moves: [...first, move(2, 2, 2), move(3, 3, 1)]
    });

    const additions = result.current.stones.filter(
      (stone) => stone.status === 'entering'
    );

    expect(additions.map((stone) => stone.startAt)).toEqual([1000, 1040]);
    expect(result.current.markers.find((marker) => marker.x === 3)).toMatchObject({
      status: 'entering',
      startAt: 1040,
      duration: 150
    });
  });

  it('crossfades markers while stepping backward', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const { result, rerender } = renderHook(
      ({ moves }) =>
        useVisualBoard({
          gameId: 1,
          moves,
          winningLine: [],
          motion: null
        }),
      {
        initialProps: { moves }
      }
    );

    rerender({
      moves: moves.slice(0, 1)
    });

    expect(result.current.stones.find((stone) => stone.index === 1)).toMatchObject({
      status: 'exiting',
      startAt: 1000,
      duration: 100
    });
    expect(result.current.markers.find((marker) => marker.index === 1)).toMatchObject({
      status: 'exiting',
      duration: 100
    });
    expect(result.current.markers.find((marker) => marker.index === 0)).toMatchObject({
      status: 'entering',
      startAt: 1000,
      duration: 100
    });
  });

  it('reverses Replay when the first move is requested again', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const { result, rerender } = renderHook(
      ({ moves, motion }) =>
        useVisualBoard({
          gameId: 1,
          moves,
          winningLine: [],
          motion
        }),
      {
        initialProps: {
          moves,
          motion: null
        }
      }
    );

    rerender({
      moves: [],
      motion: {
        token: 1,
        kind: 'replay'
      }
    });

    const first = result.current.stones.find((stone) => stone.index === 0);

    expect(first.status).toBe('exiting');

    rerender({
      moves: moves.slice(0, 1),
      motion: {
        token: 2,
        kind: 'next'
      }
    });

    expect(result.current.stones.find((stone) => stone.index === 0)).toMatchObject({
      id: first.id,
      status: 'entering',
      startAt: 1000,
      duration: 150
    });
  });

  it('reverses the same winning line identity', () => {
    const final = [
      move(0, 0, 1),
      move(0, 1, 2),
      move(1, 0, 1),
      move(1, 1, 2),
      move(2, 0, 1),
      move(2, 1, 2),
      move(3, 0, 1),
      move(3, 1, 2),
      move(4, 0, 1)
    ];
    const { result, rerender } = renderHook(
      ({ moves, winningLine }) =>
        useVisualBoard({
          gameId: 1,
          moves,
          winningLine,
          motion: null
        }),
      {
        initialProps: {
          moves: final,
          winningLine: line
        }
      }
    );

    rerender({
      moves: final.slice(0, -1),
      winningLine: []
    });

    const exiting = result.current.line;

    expect(exiting.status).toBe('exiting');

    rerender({
      moves: final,
      winningLine: line
    });

    expect(result.current.line).toMatchObject({
      id: exiting.id,
      status: 'entering',
      duration: 260
    });

    act(() => {
      result.current.finishLine(exiting.id, 'exiting');
    });

    expect(result.current.line).toMatchObject({
      id: exiting.id,
      status: 'entering'
    });
  });
});
