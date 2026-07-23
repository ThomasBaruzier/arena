import { describe, it, expect } from 'vitest';
import { matchupsReducer } from './useData';

const baseMatchup = {
  runId: 'run_full',
  hero: { id: 'run_full:1', slot: 1, name: 'agent', version: '0.3' },
  villain: { id: 'run_full:2', slot: 2, name: 'shrek', version: '6.2' },
  heroWins: 0,
  villainWins: 0,
  draws: 0,
  total: 0,
  live_count: 0,
  lastActivity: '2026-01-01T00:00:00Z'
};

describe('matchupsReducer', () => {
  it('uses run_id to attach live game starts to fetched run-backed matchups', () => {
    const state = [baseMatchup];
    const next = matchupsReducer(state, {
      type: 'game_start',
      event: {
        game: {
          id: 10,
          run_id: 'run_full',
          black_slot: 1,
          white_slot: 2,
          black_name: 'agent',
          black_ver: '0.3',
          white_name: 'shrek',
          white_ver: '6.2',
          timestamp: '2026-01-01T00:00:01Z',
          winner_color: 0
        }
      }
    });

    expect(next).toHaveLength(1);
    expect(next[0].live_count).toBe(1);
    expect(next[0].runId).toBe('run_full');
  });

  it('does not change authoritative W/L/D totals on game_result before run_update', () => {
    const state = [{ ...baseMatchup, live_count: 1, heroWins: 2, villainWins: 1, draws: 3, total: 6 }];
    const next = matchupsReducer(state, {
      type: 'game_result',
      event: {
        id: 10,
        run_id: 'run_full',
        black_slot: 1,
        white_slot: 2,
        winner_color: 3
      }
    });

    expect(next).toHaveLength(1);
    expect(next[0].heroWins).toBe(2);
    expect(next[0].villainWins).toBe(1);
    expect(next[0].draws).toBe(3);
    expect(next[0].total).toBe(6);
    expect(next[0].live_count).toBe(0);
  });

  it('replaces totals from authoritative run_update', () => {
    const state = [{ ...baseMatchup, live_count: 1 }];
    const next = matchupsReducer(state, {
      type: 'run_update',
      event: {
        run: {
          id: 'run_full',
          slot1_name: 'agent',
          slot1_version: '0.3',
          slot2_name: 'shrek',
          slot2_version: '6.2',
          wins: 4,
          losses: 2,
          draws: 5,
          games_played: 11
        }
      }
    });

    expect(next[0].heroWins).toBe(4);
    expect(next[0].villainWins).toBe(2);
    expect(next[0].draws).toBe(5);
    expect(next[0].total).toBe(11);
  });

  it('realigns hero identity and totals when run_update has mtime ordering', () => {
    const state = [baseMatchup];
    const next = matchupsReducer(state, {
      type: 'run_update',
      event: {
        run: {
          id: 'run_full',
          slot1_name: 'agent',
          slot1_version: '0.3',
          slot1_mtime: 100,
          slot2_name: 'shrek',
          slot2_version: '6.2',
          slot2_mtime: 200,
          wins: 4,
          losses: 2,
          draws: 5,
          games_played: 11
        }
      }
    });

    expect(next[0].hero.name).toBe('shrek');
    expect(next[0].hero.slot).toBe(2);
    expect(next[0].villain.name).toBe('agent');
    expect(next[0].villain.slot).toBe(1);
    expect(next[0].heroWins).toBe(2);
    expect(next[0].villainWins).toBe(4);
  });

  it('keeps same name/version slots distinct', () => {
    const state = [{
      ...baseMatchup,
      hero: { id: 'mirror:1', slot: 1, name: 'agent', version: '0.3' },
      villain: { id: 'mirror:2', slot: 2, name: 'agent', version: '0.3' },
      runId: 'mirror',
      live_count: 1
    }];
    const next = matchupsReducer(state, {
      type: 'game_result',
      event: {
        id: 10,
        run_id: 'mirror',
        black_slot: 2,
        white_slot: 1,
        winner_color: 1
      }
    });

    expect(next[0].live_count).toBe(0);
  });
});
