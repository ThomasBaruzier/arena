import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MatchBar from './MatchBar';

const game = {
  black_slot: 2,
  white_slot: 1,
  black_name: 'Beta',
  black_ver: '2.0',
  white_name: 'Alpha',
  white_ver: '1.0',
  winner_color: 2
};

describe('MatchBar', () => {
  it('keeps canonical slot order when colors reverse', () => {
    render(<MatchBar game={game} />);

    const bar = screen.getByText('1 – 0').closest('.match-bar');
    const text = bar.textContent;

    expect(text.indexOf('1.0')).toBeLessThan(text.indexOf('Alpha'));
    expect(text.indexOf('Alpha')).toBeLessThan(text.indexOf('1 – 0'));
    expect(text.indexOf('1 – 0')).toBeLessThan(text.indexOf('Beta'));
    expect(text.indexOf('Beta')).toBeLessThan(text.indexOf('2.0'));
  });

  it('highlights only the winning slot name', () => {
    render(<MatchBar game={game} />);

    expect(screen.getByText('Alpha')).toHaveClass('gold');
    expect(screen.getByText('Beta')).not.toHaveClass('gold');
  });

  it('renders live state centrally', () => {
    render(
      <MatchBar
        game={{
          ...game,
          winner_color: 0
        }}
      />
    );

    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('renders draws and void results', () => {
    const { rerender } = render(
      <MatchBar
        game={{
          ...game,
          winner_color: 3
        }}
      />
    );

    expect(screen.getByText('½ – ½')).toBeInTheDocument();

    rerender(
      <MatchBar
        game={{
          ...game,
          winner_color: 4
        }}
      />
    );

    expect(screen.getByText('VOID')).toHaveClass('void');
  });
});
