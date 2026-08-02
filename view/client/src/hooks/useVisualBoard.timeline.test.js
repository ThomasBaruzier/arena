import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVisualBoard } from './useVisualBoard';

const move = (index) => ({
  x: index % 20,
  y: Math.floor(index / 20),
  c: (index % 2) + 1
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps sustained 3x entrance scheduling bounded', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);

  const initial = [move(0)];
  const { result, rerender } = renderHook(
    ({ moves }) =>
      useVisualBoard({
        gameId: 1,
        moves,
        winningLine: [],
        motion: null
      }),
    {
      initialProps: { moves: initial }
    }
  );
  const moves = [...initial];

  for (let index = 1; index <= 20; index += 1) {
    const now = 1000 + index * 50;

    performance.now.mockReturnValue(now);
    moves.push(move(index));

    rerender({
      moves: [...moves]
    });

    const newest = result.current.stones.find((stone) => stone.index === index);

    expect(newest.startAt - now).toBeLessThanOrEqual(0);
  }
});

it('drops only a future invisible entrance during Replay', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);

  const first = [move(0)];
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
        moves: first,
        motion: null
      }
    }
  );

  rerender({
    moves: [...first, move(1), move(2)],
    motion: {
      token: 1,
      kind: 'next'
    }
  });

  expect(result.current.stones.find((stone) => stone.index === 2)).toMatchObject({
    status: 'entering',
    startAt: 1040
  });

  performance.now.mockReturnValue(1020);

  rerender({
    moves: [],
    motion: {
      token: 2,
      kind: 'replay'
    }
  });

  expect(result.current.stones.some((stone) => stone.index === 2)).toBe(false);
  expect(result.current.stones.find((stone) => stone.index === 0)).toMatchObject({
    status: 'exiting',
    startAt: 1020,
    duration: 100
  });
  expect(result.current.stones.find((stone) => stone.index === 1)).toMatchObject({
    status: 'exiting',
    startAt: 1020,
    duration: 100
  });
});

it('does not let a later batch overtake a scheduled move', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);

  const first = [move(0)];
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
    moves: [...first, move(1), move(2)]
  });

  performance.now.mockReturnValue(1010);

  rerender({
    moves: [...first, move(1), move(2), move(3)]
  });

  expect(
    result.current.stones
      .filter((stone) => stone.status === 'entering')
      .map((stone) => stone.startAt)
  ).toEqual([1000, 1040, 1080]);
});
