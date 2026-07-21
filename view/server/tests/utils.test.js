import { describe, it, expect } from 'vitest';
import { compareVersions } from '../src/utils.js';

describe('compareVersions', () => {
  it('matches client hero ordering cases', () => {
    expect(compareVersions({ version: '0.3', name: 'agent' }, { version: '6.2', name: 'shrek' })).toBeGreaterThan(0);
    expect(compareVersions({ version: '6.2', name: 'shrek' }, { version: '0.3', name: 'agent' })).toBeLessThan(0);
    expect(compareVersions({ version: '2.0', name: 'agent' }, { version: '1.0', name: 'agent' })).toBeGreaterThan(0);
    expect(compareVersions({ version: '1.10', name: 'agent' }, { version: '1.2', name: 'agent' })).toBeGreaterThan(0);
    expect(compareVersions({ version: '1.2-3', name: 'agent' }, { version: '1.2-2', name: 'agent' })).toBeGreaterThan(0);
    expect(compareVersions({ version: '1.0', name: 'agent' }, { version: '1.0', name: 'agent' })).toBe(0);
  });
});
