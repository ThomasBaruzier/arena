import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_SORT,
  historyCursor,
  mergePair,
  nextHistorySort,
  normalizePair,
  normalizePairs,
  sortedHistoryPairs,
  tournamentHistoryReducer
} from './tournamentHistory';

const game = (id, groupId, blackSlot = 1, overrides = {}) => ({
  id,
  external_id: `${groupId}_${blackSlot === 1 ? 0 : 1}`,
  group_id: groupId,
  run_id: 'run',
  timestamp: '2026-01-01T00:00:00Z',
  winner_color: 0,
  move_count: 0,
  black_slot: blackSlot,
  white_slot: blackSlot === 1 ? 2 : 1,
  board_size: 20,
  opening_len: 0,
  duration: 0,
  ...overrides
});

const pair = (
  id,
  {
    moves = id,
    duration = id * 100,
    winner = 0,
    blackSlot = id % 2 ? 1 : 2,
    secondGame = null
  } = {}
) => {
  const groupId = `run_${id}`;

  const games = [
    game(id, groupId, blackSlot, {
      move_count: moves,
      duration,
      winner_color: winner
    })
  ];

  if (secondGame) {
    games.push(
      game(secondGame.id, groupId, secondGame.blackSlot, {
        move_count: secondGame.moves,
        duration: secondGame.duration,
        winner_color: secondGame.winner
      })
    );
  }

  return {
    group_id: groupId,
    pair_size: games.length,
    latest_ts: '2026-01-01T00:00:00Z',
    max_id: Math.max(...games.map((current) => current.id)),
    min_moves: Math.min(...games.map((current) => current.move_count)),
    max_moves: Math.max(...games.map((current) => current.move_count)),
    live_count: games.filter((current) => current.winner_color === 0).length,
    duration: Math.max(...games.map((current) => current.duration)),
    slot1_wins: 0,
    games
  };
};

describe('tournament history model', () => {
  it('projects the lean pair contract', () => {
    const normalized = normalizePair(pair(1));

    expect(normalized.games[0]).not.toHaveProperty('moves');
  });

  it('normalizes legs into canonical side order', () => {
    const normalized = normalizePair(
      pair(3, {
        blackSlot: 2,
        secondGame: {
          id: 4,
          blackSlot: 1,
          moves: 2,
          duration: 200,
          winner: 0
        }
      })
    );

    expect(normalized.games.map((current) => current.black_slot)).toEqual([1, 2]);
  });

  it('merges snapshots monotonically and preserves identity', () => {
    const newer = normalizePair(
      pair(1, {
        moves: 12,
        duration: 900,
        winner: 1
      })
    );

    const stale = normalizePair(
      pair(1, {
        moves: 4,
        duration: 200,
        winner: 2
      })
    );

    stale.games[0].external_id = 'conflicting';

    const merged = mergePair(newer, stale);

    expect(merged.games[0]).toMatchObject({
      external_id: 'run_1_0',
      winner_color: 1,
      move_count: 12,
      duration: 900
    });
  });

  it('rejects malformed shapes', () => {
    expect(() =>
      normalizePair({
        ...pair(1),
        pair_size: 2
      })
    ).toThrow('Invalid tournament pair membership');

    expect(() => normalizePairs({})).toThrow('Invalid tournament history');
  });

  it('builds strict sort transitions', () => {
    expect(nextHistorySort(DEFAULT_HISTORY_SORT, 'id')).toEqual({
      col: 'id',
      asc: true
    });

    expect(() => nextHistorySort(DEFAULT_HISTORY_SORT, 'side')).toThrow('Invalid history sort');
  });

  it('sorts with server-compatible tie breakers', () => {
    const values = new Map(
      [
        normalizePair(
          pair(8, {
            moves: 3
          })
        ),
        normalizePair(
          pair(9, {
            moves: 3
          })
        ),
        normalizePair(
          pair(7, {
            moves: 2
          })
        )
      ].map((current) => [current.group_id, current])
    );

    expect(
      sortedHistoryPairs(values, {
        col: 'moves',
        asc: true
      }).map((current) => current.max_id)
    ).toEqual([7, 9, 8]);
  });

  it('creates result cursor boundaries from actual games', () => {
    const value = normalizePair(
      pair(20, {
        moves: 4,
        duration: 900,
        winner: 1,
        blackSlot: 1,
        secondGame: {
          id: 21,
          blackSlot: 2,
          moves: 5,
          duration: 1000,
          winner: 0
        }
      })
    );

    expect(
      JSON.parse(
        historyCursor(value, {
          col: 'result',
          asc: false
        })
      )
    ).toEqual({
      id: 21,
      value: 1,
      secondary: 1
    });
  });

  it('replays stale buffered snapshots without regression', () => {
    const current = normalizePair(
      pair(1, {
        moves: 10,
        duration: 800,
        winner: 1
      })
    );

    const stale = normalizePair(
      pair(1, {
        moves: 3,
        duration: 100,
        winner: 0
      })
    );

    const state = tournamentHistoryReducer(new Map(), {
      type: 'SET',
      pairs: [current],
      buffered: [stale]
    });

    expect(state.get('run_1').games[0]).toMatchObject({
      winner_color: 1,
      move_count: 10,
      duration: 800
    });
  });

  it('retains fetched pairs when a streamed pair enters the visible range', () => {
    let state = tournamentHistoryReducer(new Map(), {
      type: 'SET',
      pairs: Array.from(
        {
          length: 50
        },
        (_, index) => normalizePair(pair(100 - index))
      ),
      buffered: []
    });

    state = tournamentHistoryReducer(state, {
      type: 'UPSERT',
      pair: normalizePair(pair(1000))
    });

    const visible = sortedHistoryPairs(state, DEFAULT_HISTORY_SORT).slice(0, 50);

    expect(state).toHaveLength(51);
    expect(state.has('run_1000')).toBe(true);
    expect(state.has('run_51')).toBe(true);
    expect(visible[0].max_id).toBe(1000);
    expect(visible.some((current) => current.max_id === 51)).toBe(false);
  });
});
