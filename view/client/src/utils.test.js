import { describe, it, expect } from 'vitest';
import { compareVersions, parseMoves, getWinningLine } from './utils';

describe('compareVersions', () => {
  it('compares versions correctly', () => {
    expect(
      compareVersions({ version: '2.0', name: 'a' }, { version: '1.0', name: 'b' })
    ).toBeGreaterThan(0);
    expect(
      compareVersions({ version: '1.0', name: 'a' }, { version: '2.0', name: 'b' })
    ).toBeLessThan(0);
    expect(
      compareVersions({ version: '1.0', name: 'a' }, { version: '1.0', name: 'b' })
    ).toBeLessThan(0);
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
