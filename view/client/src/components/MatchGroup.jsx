import { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Loader } from 'lucide-react';

const API_BASE = '/api';

const formatFloat = (val) => {
  if (val === undefined || val === null) return '0.00';
  if (val >= 100) return val.toFixed(0);
  if (val >= 10) return val.toFixed(1);
  return val.toFixed(2);
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

const pairsReducer = (state, action) => {
  let newState;
  switch (action.type) {
    case 'SET':
      newState = action.data;
      break;
    case 'APPEND':
      newState = [...state, ...action.data];
      break;
    case 'CLEAR':
      return [];
    case 'game_start': {
      const g = action.game;
      const existing = state.find((p) => p.group_id === g.group_id);
      if (existing) {
        if (existing.games.some((x) => x.id === g.id)) return state;
        newState = state.map((p) =>
          p.group_id === g.group_id
            ? {
                ...p,
                games: [...p.games, g].sort((a, b) => a.id - b.id),
                max_id: Math.max(p.max_id, g.id),
                latest_ts: g.timestamp,
                live_count:
                  p.games.filter((x) => x.winner_color === 0).length +
                  (g.winner_color === 0 ? 1 : 0)
              }
            : p
        );
      } else {
        newState = [
          {
            group_id: g.group_id,
            max_moves: 0,
            min_moves: 0,
            live_count: 1,
            hero_wins: 0,
            latest_ts: g.timestamp,
            max_id: g.id,
            games: [g]
          },
          ...state
        ];
      }
      break;
    }
    case 'game_update': {
      const e = action.event;
      newState = state.map((p) => {
        if (p.group_id !== e.group_id) return p;
        const newGames = p.games.map((g) =>
          g.id === e.id
            ? {
                ...g,
                move_count: e.move_count ?? g.move_count,
                winner_color: e.winner_color ?? g.winner_color
              }
            : g
        );
        const movesList = newGames.map((g) => g.move_count || 0);
        let heroWins = 0;
        if (action.heroId) {
          heroWins = newGames.reduce((acc, g) => {
            if (g.winner_color === 3 || g.winner_color === 0) return acc;
            const isHeroBlack = g.black_id === action.heroId;
            const isHeroWin =
              (g.winner_color === 1 && isHeroBlack) || (g.winner_color === 2 && !isHeroBlack);
            return acc + (isHeroWin ? 1 : 0);
          }, 0);
        } else heroWins = p.hero_wins;
        return {
          ...p,
          games: newGames,
          max_moves: Math.max(...movesList),
          min_moves: Math.min(...movesList),
          live_count: newGames.filter((g) => g.winner_color === 0).length,
          hero_wins: heroWins
        };
      });
      break;
    }
    default:
      return state;
  }
  if (action.sort && newState) return sortPairs(newState, action.sort);
  return newState;
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

  const progress = run && run.total_games > 0 ? (run.games_played / run.total_games) * 100 : 0;
  const isFinished = run && run.games_played >= run.total_games;

  const fetchGames = useCallback(
    (sortConfig, offset = 0, append = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const params = new URLSearchParams({
        hero_id: group.hero.id,
        villain_id: group.villain.id,
        tournament_id: group.tournamentId,
        sort: sortConfig.col,
        order: sortConfig.asc ? 'asc' : 'desc',
        limit: 50,
        offset
      });
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
    },
    [group.hero.id, group.villain.id, group.tournamentId, onLoaded]
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
      const tid = e.game?.tournament_id || e.tournament_id || 'legacy';
      if (tid !== group.tournamentId) return;
      const isMatch = (bId, wId) =>
        (bId === group.hero.id && wId === group.villain.id) ||
        (bId === group.villain.id && wId === group.hero.id);
      if (e.type === 'game_start' && e.game && isMatch(e.game.black_id, e.game.white_id)) {
        dispatch({ type: 'game_start', game: e.game, sort, heroId: group.hero.id });
      }
      if ((e.type === 'game_move' || e.type === 'game_result') && e.group_id) {
        dispatch({ type: 'game_update', event: e, sort, heroId: group.hero.id });
      }
    });
  }, [open, loaded, group.hero.id, group.villain.id, group.tournamentId, subscribe, sort]);

  const getStatusClass = (g) => {
    if (g.winner_color === 0) return 'live-dot';
    if (g.winner_color === 3) return 'res-dot draw';
    if (group.hero.id === group.villain.id) {
      const heroColor = g.external_id?.endsWith('_0') ? 1 : 2;
      return g.winner_color === heroColor ? 'res-dot res-win' : 'res-dot res-loss';
    }
    const isHeroWin = (g.winner_color === 1) === (g.black_id === group.hero.id);
    return isHeroWin ? 'res-dot res-win' : 'res-dot res-loss';
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
                  <span className="badge load">Load: {formatFloat(run.arena_load)}%</span>
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
                  <span>DQI</span>
                  <span>CMA</span>
                  <span>Bln</span>
                  <span>Eff</span>
                  {hasCrashes && <span>💥</span>}
                </div>
                <div className={`stats-row p1 ${hasCrashes ? 'has-crash' : ''}`}>
                  <span className="player-label">P1</span>
                  <span>{formatFloat(run.p1_elo)}</span>
                  <span>{formatFloat(run.p1_dqi)}</span>
                  <span>{formatFloat(run.p1_cma)}%</span>
                  <span>{formatFloat(run.p1_blunder)}%</span>
                  <span>{formatFloat(run.p1_efficiency)}%</span>
                  {hasCrashes && <span className="crash">{run.p1_crashes}</span>}
                </div>
                <div className={`stats-row p2 ${hasCrashes ? 'has-crash' : ''}`}>
                  <span className="player-label">P2</span>
                  <span>{formatFloat(run.p2_elo)}</span>
                  <span>{formatFloat(run.p2_dqi)}</span>
                  <span>{formatFloat(run.p2_cma)}%</span>
                  <span>{formatFloat(run.p2_blunder)}%</span>
                  <span>{formatFloat(run.p2_efficiency)}%</span>
                  {hasCrashes && <span className="crash">{run.p2_crashes}</span>}
                </div>
              </div>
            );
          })()}
      </div>
      <div className={`group-list ${animState}`}>
        <div className="group-list-inner">
          <div className="match-header-row">
            {[
              ['id', 'ID'],
              ['moves', 'Mvs'],
              ['status', 'Res'],
              ['time', 'Time']
            ].map(([col, label]) => (
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
