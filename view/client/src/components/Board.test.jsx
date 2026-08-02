import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Board from './Board';

const move = (x, y, c) => ({ x, y, c });

const finishTransition = (element) => {
  const event = new Event('transitionend', { bubbles: true });

  Object.defineProperty(event, 'propertyName', {
    value: 'opacity'
  });

  fireEvent(element, event);
};

const renderBoard = (props = {}) =>
  render(
    <Board
      gameId={1}
      parsedMoves={[]}
      moveIndex={0}
      winnerColor={0}
      motion={null}
      boardSize={20}
      {...props}
    />
  );

const markerAt = (x, y) =>
  screen
    .queryAllByTestId('last-move-marker')
    .find(
      (marker) => marker.style.left === `${x * 5}%` && marker.style.top === `${y * 5}%`
    );

describe('Board', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a loaded position without motion', () => {
    renderBoard({
      parsedMoves: [move(1, 1, 1), move(2, 2, 2)],
      moveIndex: 2
    });

    expect(screen.getByTestId('stone-1-1')).toHaveClass('stable');
    expect(screen.getByTestId('stone-2-2')).toHaveClass('stable');
    expect(screen.getByTestId('last-move-marker')).toHaveClass('stable', 'on-white');
  });

  it('starts the marker with the final appended stone', () => {
    const first = [move(1, 1, 1)];
    const next = [...first, move(2, 2, 2), move(3, 3, 1)];
    const { rerender } = renderBoard({
      parsedMoves: first,
      moveIndex: 1
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={next}
        moveIndex={3}
        winnerColor={0}
        motion={{ token: 1, kind: 'next' }}
        boardSize={20}
      />
    );

    const firstStone = screen.getByTestId('stone-2-2');
    const finalStone = screen.getByTestId('stone-3-3');
    const oldMarker = markerAt(1, 1);
    const newMarker = markerAt(3, 3);

    expect(firstStone).toHaveClass('entering');
    expect(finalStone).toHaveClass('entering');
    expect(finalStone.style.getPropertyValue('--stone-delay')).toBe('40ms');
    expect(finalStone.style.getPropertyValue('--stone-duration')).toBe('150ms');
    expect(oldMarker).toHaveClass('exiting');
    expect(newMarker).toHaveClass('entering', 'on-black');
    expect(newMarker.style.getPropertyValue('--marker-delay')).toBe('40ms');
    expect(newMarker.style.getPropertyValue('--marker-duration')).toBe('150ms');
  });

  it('crossfades markers while stepping backward', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const { rerender } = renderBoard({
      parsedMoves: moves,
      moveIndex: 2
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={1}
        winnerColor={0}
        motion={{ token: 1, kind: 'previous' }}
        boardSize={20}
      />
    );

    const departingStone = screen.getByTestId('stone-2-2');
    const departingMarker = markerAt(2, 2);
    const previousMarker = markerAt(1, 1);

    expect(departingStone).toHaveClass('exiting');
    expect(departingMarker).toHaveClass('exiting');
    expect(previousMarker).toHaveClass('entering', 'on-black');
    expect(departingStone.style.getPropertyValue('--stone-duration')).toBe('100ms');
    expect(departingMarker.style.getPropertyValue('--marker-duration')).toBe('100ms');
    expect(previousMarker.style.getPropertyValue('--marker-duration')).toBe('100ms');
  });

  it('clears every visible stone together for Replay', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2), move(3, 3, 1)];
    const { rerender } = renderBoard({
      parsedMoves: moves,
      moveIndex: 3
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={0}
        winnerColor={0}
        motion={{ token: 1, kind: 'replay' }}
        boardSize={20}
      />
    );

    const stones = screen.getAllByTestId(/^stone-/);

    expect(stones).toHaveLength(3);

    for (const stone of stones) {
      expect(stone).toHaveClass('exiting');
      expect(stone.style.getPropertyValue('--stone-delay')).toBe('0ms');
      expect(stone.style.getPropertyValue('--stone-duration')).toBe('100ms');
    }

    expect(screen.getByTestId('last-move-marker')).toHaveClass('exiting');
  });

  it('revives a desired stone before Replay completes', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const { rerender } = renderBoard({
      parsedMoves: moves,
      moveIndex: 2
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={0}
        winnerColor={0}
        motion={{ token: 1, kind: 'replay' }}
        boardSize={20}
      />
    );

    const first = screen.getByTestId('stone-1-1');

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={1}
        winnerColor={0}
        motion={{ token: 2, kind: 'next' }}
        boardSize={20}
      />
    );

    expect(screen.getByTestId('stone-1-1')).toBe(first);
    expect(first).toHaveClass('entering');
    expect(markerAt(1, 1)).toHaveClass('entering');

    finishTransition(first);

    expect(screen.getByTestId('stone-1-1')).toHaveClass('stable');
  });

  it('retracts and restores the same winning line', () => {
    const moves = [
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
    const { rerender } = renderBoard({
      parsedMoves: moves,
      moveIndex: 9,
      winnerColor: 1
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={8}
        winnerColor={1}
        motion={{ token: 1, kind: 'previous' }}
        boardSize={20}
      />
    );

    const line = screen.getByTestId('win-line');

    expect(line).toHaveClass('exiting');

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={9}
        winnerColor={1}
        motion={{ token: 2, kind: 'next' }}
        boardSize={20}
      />
    );

    expect(screen.getByTestId('win-line')).toBe(line);
    expect(line).toHaveClass('entering');

    fireEvent.transitionEnd(line, {
      propertyName: 'opacity'
    });

    expect(screen.getByTestId('win-line')).toHaveClass('stable');
  });

  it('keeps the marker independent from the stone', () => {
    renderBoard({
      parsedMoves: [move(1, 1, 1)],
      moveIndex: 1
    });

    const stone = screen.getByTestId('stone-1-1');
    const marker = screen.getByTestId('last-move-marker');

    expect(stone.contains(marker)).toBe(false);
  });
});
