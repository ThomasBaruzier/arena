import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Loader } from 'lucide-react';
import { getEventRunId, sameSlotPair } from '../utils';

const API_BASE = '/api';

const SORT_COLUMNS = [
  ['id', 'ID'],
  ['moves', 'Mvs'],
  ['status', 'Res'],
  ['time', 'Time']
];

const formatFloat = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number >= 100) return number.toFixed(0);
  if (number >= 10) return number.toFixed(1);
  return number.toFixed(2);
};

const statSide = (slot) => (slot === 1 ? 'p1' : 'p2');

const sortGames = (games, { col, asc }) => {
  if (col !== 'id') return [...games].sort((first, second) => first.id - second.id);
  return [...games].sort((first, second) =>
    asc ? first.id - second.id : second.id - first.id
  );
};

const getMoveCount = (game) =>
  game.move_count ?? (game.moves ? game.moves.split(';').filter(Boolean).length : 0);

const isPlayerWin = (game, slot) => {
  if (
    !slot ||
    game.winner_color === 0 ||
    game.winner_color === 3 ||
    game.winner_color === 4
  ) {
    return false;
  }

  return (
    (game.winner_color === 1 && game.black_slot === slot) ||
    (game.winner_color === 2 && game.white_slot === slot)
  );
};

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

    if (firstValue < secondValue) return -direction;
    if (firstValue > secondValue) return direction;
    return second.max_id - first.max_id;
  });
};

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
        for (const game of incoming.games) games.set(game.id, game);

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
      const sourcePair = state.find((pair) =>
        pair.games.some((game) => sameGame(game, event))
      );
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
        if (games.length) byGroup.set(pair.group_id, { ...pair, games });
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

