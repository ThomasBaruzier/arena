import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVisualBoard } from './useVisualBoard';

const move = (x, y, c) => ({ x, y, c });

afterEach(() => {
  vi.restoreAllMocks();
});

it('preserves chronological starts when another append arrives early', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);

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

  const pending = result.current.stones
    .filter((stone) => stone.status === 'entering')
    .map((stone) => ({
      id: stone.id,
      startAt: stone.startAt
    }));

  expect(pending.map(({ startAt }) => startAt)).toEqual([1000, 1040]);

  performance.now.mockReturnValue(1020);

  rerender({
    moves: [...first, move(2, 2, 2), move(3, 3, 1), move(4, 4, 2)]
  });

  expect(
    result.current.stones
      .filter((stone) => stone.index === 1 || stone.index === 2)
      .map((stone) => stone.id)
  ).toEqual(pending.map(({ id }) => id));
  expect(result.current.stones.find((stone) => stone.index === 3)).toMatchObject({
    status: 'entering',
    startAt: 1080
  });
  expect(result.current.markers.find((marker) => marker.index === 3)).toMatchObject({
    status: 'entering',
    startAt: 1080
  });
});

it('reverses a marker that has already started entering', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);

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
    moves: [...first, move(2, 2, 2)]
  });

  const entering = result.current.markers.find((marker) => marker.index === 1);

  performance.now.mockReturnValue(1050);

  rerender({
    moves: [...first, move(2, 2, 2), move(3, 3, 1)]
  });

  expect(
    result.current.markers.find((marker) => marker.id === entering.id)
  ).toMatchObject({
    status: 'exiting',
    startAt: 1050,
    duration: 150
  });
  expect(result.current.markers.find((marker) => marker.index === 2)).toMatchObject({
    status: 'entering',
    startAt: 1050,
    duration: 150
  });
});
