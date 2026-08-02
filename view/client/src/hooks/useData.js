import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getEventRunId, getRunId, matchupKey, sameSlotPair } from '../utils';

const API_BASE = '/api';
const REDUCER_EVENTS = new Set(['game_start', 'run_update', 'game_result']);

const sameId = (first, second) => String(first) === String(second);

const readCollection = async (response, label) => {
  if (!response.ok) {
    throw new Error(`${label} request failed`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(`${label} response is not a collection`);
  }

  return data;
};

const playerFromGame = (game, runId, slot) => {
  const black = game.black_slot === slot;

  return {
    id: `${runId}:${slot}`,
    slot,
    name: black ? game.black_name : game.white_name,
    version: black ? game.black_ver : game.white_ver
  };
};

const playerFromRun = (run, runId, slot, current) => {
  const side = slot === 1 ? 'slot1' : 'slot2';

  return {
    ...current,
    id: `${runId}:${slot}`,
    slot,
    name: run[`${side}_name`] ?? current?.name,
    version: run[`${side}_version`] ?? current?.version,
    cmd: run[`${side}_cmd`] ?? current?.cmd
  };
};

export const matchupsReducer = (state, action) => {
  if (action.type === 'SET') {
    return action.data;
  }

  if (action.type === 'APPEND') {
    return [
      ...new Map(
        [...state, ...action.data].map((matchup) => [matchupKey(matchup), matchup])
      ).values()
    ];
  }

  if (action.type === 'RESET') {
    return [];
  }

  if (action.type === 'game_start') {
    const event = action.event;

    if (!event.game) {
      return state;
    }

    const runId = getEventRunId(event);

    if (!runId) {
      return state;
    }

    const index = state.findIndex((matchup) => sameId(getRunId(matchup), runId));

    if (index >= 0) {
      const current = state[index];
      const updated = {
        ...current,
        runId,
        lastActivity: event.game.timestamp,
        live_count: (current.live_count || 0) + (event.game.winner_color === 0 ? 1 : 0)
      };

      return [updated, ...state.filter((_, currentIndex) => currentIndex !== index)];
    }

    return [
      {
        runId,
        status: 'live',
        hero: playerFromGame(event.game, runId, 1),
        villain: playerFromGame(event.game, runId, 2),
        heroWins: 0,
        villainWins: 0,
        draws: 0,
        total: 0,
        live_count: event.game.winner_color === 0 ? 1 : 0,
        lastActivity: event.game.timestamp
      },
      ...state
    ];
  }

  if (action.type === 'run_update') {
    const run = action.event.run ?? action.event;
    const runId = getEventRunId(action.event);

    return state.map((matchup) => {
      if (!sameId(getRunId(matchup), runId)) {
        return matchup;
      }

      return {
        ...matchup,
        status: run.status ?? matchup.status,
        run: {
          ...(matchup.run || {}),
          ...run,
          id: run.id ?? runId
        },
        hero: playerFromRun(run, runId, 1, matchup.hero),
        villain: playerFromRun(run, runId, 2, matchup.villain),
        heroWins: typeof run.wins === 'number' ? run.wins : matchup.heroWins,
        villainWins: typeof run.losses === 'number' ? run.losses : matchup.villainWins,
        draws: run.draws ?? matchup.draws,
        total: run.games_played ?? matchup.total
      };
    });
  }

  if (action.type === 'game_result') {
    const event = action.event;
    const runId = getEventRunId(event);

    return state.map((matchup) => {
      const matches =
        sameId(getRunId(matchup), runId) &&
        sameSlotPair(
          matchup.hero.slot,
          matchup.villain.slot,
          event.black_slot,
          event.white_slot
        );

      if (!matches) {
        return matchup;
      }

      return {
        ...matchup,
        lastActivity: new Date().toISOString(),
        live_count:
          event.winner_color === 0
            ? matchup.live_count || 0
            : Math.max(0, (matchup.live_count || 0) - 1)
      };
    });
  }

  return state;
};

export function useMatchups(subscribe) {
  const [matchups, dispatch] = useReducer(matchupsReducer, []);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);

    fetch(`${API_BASE}/matchups?limit=20&offset=${page * 20}`, {
      signal: controller.signal
    })
      .then((response) => readCollection(response, 'matchups'))
      .then((data) => {
        dispatch({
          type: page === 0 ? 'SET' : 'APPEND',
          data
        });
        setHasMore(data.length === 20);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [page, revision]);

  const loadMore = useCallback((reset = false) => {
    if (reset) {
      setPage(0);
      setRevision((current) => current + 1);
    } else {
      setPage((current) => current + 1);
    }
  }, []);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'reset') {
          dispatch({ type: 'RESET' });
          loadMore(true);
          return;
        }

        if (event.type === 'run_start') {
          loadMore(true);
          return;
        }

        if (REDUCER_EVENTS.has(event.type)) {
          dispatch({
            type: event.type,
            event
          });
        }
      }),
    [subscribe, loadMore]
  );

  return {
    matchups,
    loading,
    hasMore,
    loadMore
  };
}

export function useRuns(subscribe) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef({
    revision: 0,
    controller: null
  });

  const cancelRefresh = useCallback(() => {
    requestRef.current.revision += 1;
    requestRef.current.controller?.abort();
    requestRef.current.controller = null;
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    requestRef.current.controller?.abort();

    const controller = new AbortController();
    const revision = ++requestRef.current.revision;

    requestRef.current.controller = controller;
    setLoading(true);

    return fetch(`${API_BASE}/runs`, {
      signal: controller.signal
    })
      .then((response) => readCollection(response, 'runs'))
      .then((data) => {
        if (revision === requestRef.current.revision && !controller.signal.aborted) {
          setRuns(data);
        }

        return data;
      })
      .finally(() => {
        if (revision === requestRef.current.revision) {
          requestRef.current.controller = null;

          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      });
  }, []);

  useEffect(() => {
    const requests = requestRef;

    refresh().catch(() => {});

    return () => {
      requests.current.revision += 1;
      requests.current.controller?.abort();
      requests.current.controller = null;
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'reset') {
          setRuns([]);
          refresh().catch(() => {});
          return;
        }

        if ((event.type === 'run_start' || event.type === 'run_update') && event.run) {
          cancelRefresh();

          setRuns((current) => {
            const index = current.findIndex((run) => sameId(run.id, event.run.id));

            if (index < 0) {
              return [event.run, ...current];
            }

            return current.map((run, currentIndex) =>
              currentIndex === index
                ? {
                    ...run,
                    ...event.run
                  }
                : run
            );
          });
        }
      }),
    [subscribe, refresh, cancelRefresh]
  );

  return {
    runs,
    loading,
    refresh
  };
}

export function useData(subscribe) {
  const matchups = useMatchups(subscribe);
  const runs = useRuns(subscribe);

  return {
    matchups: matchups.matchups,
    matchupsLoading: matchups.loading,
    matchupsHasMore: matchups.hasMore,
    loadMoreMatchups: matchups.loadMore,
    runs: runs.runs,
    runsLoading: runs.loading,
    refreshRuns: runs.refresh
  };
}
