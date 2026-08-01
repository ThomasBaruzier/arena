import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Board from './Board';

const move = (x, y, c) => ({
  x,
  y,
  c
});

const dispatchAnimation = (element, type, animationName) => {
  const event = new Event(type, {
    bubbles: true
  });

  Object.defineProperty(event, 'animationName', {
    value: animationName
  });

  fireEvent(element, event);
};

const finishAnimation = (element, animationName) =>
  dispatchAnimation(element, 'animationend', animationName);

const cancelAnimation = (element, animationName) =>
  dispatchAnimation(element, 'animationcancel', animationName);

const renderBoard = (props = {}) =>
  render(
    <Board
      gameId={1}
      parsedMoves={[]}
      moveIndex={0}
      winnerColor={0}
      transition={null}
      boardSize={20}
      onTransitionChange={vi.fn()}
      onTransitionComplete={vi.fn()}
      {...props}
    />
  );

describe('Board', () => {
  it('renders an initial position without motion', () => {
    renderBoard({
      parsedMoves: [move(1, 1, 1), move(2, 2, 2)],
      moveIndex: 2
    });

    expect(screen.getByTestId('stone-1-1')).toHaveClass('stable');

    expect(screen.getByTestId('last-move-marker')).toHaveClass('on-white', 'stable');
  });

  it('waits for every fast append before changing marker', () => {
    const first = [move(1, 1, 1)];
    const next = [...first, move(2, 2, 2), move(3, 3, 1)];

    const { rerender } = renderBoard({
      parsedMoves: first,
      moveIndex: 1
    });

    const oldMarker = screen.getByTestId('last-move-marker');

    rerender(
      <Board
        gameId={1}
        parsedMoves={next}
        moveIndex={3}
        winnerColor={0}
        transition={null}
        boardSize={20}
      />
    );

    finishAnimation(screen.getByTestId('stone-3-3'), 'arena-stone-enter');
    finishAnimation(oldMarker, 'arena-marker-exit');

    expect(screen.queryByTestId('last-move-marker')).not.toBeInTheDocument();

    finishAnimation(screen.getByTestId('stone-2-2'), 'arena-stone-enter');

    expect(screen.getByTestId('last-move-marker')).toHaveClass('on-black', 'entering');
  });

  it('marks the previous move after rewind completes', () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const onTransitionComplete = vi.fn();

    const { rerender } = renderBoard({
      parsedMoves: moves,
      moveIndex: 2,
      onTransitionComplete
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={1}
        winnerColor={0}
        transition={{
          token: 1,
          kind: 'previous'
        }}
        boardSize={20}
        onTransitionComplete={onTransitionComplete}
      />
    );

    const exitingStone = screen.getByTestId('stone-2-2');
    const exitingMarker = screen.getByTestId('last-move-marker');

    finishAnimation(exitingMarker, 'arena-marker-exit');
    finishAnimation(exitingStone, 'arena-stone-exit');

    const marker = screen.getByTestId('last-move-marker');

    expect(marker).toHaveClass('on-black', 'entering');

    finishAnimation(marker, 'arena-marker-enter');

    expect(onTransitionComplete).toHaveBeenCalledWith(1);
  });

  it('ignores stale cancellation and completes the active phase', async () => {
    const moves = [move(1, 1, 1), move(2, 2, 2)];
    const onTransitionComplete = vi.fn();

    const { rerender } = renderBoard({
      parsedMoves: moves,
      moveIndex: 2,
      onTransitionComplete
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={1}
        winnerColor={0}
        transition={{
          token: 1,
          kind: 'previous'
        }}
        boardSize={20}
        onTransitionComplete={onTransitionComplete}
      />
    );

    const exitingMarker = screen.getByTestId('last-move-marker');
    const exitingStone = screen.getByTestId('stone-2-2');

    cancelAnimation(exitingMarker, 'arena-marker-enter');
    cancelAnimation(exitingStone, 'arena-stone-enter');

    expect(exitingMarker).toHaveClass('exiting');
    expect(exitingStone).toHaveClass('exiting');

    cancelAnimation(exitingMarker, 'arena-marker-exit');
    cancelAnimation(exitingStone, 'arena-stone-exit');

    const marker = screen.getByTestId('last-move-marker');

    cancelAnimation(marker, 'arena-marker-enter');

    await waitFor(() => expect(onTransitionComplete).toHaveBeenCalledWith(1));
  });

  it('waits for every Replay stone', async () => {
    const moves = [move(1, 1, 1), move(2, 2, 2), move(3, 3, 1)];
    const onTransitionComplete = vi.fn();

    const { rerender } = renderBoard({
      parsedMoves: moves,
      moveIndex: 3,
      onTransitionComplete
    });

    rerender(
      <Board
        gameId={1}
        parsedMoves={moves}
        moveIndex={0}
        winnerColor={0}
        transition={{
          token: 1,
          kind: 'replay'
        }}
        boardSize={20}
        onTransitionComplete={onTransitionComplete}
      />
    );

    const stones = screen.getAllByTestId(/^stone-/);

    finishAnimation(stones[0], 'arena-stone-exit');

    expect(screen.getAllByTestId(/^stone-/)).toHaveLength(3);

    for (const stone of stones.slice(1)) {
      finishAnimation(stone, 'arena-stone-exit');
    }

    const marker = screen.queryByTestId('last-move-marker');

    if (marker) {
      finishAnimation(marker, 'arena-marker-exit');
    }

    expect(screen.queryAllByTestId(/^stone-/)).toHaveLength(0);

    await waitFor(() => expect(onTransitionComplete).toHaveBeenCalledWith(1));
  });

  it('retracts the winning line on rewind', () => {
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
        transition={{
          token: 1,
          kind: 'previous'
        }}
        boardSize={20}
      />
    );

    expect(screen.getByTestId('win-line')).toHaveClass('exiting');
  });
});
