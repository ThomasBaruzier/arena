import { describe, it, expect } from 'vitest';
import { compareVersions, parseMoves, getWinningLine } from './utils';

describe('compareVersions (Hero Priority)', () => {
  it('prioritizes alphabetical order for different names', () => {
    expect(
      compareVersions({ version: '1.0', name: 'A' }, { version: '1.0', name: 'B' })
    ).toBeGreaterThan(0);

    expect(
      compareVersions({ version: '1.0', name: 'B' }, { version: '1.0', name: 'A' })
    ).toBeLessThan(0);
  });

  it('prioritizes higher version for same name', () => {
    expect(
      compareVersions({ version: '2.0', name: 'Bot' }, { version: '1.0', name: 'Bot' })
    ).toBeGreaterThan(0);

    expect(
      compareVersions({ version: '1.0', name: 'Bot' }, { version: '2.0', name: 'Bot' })
    ).toBeLessThan(0);

    expect(compareVersions({ version: '1.0', name: 'Bot' }, { version: '1.0', name: 'Bot' })).toBe(
      0
    );
  });

  it('handles sub-versions correctly', () => {
    expect(
      compareVersions({ version: '1.10', name: 'Bot' }, { version: '1.2', name: 'Bot' })
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
