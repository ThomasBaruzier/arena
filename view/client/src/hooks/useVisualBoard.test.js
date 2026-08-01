import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVisualBoard, visualBoardReducer } from './useVisualBoard';

const move = (x, y, c) => ({
  x,
  y,
  c
});

const transitionState = () => ({
  stones: [
    {
      id: 'stone',
      status: 'entering'
    }
  ],
  marker: {
    id: 'old',
    status: 'exiting'
  },
  line: null,
  markerTarget: {
    id: 'next',
    status: 'entering'
  },
  waitStoneIds: ['stone'],
  clearStoneIds: null,
  operationToken: 1
});

describe('visualBoardReducer', () => {
  it('waits for marker and every required stone in either order', () => {
    const stoneDone = visualBoardReducer(transitionState(), {
      type: 'FINISH_STONE',
      id: 'stone',
      status: 'entering'
    });

    expect(stoneDone.marker.id).toBe('old');

    expect(
      visualBoardReducer(stoneDone, {
        type: 'FINISH_MARKER',
        id: 'old',
        status: 'exiting'
      }).marker
    ).toEqual({
      id: 'next',
      status: 'entering'
    });

    const markerDone = visualBoardReducer(transitionState(), {
      type: 'FINISH_MARKER',
      id: 'old',
      status: 'exiting'
    });

    expect(markerDone.marker).toBeNull();

    expect(
      visualBoardReducer(markerDone, {
        type: 'FINISH_STONE',
        id: 'stone',
        status: 'entering'
      }).marker
    ).toEqual({
      id: 'next',
      status: 'entering'
    });
  });

  it('ignores stale completion phases', () => {
    const state = transitionState();

    expect(
      visualBoardReducer(state, {
        type: 'FINISH_STONE',
        id: 'stone',
        status: 'exiting'
      })
    ).toBe(state);

    expect(
      visualBoardReducer(state, {
        type: 'FINISH_MARKER',
        id: 'old',
        status: 'entering'
      })
    ).toBe(state);
  });

  it('waits for every Replay stone', () => {
    const clearing = visualBoardReducer(
      {
        stones: [
          {
            id: 'a',
            status: 'stable'
          },
          {
            id: 'b',
            status: 'stable'
          }
        ],
        marker: null,
        line: null,
        markerTarget: null,
        waitStoneIds: [],
        clearStoneIds: null,
        operationToken: null
      },
      {
        type: 'CLEAR',
        operationToken: 1
      }
    );

    const first = visualBoardReducer(clearing, {
      type: 'FINISH_STONE',
      id: 'a',
      status: 'exiting'
    });

    expect(first.stones).toHaveLength(2);

    const complete = visualBoardReducer(first, {
      type: 'FINISH_STONE',
      id: 'b',
      status: 'exiting'
    });

    expect(complete.stones).toEqual([]);
    expect(complete.clearStoneIds).toBeNull();
  });
});

describe('useVisualBoard', () => {
  it('completes a tokenized Replay after every visual layer settles', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const complete = vi.fn();

    const { result, rerender } = renderHook(
      ({ moves, transition }) =>
        useVisualBoard({
          gameId: 1,
          moves,
          winningLine: [],
          transition,
          onTransitionComplete: complete
        }),
      {
        initialProps: {
          moves,
          transition: null
        }
      }
    );

    rerender({
      moves: [],
      transition: {
        token: 1,
        kind: 'replay'
      }
    });

    expect(result.current.transitioning).toBe(true);

    for (const stone of result.current.stones) {
      act(() => {
        result.current.finishStone(stone.id, 'exiting');
      });
    }

    if (result.current.marker) {
      act(() => {
        result.current.finishMarker(result.current.marker.id, 'exiting');
      });
    }

    expect(complete).toHaveBeenCalledWith(1);
  });

  it('completes a superseded token on game replacement', () => {
    const complete = vi.fn();

    const { rerender } = renderHook(
      ({ gameId, moves, transition }) =>
        useVisualBoard({
          gameId,
          moves,
          winningLine: [],
          transition,
          onTransitionComplete: complete
        }),
      {
        initialProps: {
          gameId: 1,
          moves: [move(1, 1, 1), move(2, 2, 2)],
          transition: null
        }
      }
    );

    rerender({
      gameId: 1,
      moves: [move(1, 1, 1)],
      transition: {
        token: 1,
        kind: 'previous'
      }
    });

    rerender({
      gameId: 2,
      moves: [],
      transition: null
    });

    expect(complete).toHaveBeenCalledWith(1);
  });

  it('waits for every appended stone before moving the marker', () => {
    const first = [move(1, 1, 1)];

    const { result, rerender } = renderHook(
      ({ moves }) =>
        useVisualBoard({
          gameId: 1,
          moves,
          winningLine: [],
          transition: null
        }),
      {
        initialProps: {
          moves: first
        }
      }
    );

    rerender({
      moves: [...first, move(2, 2, 2), move(3, 3, 1)]
    });

    const additions = result.current.stones.slice(-2);
    const oldMarker = result.current.marker;

    act(() => {
      result.current.finishMarker(oldMarker.id, 'exiting');
      result.current.finishStone(additions[1].id, 'entering');
    });

    expect(result.current.marker).toBeNull();

    act(() => {
      result.current.finishStone(additions[0].id, 'entering');
    });

    expect(result.current.marker).toMatchObject({
      x: 3,
      y: 3,
      status: 'entering'
    });
  });
});
