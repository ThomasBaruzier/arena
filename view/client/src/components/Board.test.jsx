import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Board from './Board';

describe('Board Component', () => {
  it('renders correct number of stones', () => {
    const moves = [
      { x: 10, y: 10, c: 1 },
      { x: 11, y: 11, c: 2 }
    ];
    render(<Board parsedMoves={moves} moveIndex={2} winnerColor={0} isPlaying={false} />);
    expect(screen.getAllByTestId(/^stone-/)).toHaveLength(2);
  });

  it('renders winning line when game is won', () => {
    const moves = [
      { x: 0, y: 0, c: 1 },
      { x: 1, y: 0, c: 1 },
      { x: 2, y: 0, c: 1 },
      { x: 3, y: 0, c: 1 },
      { x: 4, y: 0, c: 1 }
    ];
    render(<Board parsedMoves={moves} moveIndex={5} winnerColor={1} isPlaying={false} />);
    expect(screen.getByTestId('win-line')).toBeInTheDocument();
  });

  it('uses provided board size for grid and stone positions', () => {
    const moves = [{ x: 7, y: 7, c: 1 }];
    render(<Board parsedMoves={moves} moveIndex={1} winnerColor={0} isPlaying={false} boardSize={15} />);
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

  it('renders a win line for overlines', () => {
    const moves = [
      { x: 0, y: 0, c: 1 },
      { x: 1, y: 0, c: 1 },
      { x: 2, y: 0, c: 1 },
      { x: 3, y: 0, c: 1 },
      { x: 4, y: 0, c: 1 },
      { x: 5, y: 0, c: 1 }
    ];
    render(<Board parsedMoves={moves} moveIndex={6} winnerColor={1} isPlaying={false} />);
    expect(screen.getByTestId('win-line')).toHaveAttribute('x2', '5.5');
  });

  it('renders the full anti-diagonal overline', () => {
    const moves = [
      { x: 0, y: 5, c: 1 },
      { x: 1, y: 4, c: 1 },
      { x: 2, y: 3, c: 1 },
      { x: 3, y: 2, c: 1 },
      { x: 4, y: 1, c: 1 },
      { x: 5, y: 0, c: 1 }
    ];
    render(<Board parsedMoves={moves} moveIndex={6} winnerColor={1} isPlaying={false} />);
    expect(screen.getByTestId('win-line')).toHaveAttribute('x1', '0.5');
    expect(screen.getByTestId('win-line')).toHaveAttribute('y1', '5.5');
    expect(screen.getByTestId('win-line')).toHaveAttribute('x2', '5.5');
    expect(screen.getByTestId('win-line')).toHaveAttribute('y2', '0.5');
  });
});
