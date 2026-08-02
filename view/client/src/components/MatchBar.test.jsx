import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MatchBar from './MatchBar';

const game = {
  black_slot: 2,
  white_slot: 1,
  black_name: 'Beta',
  black_ver: '2026.11',
  white_name: 'Alpha',
  white_ver: '1.0',
  winner_color: 2
};

describe('MatchBar', () => {
  it('keeps canonical slot order with mirrored identities', () => {
    render(<MatchBar game={game} />);

    const text = screen.getByText('1 – 0').closest('.match-bar').textContent;

    expect(text.indexOf('1.0')).toBeLessThan(text.indexOf('Alpha'));
    expect(text.indexOf('Alpha')).toBeLessThan(text.indexOf('1 – 0'));
    expect(text.indexOf('1 – 0')).toBeLessThan(text.indexOf('Beta'));
    expect(text.indexOf('Beta')).toBeLessThan(text.indexOf('2026.11'));
  });

  it('maps selected-game colors', () => {
    render(<MatchBar game={game} />);

    const left = screen.getByText('Alpha').closest('.player-side');
    const right = screen.getByText('Beta').closest('.player-side');

    expect(within(left).getByLabelText('white stone')).toBeInTheDocument();
    expect(within(right).getByLabelText('black stone')).toBeInTheDocument();
  });

  it('highlights only the winning name', () => {
    render(<MatchBar game={game} />);

    expect(screen.getByText('Alpha')).toHaveClass('gold');
    expect(screen.getByText('Beta')).not.toHaveClass('gold');
    expect(screen.getByText('1.0')).not.toHaveClass('gold');
  });

  it('renders live, draw, and void centrally', () => {
    const { rerender } = render(<MatchBar game={{ ...game, winner_color: 0 }} />);

    expect(screen.getByText('LIVE').closest('.score-center')).toBeInTheDocument();

    rerender(<MatchBar game={{ ...game, winner_color: 3 }} />);
    expect(screen.getByText('½ – ½')).toBeInTheDocument();

    rerender(<MatchBar game={{ ...game, winner_color: 4 }} />);
    expect(screen.getByText('VOID')).toHaveClass('void');
  });
});
