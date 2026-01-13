import { useState, useEffect, useReducer, useCallback, useRef } from 'react';
import { matchupKey, compareVersions } from '../utils';

const API_BASE = '/api';

const matchupsReducer = (state, action) => {
  switch (action.type) {
    case 'SET':
      return action.data;
    case 'APPEND': {
      const existingKeys = new Set(state.map(matchupKey));
      const uniqueNew = action.data.filter((m) => !existingKeys.has(matchupKey(m)));
      return [...state, ...uniqueNew];
    }
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
          live_count: (state[idx].live_count || 0) + 1
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
          total: 0,
          lastActivity: e.game.timestamp,
          live_count: 1,
          lastCrash: 0
        },
        ...state
      ];
    }
    case 'run_update': {
      const run = action.event.run || action.event;
      const tid = run.run_id || run.id;
      return state.map((m) => {
        if (m.tournamentId !== tid) return m;

        let heroWins = m.heroWins;
        let villainWins = m.villainWins;

        if (typeof run.wins === 'number' && run.p1_name) {
          const p1 = { name: run.p1_name, version: run.p1_version };
          const p2 = { name: run.p2_name, version: run.p2_version };
          const p1IsHero = compareVersions(p1, p2) >= 0;
          heroWins = p1IsHero ? run.wins : run.losses;
          villainWins = p1IsHero ? run.losses : run.wins;
        } else if (typeof run.wins === 'number') {
          heroWins = run.wins;
          villainWins = run.losses;
        }

        return {
          ...m,
          heroWins,
          villainWins,
          draws: run.draws ?? m.draws,
          total: run.games_played ?? m.total
        };
      });
    }
    case 'run_delete': {
      const tid = action.event.run_id;
      return state.filter((m) => m.tournamentId !== tid);
    }
    case 'game_result': {
      const e = action.event;
      const tid = e.tournament_id || 'legacy';
      const key = `${tid}-${Math.min(e.black_id, e.white_id)}-${Math.max(e.black_id, e.white_id)}`;
      const idx = state.findIndex((m) => matchupKey(m) === key);
      if (idx !== -1) {
        const isCrash = e.winner_color === 4;
        const updated = {
          ...state[idx],
          lastActivity: new Date().toISOString(),
          live_count: Math.max(0, (state[idx].live_count || 0) - 1),
          lastCrash: isCrash ? Date.now() : state[idx].lastCrash
        };
        return [updated, ...state.filter((_, i) => i !== idx)];
      }
      return state;
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
  const prevToken = useRef(-1);

  const fetchPage = useCallback((p, shouldReplace) => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`${API_BASE}/matchups?limit=20&offset=${p * 20}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (shouldReplace) {
          dispatch({ type: 'SET', data });
        } else {
          dispatch({ type: 'APPEND', data });
        }
        setHasMore(data.length === 20);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setLoading(false);
      });
    return controller;
  }, []);

  useEffect(() => {
    const isReset = resetToken !== prevToken.current;
    prevToken.current = resetToken;
    const c = fetchPage(page, isReset);
    return () => c.abort();
  }, [page, resetToken, fetchPage]);

  const loadMore = useCallback(
    (reset = false) => {
      if (!reset && loading) return;
      if (reset) {
        setPage(0);
        setResetToken((t) => t + 1);
      } else {
        setPage((p) => p + 1);
      }
    },
    [loading]
  );

  const jumpTo = useCallback((offset) => {
    const p = Math.floor(offset / 20);
    setPage(p);
    setResetToken((t) => t + 1);
  }, []);

  useEffect(() => {
    return subscribe((e) => {
      if (e.type === 'reset') {
        dispatch({ type: 'RESET' });
        loadMore(true);
      } else if (e.type === 'game_start') dispatch({ type: 'game_start', event: e });
      else if (e.type === 'run_update') dispatch({ type: 'run_update', event: e });
      else if (e.type === 'run_delete') dispatch({ type: 'run_delete', event: e });
      else if (e.type === 'game_result') dispatch({ type: 'game_result', event: e });
    });
  }, [subscribe, loadMore]);

  return { matchups, loading, hasMore, loadMore, jumpTo };
}
