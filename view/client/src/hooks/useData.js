import { useState, useEffect, useReducer, useCallback } from 'react';
import { matchupKey, compareVersions } from '../utils';

const API_BASE = '/api';

const matchupsReducer = (state, action) => {
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
      const tid = e.game.tournament_id || 'legacy';
      const key = `${tid}-${Math.min(e.game.black_id, e.game.white_id)}-${Math.max(e.game.black_id, e.game.white_id)}`;
      const idx = state.findIndex((m) => matchupKey(m) === key);
      if (idx !== -1) {
        const updated = {
          ...state[idx],
          lastActivity: e.game.timestamp,
          total: state[idx].total + 1
        };
        return [updated, ...state.filter((_, i) => i !== idx)];
      }
      const p1 = { id: e.game.black_id, name: e.game.black_name, version: e.game.black_ver };
      const p2 = { id: e.game.white_id, name: e.game.white_name, version: e.game.white_ver };
      const isP1Hero = compareVersions(p1, p2) >= 0;
      return [
        {
          tournamentId: tid,
          hero: isP1Hero ? p1 : p2,
          villain: isP1Hero ? p2 : p1,
          heroWins: 0,
          villainWins: 0,
          draws: 0,
          total: 1,
          lastActivity: e.game.timestamp
        },
        ...state
      ];
    }
    case 'game_result': {
      const e = action.event;
      const tid = e.tournament_id || 'legacy';
      return state.map((m) => {
        const isMatch =
          m.tournamentId === tid &&
          ((m.hero.id === e.black_id && m.villain.id === e.white_id) ||
            (m.hero.id === e.white_id && m.villain.id === e.black_id));
        if (!isMatch) return m;
        const u = { ...m };
        const isSelfPlay = e.black_id === e.white_id;
        if (e.winner_color === 3) u.draws++;
        else if (isSelfPlay) {
          const isLeg0 = e.external_id?.endsWith('_0');
          if (isLeg0) e.winner_color === 1 ? u.heroWins++ : u.villainWins++;
          else e.winner_color === 1 ? u.villainWins++ : u.heroWins++;
        } else {
          const isHeroBlack = m.hero.id === e.black_id;
          if (e.winner_color === 1) isHeroBlack ? u.heroWins++ : u.villainWins++;
          else if (e.winner_color === 2) isHeroBlack ? u.villainWins++ : u.heroWins++;
        }
        return u;
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
      } else if (e.type === 'game_start') dispatch({ type: 'game_start', event: e });
      else if (e.type === 'game_result') dispatch({ type: 'game_result', event: e });
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
      else if (e.type === 'run_start') setRuns((p) => [e.run, ...p]);
      else if (e.type === 'run_update')
        setRuns((p) => p.map((r) => (r.id === e.run.id ? { ...r, ...e.run } : r)));
    });
  }, [subscribe, fetchRuns]);

  return { runs, loading };
}
