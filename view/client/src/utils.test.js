import { describe, it, expect } from 'vitest';
import { compareHeroOrder, parseMoves, getWinningLine } from './utils';

describe('compareHeroOrder', () => {
  it('uses semantic version for matching bot names', () => {
    expect(
      compareHeroOrder({ version: '2.0', name: 'agent' }, { version: '1.0', name: 'agent' })
    ).toBeGreaterThan(0);
    expect(
      compareHeroOrder({ version: '1.10', name: 'agent' }, { version: '1.2', name: 'agent' })
    ).toBeGreaterThan(0);
  });

  it('uses executable mtime for different bot names when available', () => {
    expect(
      compareHeroOrder({ version: '0.3', name: 'agent', mtime: 100 }, { version: '6.2', name: 'shrek', mtime: 200 })
    ).toBeLessThan(0);
    expect(
      compareHeroOrder({ version: '6.2', name: 'shrek', mtime: 200 }, { version: '0.3', name: 'agent', mtime: 100 })
    ).toBeGreaterThan(0);
  });

  it('falls back alphabetically for different names without useful mtimes', () => {
    expect(
      compareHeroOrder({ version: '0.3', name: 'agent' }, { version: '6.2', name: 'shrek' })
    ).toBeGreaterThan(0);
  });
});

describe('parseMoves', () => {
  it('parses moves string', () => {
    expect(parseMoves('5,5,1;6,6,2')).toEqual([
      { x: 5, y: 5, c: 1 },
      { x: 6, y: 6, c: 2 }
    ]);
    expect(parseMoves('')).toEqual([]);
  });
});

describe('getWinningLine', () => {
  it('detects horizontal win', () => {
    const moves = [
      { x: 0, y: 0, c: 1 },
      { x: 1, y: 0, c: 1 },
      { x: 2, y: 0, c: 1 },
      { x: 3, y: 0, c: 1 },
      { x: 4, y: 0, c: 1 }
    ];
    expect(getWinningLine(moves, 1)).toHaveLength(5);
  });
  it('returns empty if no win', () => {
    const moves = [
      { x: 0, y: 0, c: 1 },
      { x: 1, y: 0, c: 1 }
    ];
    expect(getWinningLine(moves, 1)).toHaveLength(0);
  });
});
