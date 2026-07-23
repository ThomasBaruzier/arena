import { useState, useEffect, useReducer, useCallback } from 'react';
import { matchupKey, compareHeroOrder, getEventRunId, getRunId, sameSlotPair } from '../utils';

const API_BASE = '/api';
const REDUCER_EVENTS = new Set(['game_start', 'run_update', 'game_result']);
const sameId = (a, b) => String(a) === String(b);

export const matchupsReducer = (state, action) => {
  switch (action.type) {
    case 'SET':
      return action.data;
    case 'APPEND':
      return [...new Map([...state, ...action.data].map((m) => [matchupKey(m), m])).values()];
    case 'RESET':
      return [];
    case 'game_start': {
      const e = action.event;
      if (!e.game) return state;
      const tid = getEventRunId(e);
      if (!tid) return state;
      const idx = state.findIndex((m) => sameId(getRunId(m), tid));
      if (idx !== -1) {
        const updated = {
          ...state[idx],
          runId: tid,
          lastActivity: e.game.timestamp,
          live_count: (state[idx].live_count || 0) + (e.game.winner_color === 0 ? 1 : 0)
        };
        return [updated, ...state.filter((_, i) => i !== idx)];
      }
      const p1 = { id: `${tid}:1`, slot: 1, name: e.game.black_slot === 1 ? e.game.black_name : e.game.white_name, version: e.game.black_slot === 1 ? e.game.black_ver : e.game.white_ver };
      const p2 = { id: `${tid}:2`, slot: 2, name: e.game.black_slot === 2 ? e.game.black_name : e.game.white_name, version: e.game.black_slot === 2 ? e.game.black_ver : e.game.white_ver };
      const isP1Hero = compareHeroOrder(p1, p2) >= 0;
      return [
        {
          runId: tid,
          hero: isP1Hero ? p1 : p2,
          villain: isP1Hero ? p2 : p1,
          heroWins: 0,
          villainWins: 0,
          draws: 0,
          total: 0,
          live_count: e.game.winner_color === 0 ? 1 : 0,
          lastActivity: e.game.timestamp
        },
        ...state
      ];
    }
    case 'run_update': {
      const run = action.event.run || action.event;
      const tid = getEventRunId(action.event);
      return state.map((m) => {
        if (!sameId(getRunId(m), tid)) return m;

        let hero = m.hero;
        let villain = m.villain;
        let heroWins = m.heroWins;
        let villainWins = m.villainWins;
        if (typeof run.wins === 'number' && run.slot1_name) {
          const slot1 = {
            id: `${tid}:1`,
            slot: 1,
            name: run.slot1_name,
            version: run.slot1_version,
            cmd: run.slot1_cmd,
            mtime: run.slot1_mtime
          };
          const slot2 = {
            id: `${tid}:2`,
            slot: 2,
            name: run.slot2_name,
            version: run.slot2_version,
            cmd: run.slot2_cmd,
            mtime: run.slot2_mtime
          };
          const slot1IsHero = compareHeroOrder(slot1, slot2) >= 0;
          hero = slot1IsHero ? slot1 : slot2;
          villain = slot1IsHero ? slot2 : slot1;
          heroWins = slot1IsHero ? run.wins : run.losses;
          villainWins = slot1IsHero ? run.losses : run.wins;
        } else if (typeof run.wins === 'number') {
          heroWins = run.wins;
          villainWins = run.losses;
        }

        return {
          ...m,
          hero,
          villain,
          heroWins,
          villainWins,
          draws: run.draws ?? m.draws,
          total: run.games_played ?? m.total
        };
      });
    }
    case 'game_result': {
      const e = action.event;
      const tid = getEventRunId(e);
      return state.map((m) => {
        const isMatch =
          sameId(getRunId(m), tid) &&
          sameSlotPair(m.hero.slot, m.villain.slot, e.black_slot, e.white_slot);
        if (!isMatch) return m;
        return {
          ...m,
          lastActivity: new Date().toISOString(),
          live_count: e.winner_color === 0 ? m.live_count || 0 : Math.max(0, (m.live_count || 0) - 1)
        };
      });
    }
    default:
      return state;
  }
};

export function useMatchups(subscribe) {
  const [matchups, dispatch] = useReducer(matchupsReducer, []);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(`${API_BASE}/matchups?limit=20&offset=${page * 20}`, {
      signal: controller.signal
    })
      .then((r) => r.json())
      .then((data) => {
        if (page === 0) dispatch({ type: 'SET', data });
        else dispatch({ type: 'APPEND', data });
        setHasMore(data.length === 20);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setLoading(false);
      });

    return () => controller.abort();
  }, [page, resetToken]);

  const loadMore = useCallback((reset = false) => {
    if (reset) {
      setPage(0);
      setResetToken((t) => t + 1);
    } else {
      setPage((p) => p + 1);
    }
  }, []);

  useEffect(() => {
    return subscribe((e) => {
      if (e.type === 'reset') {
        dispatch({ type: 'RESET' });
        loadMore(true);
      } else if (e.type === 'run_start') loadMore(true);
      else if (REDUCER_EVENTS.has(e.type)) dispatch({ type: e.type, event: e });
    });
  }, [subscribe, loadMore]);

  return { matchups, loading, hasMore, loadMore };
}

export function useRuns(subscribe) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(() => {
    fetch(`${API_BASE}/runs`)
      .then((r) => r.json())
      .then(setRuns)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);
  useEffect(() => {
    return subscribe((e) => {
      if (e.type === 'reset') fetchRuns();
      else if (e.type === 'run_start')
        setRuns((p) => [e.run, ...p.filter((r) => !sameId(r.id, e.run.id))]);
      else if (e.type === 'run_update')
        setRuns((p) => p.map((r) => (sameId(r.id, e.run.id) ? { ...r, ...e.run } : r)));
    });
  }, [subscribe, fetchRuns]);

  return { runs, loading };
}
