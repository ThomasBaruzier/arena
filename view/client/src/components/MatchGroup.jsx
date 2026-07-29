import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader } from 'lucide-react';
import TournamentStats from './TournamentStats';
import { getEventRunId, getRunId, sameSlotPair } from '../utils';

const API_BASE = '/api';

const SORT_COLUMNS = [
  {
    column: 'id',
    label: 'ID',
    name: 'game ID'
  },
  {
    column: 'moves',
    label: 'Mvs',
    name: 'move count'
  },
  {
    column: 'status',
    label: 'Res',
    name: 'result'
  },
  {
    column: 'time',
    label: 'Time',
    name: 'time'
  }
];

const validPairs = (value) =>
  Array.isArray(value) &&
  value.every((pair) => pair && typeof pair === 'object' && Array.isArray(pair.games));

const sortGames = (games, { col, asc }) => {
  if (col !== 'id') {
    return [...games].sort((first, second) => first.id - second.id);
  }

  return [...games].sort((first, second) => (asc ? first.id - second.id : second.id - first.id));
};

const getMoveCount = (game) =>
  game.move_count ?? (game.moves ? game.moves.split(';').filter(Boolean).length : 0);

const isPlayerWin = (game, slot) => {
  if (!slot || game.winner_color === 0 || game.winner_color === 3 || game.winner_color === 4) {
    return false;
  }

  return (
    (game.winner_color === 1 && game.black_slot === slot) ||
    (game.winner_color === 2 && game.white_slot === slot)
  );
};

const resultLabel = (game, slot) => {
  if (game.winner_color === 0) {
    return 'live';
  }

  if (game.winner_color === 3) {
    return 'draw';
  }

  if (game.winner_color === 4) {
    return 'void';
  }

  return isPlayerWin(game, slot) ? 'S1 win' : 'S1 loss';
};

const gameTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

const sameGame = (first, second) =>
  first.id === second.id ||
  (first.external_id != null &&
    second.external_id != null &&
    first.external_id === second.external_id);

const summarizePair = (pair, games, sort, firstSlot, latest = pair.latest_ts) => {
  const sortedGames = sortGames(games, sort);
  const moveCounts = sortedGames.map(getMoveCount);

  return {
    ...pair,
    games: sortedGames,
    max_id: Math.max(pair.max_id || 0, ...sortedGames.map((game) => game.id || 0)),
    latest_ts: latest,
    max_moves: Math.max(...moveCounts),
    min_moves: Math.min(...moveCounts),
    live_count: sortedGames.filter((game) => game.winner_color === 0).length,
    hero_wins: sortedGames.reduce(
      (count, game) => count + (isPlayerWin(game, firstSlot) ? 1 : 0),
      0
    )
  };
};

const sortPairs = (pairs, { col, asc }) => {
  const direction = asc ? 1 : -1;

  return [...pairs].sort((first, second) => {
    let firstValue;
    let secondValue;

    if (col === 'moves') {
      firstValue = asc ? first.min_moves : first.max_moves;
      secondValue = asc ? second.min_moves : second.max_moves;
    } else if (col === 'time') {
      firstValue = new Date(first.latest_ts).getTime();
      secondValue = new Date(second.latest_ts).getTime();
    } else if (col === 'status') {
      if (first.live_count !== second.live_count) {
        return (first.live_count - second.live_count) * direction;
      }

      firstValue = first.hero_wins || 0;
      secondValue = second.hero_wins || 0;
    } else {
      firstValue = first.max_id;
      secondValue = second.max_id;
    }

    if (firstValue < secondValue) {
      return -direction;
    }

    if (firstValue > secondValue) {
      return direction;
    }

    return second.max_id - first.max_id;
  });
};

export const gamesCursor = (pair, sort) => {
  if (!pair || !Number.isSafeInteger(Number(pair.max_id)) || Number(pair.max_id) < 1) {
    return null;
  }

  const cursor = {
    id: Number(pair.max_id)
  };

  if (sort.col === 'moves') {
    cursor.value = Number(sort.asc ? pair.min_moves : pair.max_moves);
  } else if (sort.col === 'time') {
    cursor.value = pair.latest_ts;
  } else if (sort.col === 'status') {
    cursor.value = Number(pair.live_count || 0);
    cursor.secondary = Number(pair.hero_wins || 0);
  } else if (sort.col === 'duration') {
    cursor.value = Number(pair.duration || 0);
  }

  if (
    Object.values(cursor).some(
      (value) => value == null || (typeof value === 'number' && !Number.isFinite(value))
    )
  ) {
    return null;
  }

  return JSON.stringify(cursor);
};