const PlayerRow = ({ player, run, wins, leading }) => {
  const side = statSide(player.slot);
  const crashes = Number(run?.[`${side}_crashes`] || 0);

  return (
    <div className="player-row" data-testid={`player-row-${player.slot}`}>
      <div className="player-identity">
        <span className={`p-name-text ${leading ? 'gold-text' : ''}`}>{player.name}</span>
        <span className="ver-tag">{player.version}</span>
        <span className="player-wins">{wins}W</span>
      </div>
      {run && (
        <div className="player-metrics">
          <span>
            <small>Elo</small>
            {formatFloat(run[`${side}_elo`])}
          </span>
          <span>
            <small>ERF</small>
            {formatFloat(run[`${side}_erf`])}
          </span>
          <span>
            <small>CMA</small>
            {formatFloat(run[`${side}_cma`])}%
          </span>
          <span>
            <small>Bln</small>
            {formatFloat(run[`${side}_blunder`])}%
          </span>
          {crashes > 0 && (
            <span className="crash">
              <small>Crash</small>
              {crashes}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default function MatchGroup({
  group,
  run,
  selectedGameId,
  onSelectGame,
  subscribe,
  open,
  onToggle,
  onLoaded
}) {
  const [pairs, dispatch] = useReducer(pairsReducer, []);
  const [sort, setSort] = useState({ col: 'id', asc: false });
  const [hasMore, setHasMore] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef(null);
  const sentinelRef = useRef(null);

  const progress =
    run && run.total_games > 0 ? (run.games_played / run.total_games) * 100 : 0;
  const finished = run && run.total_games > 0 && run.games_played >= run.total_games;

  const fetchGames = useCallback(
    (sortConfig, offset = 0, append = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const params = new URLSearchParams({
        run_id: group.runId,
        hero_slot: String(group.hero.slot),
        sort: sortConfig.col,
        order: sortConfig.asc ? 'asc' : 'desc',
        limit: '50',
        offset: String(offset)
      });

      return fetch(`${API_BASE}/games?${params}`, {
        signal: abortRef.current.signal
      })
        .then((response) => response.json())
        .then((data) => {
          dispatch({
            type: append ? 'APPEND' : 'SET',
            data,
            sort: sortConfig
          });
          setHasMore(data.length === 50);
          setLoaded(true);
          if (!append) onLoaded?.();
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setLoaded(false);
        });
    },
    [group.hero.slot, group.runId, onLoaded]
  );

  useEffect(() => {
    let timer;

    if (!open) {
      abortRef.current?.abort();
      timer = setTimeout(() => {
        dispatch({ type: 'CLEAR' });
        setHasMore(true);
        setLoaded(false);
      }, 250);
    } else if (!loaded) {
      fetchGames(sort);
    }

    return () => clearTimeout(timer);
  }, [open, loaded, sort, fetchGames]);

  const handleSort = (column) => {
    const nextSort =
      sort.col === column
        ? { col: column, asc: !sort.asc }
        : { col: column, asc: false };

    setSort(nextSort);
    fetchGames(nextSort);
  };

  const loadMore = useCallback(() => {
    if (loaded && hasMore) fetchGames(sort, pairs.length, true);
  }, [loaded, hasMore, fetchGames, sort, pairs.length]);

  useEffect(() => {
    if (!open || !loaded || !sentinelRef.current) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore) loadMore();
      },
      { rootMargin: '100px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [open, loaded, hasMore, loadMore]);

  useEffect(() => {
    if (!open || !loaded) return undefined;

    return subscribe((event) => {
      if (String(getEventRunId(event)) !== String(group.runId)) return;

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
      }

      if (
        (event.type === 'game_move' || event.type === 'game_result') &&
        event.group_id
      ) {
        dispatch({
          type: 'game_update',
          event,
          sort,
          firstSlot: group.hero.slot
        });
      }
    });
  }, [
    open,
    loaded,
    group.hero.slot,
    group.villain.slot,
    group.runId,
    subscribe,
    sort
  ]);

  const resultClass = (game) => {
    if (game.winner_color === 3) return 'res-dot draw';
    if (game.winner_color === 4) return 'res-dot void';
    return isPlayerWin(game, group.hero.slot) ? 'res-dot res-win' : 'res-dot res-loss';
  };

  const visible = open && loaded;
  const loading = open && !loaded;
  const state = !open && loaded ? 'closing' : visible ? 'open' : loading ? 'loading' : 'closed';

  return (
    <div className={`group-item ${state}`} data-testid="match-group">
      <div className="group-header" onClick={onToggle}>
        {run && !finished && (
          <div className="header-progress-bg" style={{ width: `${progress}%` }} />
        )}
        <div className="header-content">
          <div className="icon-col">
            {loading ? (
              <Loader size={14} className="spin" />
            ) : visible ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </div>
          <div className="group-info">
            <PlayerRow
              player={group.hero}
              run={run}
              wins={group.heroWins}
              leading={group.heroWins > group.villainWins}
            />
            <PlayerRow
              player={group.villain}
              run={run}
              wins={group.villainWins}
              leading={group.villainWins > group.heroWins}
            />
            <div className="group-summary">
              <span className="badge win">W {group.heroWins}</span>
              <span className="badge loss">L {group.villainWins}</span>
              <span className="badge draw">D {group.draws}</span>
              {run && (
                <span className={`badge progress ${finished ? 'finished' : ''}`}>
                  {run.games_played}/{run.total_games}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={`group-list ${state}`}>
        <div className="group-list-inner">
          <div className="match-header-row">
            {SORT_COLUMNS.map(([column, label]) => (
              <div
                key={column}
                onClick={() => handleSort(column)}
                className={`sort-col ${sort.col === column ? 'active' : ''}`}
              >
                {label}{' '}
                {sort.col === column &&
                  (sort.asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
              </div>
            ))}
          </div>
          {pairs.map((pair) => (
            <div
              key={pair.group_id}
              className={`pair-container ${pair.games.length === 1 ? 'pending' : ''}`}
            >
              {pair.games.map((game) => (
                <div
                  key={game.id}
                  className={`match-row ${selectedGameId === game.id ? 'active' : ''}`}
                  onClick={() => onSelectGame(game.id)}
                  data-testid="match-row"
                >
                  <div className="row-id">#{game.id}</div>
                  <div className="row-moves">{game.move_count || 0}</div>
                  <div className="row-status">
                    {game.winner_color === 0 ? (
                      <span className="live-dot" />
                    ) : (
                      <div className={resultClass(game)} />
                    )}
                  </div>
                  <div className="row-time">
                    {new Date(game.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </div>
                </div>
              ))}
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
              {loading && <Loader size={14} className="spin" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
