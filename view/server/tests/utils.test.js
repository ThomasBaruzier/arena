import { describe, it, expect } from 'vitest';
import { groupIdFromExternalId } from '../src/utils.js';

describe('groupIdFromExternalId', () => {
  it('removes only the leg suffix from canonical external ids', () => {
    expect(groupIdFromExternalId('run_1_0')).toBe('run_1');
    expect(groupIdFromExternalId('run_full_id_12_1')).toBe('run_full_id_12');
  });

  it('leaves noncanonical ids unchanged', () => {
    expect(groupIdFromExternalId('run')).toBe('run');
    expect(groupIdFromExternalId('run_1')).toBe('run_1');
    expect(groupIdFromExternalId('')).toBe('');
    expect(groupIdFromExternalId(null)).toBe('');
  });
});
