import { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Loader } from 'lucide-react';
import { getEventRunId, sameSlotPair } from '../utils';

const API_BASE = '/api';
const SORT_COLUMNS = [
  ['id', 'ID'],
  ['moves', 'Mvs'],
  ['status', 'Res'],
  ['time', 'Time']
];

const formatFloat = (val) => {
  if (val === undefined || val === null) return '0.00';
  if (val >= 100) return val.toFixed(0);
  if (val >= 10) return val.toFixed(1);
  return val.toFixed(2);
};

const sortGames = (games, { col, asc }) => {
  if (col !== 'id') return [...games].sort((a, b) => a.id - b.id);
  return [...games].sort((a, b) => (asc ? a.id - b.id : b.id - a.id));
};

const getMoveCount = (g) =>
  g.move_count ?? (g.moves ? g.moves.split(';').filter(Boolean).length : 0);

const isHeroWin = (g, heroSlot) => {
  if (!heroSlot || g.winner_color === 0 || g.winner_color === 3 || g.winner_color === 4) return false;
  return (g.winner_color === 1 && g.black_slot === heroSlot) || (g.winner_color === 2 && g.white_slot === heroSlot);
};

const sameGame = (a, b) =>
  a.id === b.id ||
  (a.external_id !== undefined &&
    a.external_id !== null &&
    b.external_id !== undefined &&
    b.external_id !== null &&
    a.external_id === b.external_id);

const summarizePair = (pair, games, sort, heroSlot, latestTs = pair.latest_ts) => {
  const sortedGames = sortGames(games, sort);
  const movesList = sortedGames.map(getMoveCount);
  return {
    ...pair,
    games: sortedGames,
    max_id: Math.max(pair.max_id || 0, ...sortedGames.map((g) => g.id || 0)),
    latest_ts: latestTs,
    max_moves: Math.max(...movesList),
    min_moves: Math.min(...movesList),
    live_count: sortedGames.filter((g) => g.winner_color === 0).length,
    hero_wins: sortedGames.reduce((acc, g) => acc + (isHeroWin(g, heroSlot) ? 1 : 0), 0)
  };
};

const sortPairs = (pairs, { col, asc }) => {
  const dir = asc ? 1 : -1;
  return [...pairs].sort((a, b) => {
    let valA, valB;
    if (col === 'moves') {
      valA = asc ? a.min_moves : a.max_moves;
      valB = asc ? b.min_moves : b.max_moves;
    } else if (col === 'time') {
      valA = new Date(a.latest_ts).getTime();
      valB = new Date(b.latest_ts).getTime();
    } else if (col === 'status') {
      if (a.live_count !== b.live_count) return (a.live_count - b.live_count) * dir;
      valA = a.hero_wins || 0;
      valB = b.hero_wins || 0;
    } else {
      valA = a.max_id;
      valB = b.max_id;
    }
    if (valA < valB) return -1 * dir;
    if (valA > valB) return 1 * dir;
    return b.max_id - a.max_id;
  });
};

