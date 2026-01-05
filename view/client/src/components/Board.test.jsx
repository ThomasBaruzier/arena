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
});