export const liveEventInvalidatesCursor = (type, column) =>
  type === 'game_start' ||
  column === 'moves' ||
  (type === 'game_result' && (column === 'status' || column === 'duration'));

export const pairsReducer = (state, action) => {
  let next;

  switch (action.type) {
    case 'SET':
      next = action.data;
      break;

    case 'APPEND': {
      const byGroup = new Map(state.map((pair) => [pair.group_id, pair]));

      for (const incoming of action.data) {
        const existing = byGroup.get(incoming.group_id);

        if (!existing) {
          byGroup.set(incoming.group_id, incoming);
          continue;
        }

        const games = new Map(existing.games.map((game) => [game.id, game]));

        for (const game of incoming.games) {
          games.set(game.id, game);
        }

        byGroup.set(incoming.group_id, {
          ...incoming,
          games: [...games.values()]
        });
      }

      next = [...byGroup.values()];
      break;
    }

    case 'CLEAR':
      return [];

    case 'game_start': {
      const game = {
        ...action.game,
        move_count: getMoveCount(action.game)
      };

      const withoutGame = state
        .map((pair) => ({
          ...pair,
          games: pair.games.filter((current) => !sameGame(current, game))
        }))
        .filter((pair) => pair.games.length > 0);

      const existing = withoutGame.find((pair) => pair.group_id === game.group_id);

      if (existing) {
        next = withoutGame.map((pair) =>
          pair.group_id === game.group_id
            ? summarizePair(
                pair,
                [...pair.games, game],
                action.sort,
                action.firstSlot,
                game.timestamp
              )
            : pair
        );
      } else {
        next = [
          summarizePair(
            {
              group_id: game.group_id,
              latest_ts: game.timestamp,
              max_id: game.id,
              games: []
            },
            [game],
            action.sort,
            action.firstSlot,
            game.timestamp
          ),
          ...withoutGame
        ];
      }

      break;
    }

    case 'game_update': {
      const event = action.event;

      const sourcePair = state.find((pair) => pair.games.some((game) => sameGame(game, event)));

      const sourceGame = sourcePair?.games.find((game) => sameGame(game, event));

      const updated = sourceGame
        ? {
            ...sourceGame,
            group_id: event.group_id ?? sourceGame.group_id,
            run_id: event.run_id ?? sourceGame.run_id,
            moves: event.moves ?? sourceGame.moves,
            move_count: event.move_count ?? sourceGame.move_count,
            winner_color: event.winner_color ?? sourceGame.winner_color,
            duration: event.duration ?? sourceGame.duration
          }
        : null;

      const byGroup = new Map();

      for (const pair of state) {
        const games = pair.games.filter((game) => !sameGame(game, event));

        if (games.length) {
          byGroup.set(pair.group_id, {
            ...pair,
            games
          });
        }
      }

      if (updated) {
        const target = byGroup.get(updated.group_id) || {
          group_id: updated.group_id,
          max_moves: 0,
          min_moves: 0,
          live_count: 0,
          hero_wins: 0,
          latest_ts: updated.timestamp,
          max_id: updated.id,
          games: []
        };

        byGroup.set(
          updated.group_id,
          summarizePair(
            target,
            [...target.games, updated],
            action.sort,
            action.firstSlot,
            updated.timestamp ?? target.latest_ts
          )
        );
      }

      next = [...byGroup.values()];
      break;
    }

    default:
      return state;
  }

  return action.sort && next ? sortPairs(next, action.sort) : next;
};

const Identity = ({ player, leading }) => (
  <div className="player-identity" data-testid={`player-row-${player.slot}`}>
    <span className={`p-name-text ${leading ? 'gold-text' : ''}`}>{player.name}</span>
    <span className="ver-tag">{player.version}</span>
  </div>
);

const Record = ({ wins, losses, draws }) => (
  <div className="tournament-record" aria-label={`${wins} wins, ${losses} losses, ${draws} draws`}>
    <span>
      <b>W</b> {wins}
    </span>
    <span>
      <b>L</b> {losses}
    </span>
    <span>
      <b>D</b> {draws}
    </span>
  </div>
);

