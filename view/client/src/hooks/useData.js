import { useState, useEffect, useReducer, useCallback } from 'react';
import { matchupKey, compareHeroOrder, getEventRunId, getRunId, playerPairKey, samePlayerPair } from '../utils';

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
      const pairKey = playerPairKey(e.game.black_id, e.game.white_id);
      const eventKey = `${tid}-${pairKey}`;
      const idx = state.findIndex((m) => matchupKey(m) === eventKey);
      if (idx !== -1) {
        const updated = {
          ...state[idx],
          runId: tid,
          lastActivity: e.game.timestamp,
          live_count: (state[idx].live_count || 0) + (e.game.winner_color === 0 ? 1 : 0)
        };
        return [updated, ...state.filter((_, i) => i !== idx)];
      }
      const p1 = { id: e.game.black_id, name: e.game.black_name, version: e.game.black_ver };
      const p2 = { id: e.game.white_id, name: e.game.white_name, version: e.game.white_ver };
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
        if (typeof run.wins === 'number' && run.p1_name) {
          const p1 = {
            id: m.hero.name === run.p1_name && m.hero.version === run.p1_version ? m.hero.id : m.villain.id,
            name: run.p1_name,
            version: run.p1_version,
            cmd: run.p1_cmd,
            mtime: run.p1_mtime
          };
          const p2 = {
            id: m.hero.name === run.p2_name && m.hero.version === run.p2_version ? m.hero.id : m.villain.id,
            name: run.p2_name,
            version: run.p2_version,
            cmd: run.p2_cmd,
            mtime: run.p2_mtime
          };
          const p1IsHero = compareHeroOrder(p1, p2) >= 0;
          hero = p1IsHero ? p1 : p2;
          villain = p1IsHero ? p2 : p1;
          heroWins = p1IsHero ? run.wins : run.losses;
          villainWins = p1IsHero ? run.losses : run.wins;
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
          samePlayerPair(m.hero.id, m.villain.id, e.black_id, e.white_id);
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
