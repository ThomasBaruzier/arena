import { describe, it, expect } from 'vitest';
import { pairsReducer } from './MatchGroup';

describe('pairsReducer', () => {
  it('normalizes completed game_start payloads for new pairs', () => {
    const next = pairsReducer([], {
      type: 'game_start',
      game: {
        id: 1,
        group_id: 'run_1',
        winner_color: 1,
        black_slot: 1,
        white_slot: 2,
        moves: '10,10,1;11,11,2',
        timestamp: '2026-01-01T00:00:00Z'
      },
      sort: { col: 'id', asc: false },
      heroSlot: 1
    });

    expect(next).toHaveLength(1);
    expect(next[0].live_count).toBe(0);
    expect(next[0].max_moves).toBe(2);
    expect(next[0].min_moves).toBe(2);
    expect(next[0].hero_wins).toBe(1);
    expect(next[0].games[0].move_count).toBe(2);
  });
});