export const pairsReducer = (state, action) => {
  let newState;
  switch (action.type) {
    case 'SET':
      newState = action.data;
      break;
    case 'APPEND': {
      const byGroup = new Map(state.map((p) => [p.group_id, p]));
      for (const incoming of action.data) {
        const existing = byGroup.get(incoming.group_id);
        if (!existing) {
          byGroup.set(incoming.group_id, incoming);
          continue;
        }
        const gamesById = new Map(existing.games.map((g) => [g.id, g]));
        for (const game of incoming.games) gamesById.set(game.id, game);
        byGroup.set(incoming.group_id, { ...incoming, games: [...gamesById.values()] });
      }
      newState = [...byGroup.values()];
      break;
    }
    case 'CLEAR':
      return [];
    case 'game_start': {
      const g = { ...action.game, move_count: getMoveCount(action.game) };
      const stateWithoutGame = state
        .map((p) => ({
          ...p,
          games: p.games.filter((x) => !sameGame(x, g))
        }))
        .filter((p) => p.games.length > 0);
      const existing = stateWithoutGame.find((p) => p.group_id === g.group_id);
      if (existing) {
        newState = stateWithoutGame.map((p) =>
          p.group_id === g.group_id
            ? summarizePair(p, [...p.games, g], action.sort, action.heroSlot, g.timestamp)
            : p
        );
      } else {
        newState = [
          summarizePair(
            { group_id: g.group_id, latest_ts: g.timestamp, max_id: g.id, games: [] },
            [g],
            action.sort,
            action.heroSlot,
            g.timestamp
          ),
          ...state
        ];
      }
      break;
    }
    case 'game_update': {
      const e = action.event;
      const sourcePair = state.find((p) =>
        p.games.some((g) => sameGame(g, e))
      );
      const sourceGame = sourcePair?.games.find((g) => sameGame(g, e));
      const updatedGame = sourceGame
        ? {
            ...sourceGame,
            group_id: e.group_id ?? sourceGame.group_id,
            run_id: e.run_id ?? sourceGame.run_id,
            moves: e.moves ?? sourceGame.moves,
            move_count: e.move_count ?? sourceGame.move_count,
            winner_color: e.winner_color ?? sourceGame.winner_color,
            duration: e.duration ?? sourceGame.duration
          }
        : null;

      const byGroup = new Map();
      for (const pair of state) {
        const games = pair.games.filter((g) => !sameGame(g, e));
        if (games.length > 0) byGroup.set(pair.group_id, { ...pair, games });
      }

      if (updatedGame) {
        const groupId = updatedGame.group_id;
        const target = byGroup.get(groupId) || {
          group_id: groupId,
          max_moves: 0,
          min_moves: 0,
          live_count: 0,
          hero_wins: 0,
          latest_ts: updatedGame.timestamp,
          max_id: updatedGame.id,
          games: []
        };
        byGroup.set(
          groupId,
          summarizePair(
            target,
            [...target.games, updatedGame],
            action.sort,
            action.heroSlot,
            updatedGame.timestamp ?? target.latest_ts
          )
        );
      }

      newState = [...byGroup.values()];
      break;
    }
    default:
      return state;
  }
  if (action.sort && newState) return sortPairs(newState, action.sort);
  return newState;
};

