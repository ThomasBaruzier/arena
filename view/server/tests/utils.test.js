import { describe, it, expect } from 'vitest';
import { compareHeroOrder } from '../src/utils.js';

describe('compareHeroOrder', () => {
  it('uses semantic version for matching bot names', () => {
    expect(compareHeroOrder({ version: '2.0', name: 'agent' }, { version: '1.0', name: 'agent' })).toBeGreaterThan(0);
    expect(compareHeroOrder({ version: '1.10', name: 'agent' }, { version: '1.2', name: 'agent' })).toBeGreaterThan(0);
    expect(compareHeroOrder({ version: '1.2-3', name: 'agent' }, { version: '1.2-2', name: 'agent' })).toBeGreaterThan(0);
    expect(compareHeroOrder({ version: '1.0', name: 'agent' }, { version: '1.0', name: 'agent' })).toBe(0);
  });

  it('uses executable mtime for different bot names when available', () => {
    expect(compareHeroOrder({ version: '0.3', name: 'agent', mtime: 100 }, { version: '6.2', name: 'shrek', mtime: 200 })).toBeLessThan(0);
    expect(compareHeroOrder({ version: '6.2', name: 'shrek', mtime: 200 }, { version: '0.3', name: 'agent', mtime: 100 })).toBeGreaterThan(0);
  });

  it('falls back alphabetically for different names without useful mtimes', () => {
    expect(compareHeroOrder({ version: '0.3', name: 'agent' }, { version: '6.2', name: 'shrek' })).toBeGreaterThan(0);
    expect(compareHeroOrder({ version: '6.2', name: 'shrek' }, { version: '0.3', name: 'agent' })).toBeLessThan(0);
  });
});