export default function MatchGroup({
  group,
  run,
  selectedGameId,
  onSelectGame,
  subscribe,
  open,
  onToggle
}) {
  const [pairs, dispatch] = useReducer(pairsReducer, []);
  const [sort, setSort] = useState({
    col: 'id',
    asc: false
  });
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const abortRef = useRef(null);
  const liveRefreshRef = useRef(null);
  const sentinelRef = useRef(null);
  const detailsId = useId();

  const runId = getRunId(group);

  const effectiveRun =
    run || group.run
      ? {
          ...(group.run || {}),
          ...(run || {})
        }
      : null;

  const status = effectiveRun?.status ?? group.status ?? 'live';

  const gamesPlayed = effectiveRun?.games_played ?? group.total ?? 0;

  const totalGames = effectiveRun?.total_games ?? 0;

  const progress = totalGames > 0 ? Math.min(100, (gamesPlayed / totalGames) * 100) : 0;

  const fetchGames = useCallback(
    (sortConfig, nextCursor = null, append = false, commitSort = false) => {
      abortRef.current?.abort();

      const controller = new AbortController();

      abortRef.current = controller;
      setFetching(true);
      setLoadError(null);

      const params = new URLSearchParams({
        run_id: runId,
        hero_slot: String(group.hero.slot),
        sort: sortConfig.col,
        order: sortConfig.asc ? 'asc' : 'desc',
        limit: '50'
      });

      if (nextCursor) {
        params.set('cursor', nextCursor);
      }

      return fetch(`${API_BASE}/games?${params}`, {
        signal: controller.signal
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error('game list request failed');
          }

          return response.json();
        })
        .then((data) => {
          if (!validPairs(data)) {
            throw new Error('invalid game list response');
          }

          dispatch({
            type: append ? 'APPEND' : 'SET',
            data,
            sort: sortConfig
          });

          if (commitSort) {
            setSort(sortConfig);
          }

          const followingCursor = data.length ? gamesCursor(data.at(-1), sortConfig) : null;

          setCursor(followingCursor);
          setHasMore(data.length === 50 && Boolean(followingCursor));
          setLoaded(true);
          setLoadError(null);
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            setLoadError('Could not load game history.');
          }
        })
        .finally(() => {
          if (abortRef.current === controller) {
            setFetching(false);
          }
        });
    },
    [group.hero.slot, runId]
  );

  useEffect(() => {
    let timer;

    if (!open) {
      abortRef.current?.abort();
      clearTimeout(liveRefreshRef.current);
      liveRefreshRef.current = null;

      timer = setTimeout(() => {
        dispatch({
          type: 'CLEAR'
        });
        setHasMore(true);
        setCursor(null);
        setLoaded(false);
        setFetching(false);
        setLoadError(null);
      }, 250);
    } else if (!loaded && !fetching && !loadError) {
      fetchGames(sort);
    }

    return () => clearTimeout(timer);
  }, [open, loaded, fetching, loadError, sort, fetchGames]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(liveRefreshRef.current);
    },
    []
  );

  const handleSort = (column) => {
    if (fetching) return;

    clearTimeout(liveRefreshRef.current);
    liveRefreshRef.current = null;

    const nextSort =
      sort.col === column
        ? {
            col: column,
            asc: !sort.asc
          }
        : {
            col: column,
            asc: false
          };

    fetchGames(nextSort, null, false, true);
  };

  const retry = () => {
    if (fetching) return;

    clearTimeout(liveRefreshRef.current);
    liveRefreshRef.current = null;

    fetchGames(sort, null, false);
  };

  const loadMore = useCallback(() => {
    if (loaded && hasMore && !fetching && !loadError) {
      fetchGames(sort, cursor, true);
    }
  }, [loaded, hasMore, fetching, loadError, fetchGames, sort, cursor]);

  const refreshPagedHistory = useCallback(() => {
    if (!hasMore) return;

    clearTimeout(liveRefreshRef.current);

    liveRefreshRef.current = window.setTimeout(() => {
      liveRefreshRef.current = null;

      fetchGames(sort, null, false);
    }, 100);
  }, [fetchGames, hasMore, sort]);

  useEffect(() => {
    if (!open || !loaded || loadError || !sentinelRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !fetching) {
          loadMore();
        }
      },
      {
        rootMargin: '100px'
      }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [open, loaded, loadError, hasMore, fetching, loadMore]);

  useEffect(() => {
    if (!open || !loaded) {
      return undefined;
    }

    return subscribe((event) => {
      if (String(getEventRunId(event)) !== String(runId)) {
        return;
      }

      const belongsToMatchup = (blackSlot, whiteSlot) =>
        sameSlotPair(group.hero.slot, group.villain.slot, blackSlot, whiteSlot);

      if (
        event.type === 'game_start' &&
        event.game &&
        belongsToMatchup(event.game.black_slot, event.game.white_slot)
      ) {
        dispatch({
          type: 'game_start',
          game: event.game,
          sort,
          firstSlot: group.hero.slot
        });

        refreshPagedHistory();
      }

      if ((event.type === 'game_move' || event.type === 'game_result') && event.group_id) {
        dispatch({
          type: 'game_update',
          event,
          sort,
          firstSlot: group.hero.slot
        });

        if (liveEventInvalidatesCursor(event.type, sort.col)) {
          refreshPagedHistory();
        }
      }
    });
  }, [
    open,
    loaded,
    group.hero.slot,
    group.villain.slot,
    runId,
    subscribe,
    sort,
    refreshPagedHistory
  ]);

  const resultClass = (game) => {
    if (game.winner_color === 3) {
      return 'res-dot draw';
    }

    if (game.winner_color === 4) {
      return 'res-dot void';
    }

    return isPlayerWin(game, group.hero.slot) ? 'res-dot res-win' : 'res-dot res-loss';
  };

  const loading = open && !loaded && !loadError;

  const state = open ? (loaded ? 'open' : 'loading') : 'closed';

  return (
    <div className={`group-item ${state}`} data-testid="match-group">
      <button
        type="button"
        className="group-header"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        {status === 'live' && totalGames > 0 && (
          <span
            className="header-progress-bg"
            style={{
              width: `${progress}%`
            }}
          />
        )}

        <span className="tournament-summary">
          <span className="summary-row">
            <Identity player={group.hero} leading={group.heroWins > group.villainWins} />
            <Record wins={group.heroWins} losses={group.villainWins} draws={group.draws} />
          </span>

          <span className="summary-row">
            <Identity player={group.villain} leading={group.villainWins > group.heroWins} />
            <span className="run-summary">
              <span className={`run-status ${status}`}>{status.toUpperCase()}</span>
              <span className="run-progress">
                {gamesPlayed}
                {totalGames > 0 ? `/${totalGames}` : ''}
              </span>
            </span>
          </span>
        </span>
      </button>

      {open && (
        <div id={detailsId} className={`group-list ${state}`} aria-busy={fetching}>
          <div className="group-list-inner">
            <TournamentStats group={group} run={effectiveRun} />

            {loadError && (
              <div className="history-error" role="alert">
                <span>{loadError}</span>
                <button type="button" onClick={retry} disabled={fetching}>
                  Retry
                </button>
              </div>
            )}

            {loading && (
              <div className="loading-sentinel">
                <Loader size={14} className="spin" />
              </div>
            )}

            {loaded && (
              <>
                <div className="match-header-row" aria-label="Sort historical games">
                  {SORT_COLUMNS.map(({ column, label, name }) => {
                    const active = sort.col === column;

                    const direction = active
                      ? sort.asc
                        ? 'ascending'
                        : 'descending'
                      : 'not selected';

                    return (
                      <div key={column} className="sort-cell">
                        <button
                          type="button"
                          onClick={() => handleSort(column)}
                          className={`sort-col ${active ? 'active' : ''}`}
                          aria-pressed={active}
                          aria-label={`Sort by ${name}, ${direction}`}
                          disabled={fetching}
                        >
                          {label}
                          {active &&
                            (sort.asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {pairs.map((pair) => (
                  <div
                    key={pair.group_id}
                    className={`pair-container ${pair.games.length === 1 ? 'pending' : ''}`}
                  >
                    {pair.games.map((game) => {
                      const moves = game.move_count || 0;

                      const outcome = resultLabel(game, group.hero.slot);

                      const time = gameTime(game.timestamp);

                      return (
                        <button
                          type="button"
                          key={game.id}
                          className={`match-row ${selectedGameId === game.id ? 'active' : ''}`}
                          onClick={() => onSelectGame(game.id)}
                          data-testid="match-row"
                          aria-label={`Game ${game.id}, ${moves} moves, ${outcome}, ${time}`}
                        >
                          <span className="row-id" aria-hidden="true">
                            #{game.id}
                          </span>
                          <span className="row-moves" aria-hidden="true">
                            {moves}
                          </span>
                          <span className="row-status" aria-hidden="true">
                            {game.winner_color === 0 ? (
                              <span className="live-dot" />
                            ) : (
                              <span className={resultClass(game)} />
                            )}
                          </span>
                          <span className="row-time" aria-hidden="true">
                            {time}
                          </span>
                        </button>
                      );
                    })}

                    {pair.games.length === 1 && (
                      <div className="pending-row">
                        <Loader size={12} className="spin" />
                        Waiting for pair...
                      </div>
                    )}
                  </div>
                ))}

                {hasMore && (
                  <div ref={sentinelRef} className="loading-sentinel">
                    {fetching && <Loader size={14} className="spin" />}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
