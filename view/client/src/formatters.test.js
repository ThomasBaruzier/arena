import { describe, expect, it } from 'vitest';
import { formatDuration, formatGameId } from './formatters';

describe('formatDuration', () => {
  it.each([
    [0, '0ms'],
    [842, '842ms'],
    [1000, '1s'],
    [9450, '9.4s'],
    [12000, '12s'],
    [492000, '8m12s'],
    [3599000, '59m59s'],
    [3600000, '1h00'],
    [4020000, '1h07'],
    [99 * 3600000 + 59 * 60000, '99h59'],
    [100 * 3600000, '100h+'],
    [150 * 3600000, '100h+']
  ])('formats %i as %s', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });

  it.each([null, undefined, -1, 'invalid'])('rejects %s', (value) => {
    expect(formatDuration(value)).toBe('-');
  });
});

describe('formatGameId', () => {
  it.each([
    [1, '#1'],
    [1042, '#1042'],
    [999999, '#999999'],
    [1000000, '#999999+'],
    [999999999, '#999999+']
  ])('formats %i as %s', (value, expected) => {
    expect(formatGameId(value)).toBe(expected);
  });

  it.each([0, -1, 1.5, 'invalid'])('rejects %s', (value) => {
    expect(formatGameId(value)).toBe('#-');
  });
});
