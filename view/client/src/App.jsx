import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Menu, Swords, X, Loader } from 'lucide-react';
import { useEventSource } from './hooks/useEventSource';
import { useMatchups, useRuns } from './hooks/useData';
import { useGamePlayback } from './hooks/useGamePlayback';
import { parseMoves, matchupKey, getRunId } from './utils';
import Board from './components/Board';
import ControlDeck from './components/ControlDeck';
import MatchGroup from './components/MatchGroup';
import MatchBar from './components/MatchBar';

const API_BASE = '/api';

export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const [game, setGame] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1000);
  const [initializing, setInitializing] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [pending, setPending] = useState(null);
  const loadRef = useRef({ id: 0, abort: null });
  const prevConnectedRef = useRef(false);

  const { subscribe, isConnected } = useEventSource(`${API_BASE}/events`);
  const {
    matchups,
    loading: matchupsLoading,
    hasMore: matchupsHasMore,
    loadMore
  } = useMatchups(subscribe);
  const { runs, loading: runsLoading } = useRuns(subscribe);

  const movesStr = game?.moves;
  const parsedMoves = useMemo(() => (movesStr ? parseMoves(movesStr) : []), [movesStr]);
  const playback = useGamePlayback(parsedMoves.length);
  const { setMoveIndex, setIsPlaying, moveIndex, isPlaying } = playback;
  const gameRef = useRef(null);
  const isPlayingRef = useRef(false);
  loadRef.current.selectedId = selectedId;
  const runsById = useMemo(() => new Map(runs.map((r) => [String(r.id), r])), [runs]);

  useEffect(() => {
    gameRef.current = game;
    isPlayingRef.current = isPlaying;
  }, [game, isPlaying]);

  const applyLoadedGame = useCallback(
    (data, { stopPlayback = false } = {}) => {
      const incomingMoves = parseMoves(data.moves).length;
      const current = gameRef.current;
      const currentMoves = parseMoves(current?.moves).length;
      if (current && String(current.id) === String(data.id)) {
        const currentTerminal = current.winner_color && current.winner_color !== 0;
        const incomingLive = !data.winner_color || data.winner_color === 0;
        if (currentTerminal && incomingLive) return;
        if (incomingMoves < currentMoves) return;
      }
      setGame(data);
      gameRef.current = data;
      setMoveIndex(incomingMoves);
      if (stopPlayback) {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    },
    [setMoveIndex, setIsPlaying]
  );

  const fetchGame = useCallback((id, options = {}) =>
    fetch(`${API_BASE}/game/${id}`, options).then((r) => (r.ok ? r.json() : Promise.reject())), []);

  useEffect(() => {
    const urlId = parseInt(window.location.pathname.slice(1));
    if (!isNaN(urlId) && urlId > 0) {
      setSelectedId(urlId);
      setInitializing(false);
    } else {
      fetch(`${API_BASE}/latest-game`)
        .then((r) => r.json())
        .then(({ id }) => {
          if (id) {
            setSelectedId(id);
            history.replaceState(null, '', `/${id}`);
          }
        })
        .finally(() => setInitializing(false));
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadRef.current.abort?.abort();
    const controller = new AbortController();
    loadRef.current.abort = controller;
    const reqId = ++loadRef.current.id;

    loadRef.current.selectedId = selectedId;
    fetchGame(selectedId, { signal: controller.signal })
      .then((data) => {
        if (reqId === loadRef.current.id && String(selectedId) === String(loadRef.current.selectedId)) applyLoadedGame(data, { stopPlayback: true });
      })
      .catch(() => {});

    if (!initializing) {
      history.replaceState(null, '', `/${selectedId}`);
      if (window.innerWidth < 800) setSidebarOpen(false);
    }
    return () => controller.abort();
  }, [selectedId, initializing, applyLoadedGame]);

  useEffect(() => {
    if (!selectedId) return;
    return subscribe((e) => {
      const eventId = e.game?.id ?? e.id;
      if (eventId !== selectedId) return;
      switch (e.type) {
        case 'game_start':
          setGame((g) => {
            const next = { ...g, ...e.game };
            gameRef.current = next;
            return next;
          });
          break;
        case 'game_move':
          setGame((g) => {
            if (g?.winner_color && g.winner_color !== 0) return g;
            const currentMoves = parseMoves(g?.moves).length;
            const incomingMoves = parseMoves(e.moves).length;
            if (incomingMoves < currentMoves) return g;
            const next = {
              ...g,
              group_id: e.group_id ?? g?.group_id,
              run_id: e.run_id ?? g?.run_id,
              moves: e.moves,
              duration: e.duration ?? g?.duration
            };
            gameRef.current = next;
            return next;
          });
          break;
        case 'game_result': {
          const resultMoves = e.moves ?? gameRef.current?.moves ?? '';
          setGame((g) => {
            const next = {
              ...g,
              group_id: e.group_id ?? g?.group_id,
              run_id: e.run_id ?? g?.run_id,
              winner_color: e.winner_color,
              moves: e.moves ?? g?.moves ?? '',
              duration: e.duration ?? g?.duration
            };
            gameRef.current = next;
            return next;
          });
          if (!isPlayingRef.current) setMoveIndex(parseMoves(resultMoves).length);
          break;
        }
      }
    });
  }, [selectedId, subscribe]);

  useEffect(() => {
    if (game?.winner_color === 0 && !isPlaying && moveIndex < parsedMoves.length) {
      setMoveIndex(parsedMoves.length);
    }
  }, [game, isPlaying, parsedMoves.length, moveIndex, setMoveIndex]);

  useEffect(() => {
    const keys = new Set(matchups.map(matchupKey));
    setExpanded((key) => (key && keys.has(key) ? key : null));
    setPending((key) => (key && keys.has(key) ? key : null));
  }, [matchups]);

  const matchupsSentinelRef = useRef(null);
  useEffect(() => {
    if (!matchupsSentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !matchupsLoading && matchupsHasMore) loadMore();
      },
      { rootMargin: '100px' }
    );
    obs.observe(matchupsSentinelRef.current);
    return () => obs.disconnect();
  }, [matchupsLoading, matchupsHasMore, loadMore]);

  useEffect(() => {
    if (prevConnectedRef.current === false && isConnected === true) {
      if (selectedId) {
        const refreshId = selectedId;
        fetchGame(refreshId)
          .then((data) => {
            if (String(refreshId) === String(loadRef.current.selectedId)) applyLoadedGame(data);
          })
          .catch(() => {});
      }
      loadMore(true);
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, selectedId, loadMore, applyLoadedGame]);

  if (initializing)
    return (
      <div className="app">
        <div className="loading-screen">
          <Loader size={32} className="spin" />
          <span>Loading...</span>
        </div>
      </div>
    );


  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Swords size={20} className="accent" />
            <span>ARENA</span>
          </div>
          <button className="close-sidebar" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="sidebar-content">
          {runsLoading && runs.length === 0 && (
            <div className="loading-sentinel">
              <Loader size={14} className="spin" />
            </div>
          )}
          {matchups.map((g) => {
            const key = matchupKey(g);
            const isOpen = expanded === key || pending === key;
            return (
              <MatchGroup
                key={key}
                group={g}
                run={runsById.get(String(getRunId(g)))}
                selectedGameId={selectedId}
                onSelectGame={setSelectedId}
                subscribe={subscribe}
                open={isOpen}
                onToggle={() => {
                  if (expanded === key) {
                    setExpanded(null);
                    setPending(null);
                  } else if (!expanded) setExpanded(key);
                  else setPending(key);
                }}
                onLoaded={() => {
                  if (pending === key) {
                    setExpanded(key);
                    setPending(null);
                  }
                }}
              />
            );
          })}
          {matchupsHasMore && (
            <div ref={matchupsSentinelRef} className="loading-sentinel">
              {matchupsLoading && <Loader size={16} className="spin" />}
            </div>
          )}
          {!matchupsHasMore && !matchups.length && (
            <div className="empty-msg">Waiting for matches...</div>
          )}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu size={20} />
          </button>
          <MatchBar game={game} />
        </header>
        <div className="stage">
          {game ? (
            <>
              <Board
                parsedMoves={parsedMoves}
                moveIndex={playback.moveIndex}
                winnerColor={game.winner_color}
                isPlaying={playback.isPlaying}
                boardSize={game.board_size}
              />
              <ControlDeck {...playback} totalMoves={parsedMoves.length} />
            </>
          ) : (
            <div className="empty-stage">
              <Swords size={96} opacity={0.2} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
