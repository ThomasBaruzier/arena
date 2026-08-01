import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useVisualBoard } from './useVisualBoard';

const move = (x, y, c) => ({
  x,
  y,
  c
});

it('keeps earlier pending stones across overlapping appends', () => {
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

  const earlier = result.current.stones.filter((stone) => stone.status === 'entering');

  rerender({
    moves: [...first, move(2, 2, 2), move(3, 3, 1), move(4, 4, 2)]
  });

  const newest = result.current.stones.at(-1);
  const oldMarker = result.current.marker;

  expect(result.current.waitStoneIds).toEqual([earlier[0].id, earlier[1].id, newest.id]);

  act(() => {
    result.current.finishMarker(oldMarker.id, 'exiting');
    result.current.finishStone(newest.id, 'entering');
    result.current.finishStone(earlier[1].id, 'entering');
  });

  expect(result.current.marker).toBeNull();

  act(() => {
    result.current.finishStone(earlier[0].id, 'entering');
  });

  expect(result.current.marker).toMatchObject({
    x: 4,
    y: 4,
    c: 2,
    status: 'entering'
  });
});
