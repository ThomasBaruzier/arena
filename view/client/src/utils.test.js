import { describe, expect, it } from 'vitest';
import {
  getEventRunId,
  getRunId,
  getWinningLine,
  matchupKey,
  parseMoves,
  sameSlotPair,
  slotPairKey
} from './utils';

describe('parseMoves', () => {
  it('parses move strings', () => {
    expect(parseMoves('5,5,1;6,6,2')).toEqual([
      { x: 5, y: 5, c: 1 },
      { x: 6, y: 6, c: 2 }
    ]);
    expect(parseMoves('')).toEqual([]);
  });
});

describe('getWinningLine', () => {
  it('detects horizontal wins', () => {
    const moves = [
      { x: 0, y: 0, c: 1 },
      { x: 1, y: 0, c: 1 },
      { x: 2, y: 0, c: 1 },
      { x: 3, y: 0, c: 1 },
      { x: 4, y: 0, c: 1 }
    ];

    expect(getWinningLine(moves, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 }
    ]);
  });

  it('returns full overlines', () => {
    const moves = [
      { x: 0, y: 5, c: 2 },
      { x: 1, y: 4, c: 2 },
      { x: 2, y: 3, c: 2 },
      { x: 3, y: 2, c: 2 },
      { x: 4, y: 1, c: 2 },
      { x: 5, y: 0, c: 2 }
    ];

    expect(getWinningLine(moves, 2)).toHaveLength(6);
  });

  it('returns no line for nonterminal and nonplayer results', () => {
    expect(
      getWinningLine(
        [
          { x: 0, y: 0, c: 1 },
          { x: 1, y: 0, c: 1 }
        ],
        1
      )
    ).toEqual([]);

    expect(getWinningLine([{ x: 0, y: 0, c: 1 }], 3)).toEqual([]);
    expect(getWinningLine([{ x: 0, y: 0, c: 1 }], 4)).toEqual([]);
  });

  it('honors board size', () => {
    const moves = [
      { x: 10, y: 10, c: 1 },
      { x: 11, y: 10, c: 1 },
      { x: 12, y: 10, c: 1 },
      { x: 13, y: 10, c: 1 },
      { x: 14, y: 10, c: 1 }
    ];

    expect(getWinningLine(moves, 1, 15)).toHaveLength(5);
    expect(getWinningLine(moves, 1, 10)).toEqual([]);
  });
});

describe('slot helpers', () => {
  it('normalizes slot pairs without changing identity', () => {
    expect(slotPairKey(1, 2)).toBe('1-2');
    expect(slotPairKey(2, 1)).toBe('1-2');
    expect(sameSlotPair(1, 2, 2, 1)).toBe(true);
    expect(sameSlotPair(1, 1, 1, 2)).toBe(false);
  });

  it('extracts canonical run ids', () => {
    expect(getRunId({ runId: 'a' })).toBe('a');
    expect(getRunId({ run_id: 'b' })).toBe('b');
    expect(getEventRunId({ game: { run_id: 'c' } })).toBe('c');
    expect(getEventRunId({ run: { id: 'd' } })).toBe('d');
    expect(matchupKey({ runId: 'e' })).toBe('e');
  });
});