const RunStatsRow = ({ run, side, hasCrashes }) => (
  <div className={`stats-row ${side} ${hasCrashes ? 'has-crash' : ''}`}>
    <span className="player-label">{side.toUpperCase()}</span>
    <span>{formatFloat(run[`${side}_elo`])}</span>
    <span>{formatFloat(run[`${side}_erf`])}</span>
    <span>{formatFloat(run[`${side}_cma`])}%</span>
    <span>{formatFloat(run[`${side}_blunder`])}%</span>
    {hasCrashes && <span className="crash">{run[`${side}_crashes`]}</span>}
  </div>
);

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

  const progress = run && run.total_games > 0 ? (run.games_played / run.total_games) * 100 : 0;
  const isFinished = run && run.total_games > 0 && run.games_played >= run.total_games;

  const fetchGames = useCallback(
    (sortConfig, offset = 0, append = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const params = new URLSearchParams({
        hero_slot: group.hero.slot,
        sort: sortConfig.col,
        order: sortConfig.asc ? 'asc' : 'desc',
        limit: 50,
        offset
      });
      params.set('run_id', group.runId);
      return fetch(`${API_BASE}/games?${params}`, { signal: abortRef.current.signal })
        .then((r) => r.json())
        .then((data) => {
          dispatch(
            append
              ? { type: 'APPEND', data, sort: sortConfig }
              : { type: 'SET', data, sort: sortConfig }
          );
          setHasMore(data.length === 50);
          setLoaded(true);
          if (!append) onLoaded?.();
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setLoaded(false);
        });
  }, [group.hero.slot, group.runId, onLoaded]

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

  const handleSort = (col) => {
    const newSort = sort.col === col ? { col, asc: !sort.asc } : { col, asc: false };
    setSort(newSort);
    fetchGames(newSort);
  };

  const loadMore = useCallback(() => {
    if (!loaded || !hasMore) return;
    fetchGames(sort, pairs.length, true);
  }, [loaded, hasMore, pairs.length, sort, fetchGames]);

  useEffect(() => {
    if (!open || !loaded || !sentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && hasMore) loadMore();
      },
      { rootMargin: '100px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [open, loaded, hasMore, loadMore]);

  useEffect(() => {
    if (!open || !loaded) return;
    return subscribe((e) => {
      const tid = getEventRunId(e);
      if (String(tid) !== String(group.runId)) return;
      const isMatch = (blackSlot, whiteSlot) => sameSlotPair(group.hero.slot, group.villain.slot, blackSlot, whiteSlot);
      if (e.type === 'game_start' && e.game && isMatch(e.game.black_slot, e.game.white_slot)) {
        dispatch({ type: 'game_start', game: e.game, sort, heroSlot: group.hero.slot });
      }
      if ((e.type === 'game_move' || e.type === 'game_result') && e.group_id) {
        dispatch({ type: 'game_update', event: e, sort, heroSlot: group.hero.slot });
      }
    });
  }, [open, loaded, group.hero.slot, group.villain.slot, group.runId, subscribe, sort]);

  const getStatusClass = (g) => {
    if (g.winner_color === 3) return 'res-dot draw';
    return isHeroWin(g, group.hero.slot) ? 'res-dot res-win' : 'res-dot res-loss';
  };

  const showContent = open && loaded;
  const isLoading = open && !loaded;
  const animState =
    !open && loaded ? 'closing' : showContent ? 'open' : isLoading ? 'loading' : 'closed';

  return (
    <div className={`group-item ${animState}`} data-testid="match-group">
      <div className="group-header" onClick={onToggle}>
        {run && !isFinished && (
          <div className="header-progress-bg" style={{ width: `${progress}%` }} />
        )}
        <div className="header-content">
          <div className="icon-col">
            {isLoading ? (
              <Loader size={14} className="spin" />
            ) : showContent ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </div>
          <div className="group-info">
            <div className="info-row">
              <div className="player-info">
                <span
                  className={`p-name-text ${group.heroWins > group.villainWins ? 'gold-text' : ''}`}
                >
                  {group.hero.name}
                </span>
                <span className="ver-tag">{group.hero.version}</span>
              </div>
              <div className="meta-info">
                <span className={`badge ${group.heroWins > group.villainWins ? 'win' : ''}`}>
                  W {group.heroWins}
                </span>
                <span className={`badge ${group.villainWins > group.heroWins ? 'loss' : ''}`}>
                  L {group.villainWins}
                </span>
                <span className="badge draw">D {group.draws}</span>
              </div>
            </div>
            <div className="info-row">
              <div className="player-info">
                <span
                  className={`p-name-text ${group.villainWins > group.heroWins ? 'gold-text' : ''}`}
                >
                  {group.villain.name}
                </span>
                <span className="ver-tag">{group.villain.version}</span>
              </div>
              {run && (
                <div className="meta-info">
                  <span className={`badge progress ${isFinished ? 'finished' : ''}`}>
                    {run.games_played}/{run.total_games}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        {run &&
          (() => {
            const hasCrashes = run.p1_crashes > 0 || run.p2_crashes > 0;
            return (
              <div className="run-stats-table">
                <div className={`stats-header ${hasCrashes ? 'has-crash' : ''}`}>
                  <span></span>
                  <span>Elo</span>
                  <span>ERF</span>
                  <span>CMA</span>
                  <span>Bln</span>
                  {hasCrashes && <span>💥</span>}
                </div>
                <RunStatsRow run={run} side="p1" hasCrashes={hasCrashes} />
                <RunStatsRow run={run} side="p2" hasCrashes={hasCrashes} />
              </div>
            );
          })()}
      </div>
      <div className={`group-list ${animState}`}>
        <div className="group-list-inner">
          <div className="match-header-row">
            {SORT_COLUMNS.map(([col, label]) => (
              <div
                key={col}
                onClick={() => handleSort(col)}
                className={`sort-col ${sort.col === col ? 'active' : ''}`}
              >
                {label}{' '}
                {sort.col === col &&
                  (sort.asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
              </div>
            ))}
          </div>
          {pairs.map((p) => (
            <div
              key={p.group_id}
              className={`pair-container ${p.games.length === 1 ? 'pending' : ''}`}
            >
              {p.games.map((g) => (
                <div
                  key={g.id}
                  className={`match-row ${selectedGameId === g.id ? 'active' : ''}`}
                  onClick={() => onSelectGame(g.id)}
                  data-testid="match-row"
                >
                  <div className="row-id">#{g.id}</div>
                  <div className="row-moves">{g.move_count || 0}</div>
                  <div className="row-status">
                    {g.winner_color === 0 ? (
                      <span className="live-dot" />
                    ) : (
                      <div className={getStatusClass(g)} />
                    )}
                  </div>
                  <div className="row-time">
                    {new Date(g.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </div>
                </div>
              ))}
              {p.games.length === 1 && (
                <div className="pending-row">
                  <Loader size={12} className="spin" /> Waiting for pair...
                </div>
              )}
            </div>
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="loading-sentinel">
              {isLoading && <Loader size={14} className="spin" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
