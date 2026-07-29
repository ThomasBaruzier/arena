import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Board from './Board';

const renderBoard = (props = {}) =>
  render(<Board gameId={1} parsedMoves={[]} moveIndex={0} winnerColor={0} {...props} />);

describe('Board Component', () => {
  it('renders correct number of stones', () => {
    const moves = [
      {
        x: 10,
        y: 10,
        c: 1
      },
      {
        x: 11,
        y: 11,
        c: 2
      }
    ];

    renderBoard({
      parsedMoves: moves,
      moveIndex: 2
    });

    expect(screen.getAllByTestId(/^stone-/)).toHaveLength(2);
  });

  it('renders winning line at the final position', () => {
    const moves = [
      {
        x: 0,
        y: 0,
        c: 1
      },
      {
        x: 1,
        y: 0,
        c: 1
      },
      {
        x: 2,
        y: 0,
        c: 1
      },
      {
        x: 3,
        y: 0,
        c: 1
      },
      {
        x: 4,
        y: 0,
        c: 1
      }
    ];

    renderBoard({
      parsedMoves: moves,
      moveIndex: 5,
      winnerColor: 1
    });

    expect(screen.getByTestId('win-line')).toHaveAttribute('pathLength', '1');
  });

  it('hides the winning line before the final position', () => {
    const moves = [
      {
        x: 0,
        y: 0,
        c: 1
      },
      {
        x: 1,
        y: 0,
        c: 1
      },
      {
        x: 2,
        y: 0,
        c: 1
      },
      {
        x: 3,
        y: 0,
        c: 1
      },
      {
        x: 4,
        y: 0,
        c: 1
      }
    ];

    renderBoard({
      parsedMoves: moves,
      moveIndex: 4,
      winnerColor: 1
    });

    expect(screen.queryByTestId('win-line')).not.toBeInTheDocument();
  });

  it('uses provided board size', () => {
    const moves = [
      {
        x: 7,
        y: 7,
        c: 1
      }
    ];

    renderBoard({
      parsedMoves: moves,
      moveIndex: 1,
      boardSize: 15
    });

    expect(screen.getByTestId('board-grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(15, 1fr)',
      gridTemplateRows: 'repeat(15, 1fr)'
    });

    expect(screen.getByTestId('stone-7-7')).toHaveStyle({
      left: '46.666666666666664%',
      top: '46.666666666666664%',
      width: '6.666666666666667%',
      height: '6.666666666666667%'
    });
  });

  it('does not spawn bulk-loaded stones', () => {
    const moves = [
      {
        x: 1,
        y: 1,
        c: 1
      },
      {
        x: 2,
        y: 2,
        c: 2
      }
    ];

    renderBoard({
      parsedMoves: moves,
      moveIndex: 2
    });

    expect(screen.getByTestId('stone-1-1')).not.toHaveClass('spawn');

    expect(screen.getByTestId('stone-2-2')).not.toHaveClass('spawn');
  });

  it('spawns a one-step addition in the same game', () => {
    const first = [
      {
        x: 1,
        y: 1,
        c: 1
      }
    ];

    const second = [
      ...first,
      {
        x: 2,
        y: 2,
        c: 2
      }
    ];

    const { rerender } = renderBoard({
      parsedMoves: first,
      moveIndex: 1
    });

    act(() => {
      rerender(<Board gameId={1} parsedMoves={second} moveIndex={2} winnerColor={0} />);
    });

    expect(screen.getByTestId('stone-2-2')).toHaveClass('spawn');
  });

  it('does not spawn stones when switching games', () => {
    const first = [
      {
        x: 1,
        y: 1,
        c: 1
      }
    ];

    const second = [
      {
        x: 5,
        y: 5,
        c: 1
      },
      {
        x: 6,
        y: 6,
        c: 2
      }
    ];

    const { rerender } = renderBoard({
      gameId: 1,
      parsedMoves: first,
      moveIndex: 1
    });

    act(() => {
      rerender(<Board gameId={2} parsedMoves={second} moveIndex={2} winnerColor={0} />);
    });

    expect(screen.getByTestId('stone-6-6')).not.toHaveClass('spawn');
  });

  it('keeps the inverse last-move marker during autoplay', () => {
    renderBoard({
      parsedMoves: [
        {
          x: 10,
          y: 10,
          c: 1
        },
        {
          x: 11,
          y: 10,
          c: 2
        }
      ],
      moveIndex: 2,
      isPlaying: true
    });

    expect(screen.getByTestId('stone-11-10')).toHaveClass('white', 'last');
  });

  it('renders full overlines', () => {
    const moves = [
      {
        x: 0,
        y: 5,
        c: 1
      },
      {
        x: 1,
        y: 4,
        c: 1
      },
      {
        x: 2,
        y: 3,
        c: 1
      },
      {
        x: 3,
        y: 2,
        c: 1
      },
      {
        x: 4,
        y: 1,
        c: 1
      },
      {
        x: 5,
        y: 0,
        c: 1
      }
    ];

    renderBoard({
      parsedMoves: moves,
      moveIndex: 6,
      winnerColor: 1
    });

    const line = screen.getByTestId('win-line');

    expect(line).toHaveAttribute('x1', '0.5');

    expect(line).toHaveAttribute('y1', '5.5');

    expect(line).toHaveAttribute('x2', '5.5');

    expect(line).toHaveAttribute('y2', '0.5');
  });
});
