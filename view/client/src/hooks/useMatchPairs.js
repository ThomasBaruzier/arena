import { useReducer, useEffect, useCallback, useRef, useState } from 'react';

const sortGames = (games, sort) => {
  const asc = sort?.asc ?? false;
  return [...games].sort((a, b) => (asc ? a.id - b.id : b.id - a.id));
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
    } else if (col === 'duration') {
      const getMaxDur = (p) => Math.max(...p.games.map((g) => g.duration || 0));
      valA = getMaxDur(a);
      valB = getMaxDur(b);
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
    case 'APPEND': {
      const existingGroups = new Map(state.map((p) => [p.group_id, p]));
      newState = [...state];

      for (const newGroup of action.data) {
        if (existingGroups.has(newGroup.group_id)) {
          const existing = existingGroups.get(newGroup.group_id);
          const existingGameIds = new Set(existing.games.map((g) => g.id));
          const uniqueNewGames = newGroup.games.filter((g) => !existingGameIds.has(g.id));

          if (uniqueNewGames.length > 0) {
            const updatedGroup = {
              ...existing,
              games: sortGames([...existing.games, ...uniqueNewGames], action.sort)
            };
            const idx = newState.findIndex((p) => p.group_id === newGroup.group_id);
            if (idx !== -1) newState[idx] = updatedGroup;
          }
        } else {
          newState.push(newGroup);
        }
      }
      break;
    }
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
                games: sortGames([...p.games, g], action.sort),
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
                winner_color: e.winner_color ?? g.winner_color,
                duration: e.duration ?? g.duration
              }
            : g
        );
        const movesList = newGames.map((g) => g.move_count || 0);
        let heroWins = 0;
        if (action.heroId) {
          heroWins = newGames.reduce((acc, g) => {
            if (g.winner_color === 3 || g.winner_color === 4 || g.winner_color === 0) return acc;
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

export function useMatchPairs(group, subscribe, shouldLoad, initialOffset) {
  const [pairs, dispatch] = useReducer(pairsReducer, []);
  const [sort, setSort] = useState({ col: 'id', asc: false });
  const [hasMore, setHasMore] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [baseOffset, setBaseOffset] = useState(0);
  const abortRef = useRef(null);

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
      return fetch(`/api/games?${params}`, { signal: abortRef.current.signal })
        .then((r) => r.json())
        .then((data) => {
          dispatch(
            append
              ? { type: 'APPEND', data, sort: sortConfig }
              : { type: 'SET', data, sort: sortConfig }
          );
          setHasMore(data.length === 50);
          setLoaded(true);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            setLoaded(true);
            setHasMore(false);
          }
        });
    },
    [group.hero.id, group.villain.id, group.tournamentId]
  );

  useEffect(() => {
    let timer;
    if (!shouldLoad) {
      abortRef.current?.abort();
      timer = setTimeout(() => {
        dispatch({ type: 'CLEAR' });
        setHasMore(true);
        setLoaded(false);
        setBaseOffset(0);
      }, 500);
    } else if (!loaded) {
      const offset = initialOffset ? Math.floor(initialOffset / 50) * 50 : 0;
      setBaseOffset(offset);
      fetchGames(sort, offset);
    }
    return () => clearTimeout(timer);
  }, [shouldLoad, loaded, sort, fetchGames, initialOffset]);

  useEffect(() => {
    if (!shouldLoad || !loaded) return;
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
  }, [shouldLoad, loaded, group, subscribe, sort]);

  const handleSort = (col) => {
    const newSort = sort.col === col ? { col, asc: !sort.asc } : { col, asc: false };
    setSort(newSort);
    setBaseOffset(0);
    fetchGames(newSort);
  };

  const loadMore = useCallback(() => {
    if (!loaded || !hasMore) return;
    fetchGames(sort, baseOffset + pairs.length, true);
  }, [loaded, hasMore, pairs.length, sort, fetchGames, baseOffset]);

  return { pairs, loaded, hasMore, sort, handleSort, loadMore };
}
