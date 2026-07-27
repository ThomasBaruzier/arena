import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader, Menu, Swords, X } from 'lucide-react';
import Board from './components/Board';
import ControlDeck from './components/ControlDeck';
import MatchBar from './components/MatchBar';
import MatchGroup from './components/MatchGroup';
import { useData } from './hooks/useData';
import { useEventSource } from './hooks/useEventSource';
import { useGamePlayback } from './hooks/useGamePlayback';
import { getRunId, matchupKey, parseMoves } from './utils';

const API_BASE = '/api';

export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const [game, setGame] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1000);
  const [initializing, setInitializing] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [pending, setPending] = useState(null);

  const loadRef = useRef({ id: 0, abort: null, selectedId: null });
  const previousConnection = useRef(false);
  const gameRef = useRef(null);
  const playingRef = useRef(false);
  const matchupSentinel = useRef(null);

  const { subscribe, isConnected } = useEventSource(`${API_BASE}/events`);
  const {
    matchups,
    matchupsLoading,
    matchupsHasMore,
    loadMoreMatchups,
    runs,
    runsLoading,
    refreshRuns
  } = useData(subscribe);

  const movesText = game?.moves;
  const parsedMoves = useMemo(() => (movesText ? parseMoves(movesText) : []), [movesText]);
  const playback = useGamePlayback(parsedMoves.length);
  const { isPlaying, moveIndex, setIsPlaying, setMoveIndex } = playback;

  const runsById = useMemo(
    () => new Map(runs.map((run) => [String(run.id), run])),
    [runs]
  );

  loadRef.current.selectedId = selectedId;

  useEffect(() => {
    gameRef.current = game;
    playingRef.current = isPlaying;
  }, [game, isPlaying]);

  const applyLoadedGame = useCallback(
    (data, { stopPlayback = false } = {}) => {
      const incomingCount = parseMoves(data.moves).length;
      const current = gameRef.current;
      const currentCount = parseMoves(current?.moves).length;

      if (current && String(current.id) === String(data.id)) {
        const currentTerminal = current.winner_color && current.winner_color !== 0;
        const incomingLive = !data.winner_color || data.winner_color === 0;

        if (currentTerminal && incomingLive) return;
        if (incomingCount < currentCount) return;
      }

      setGame(data);
      gameRef.current = data;
      setMoveIndex(incomingCount);

      if (stopPlayback) {
        setIsPlaying(false);
        playingRef.current = false;
      }
    },
    [setMoveIndex, setIsPlaying]
  );

  const fetchGame = useCallback(
    (id, options = {}) =>
      fetch(`${API_BASE}/game/${id}`, options).then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('game request failed'))
      ),
    []
  );

  useEffect(() => {
    const pathId = Number.parseInt(window.location.pathname.slice(1), 10);

    if (Number.isInteger(pathId) && pathId > 0) {
      setSelectedId(pathId);
      setInitializing(false);
      return;
    }

    fetch(`${API_BASE}/latest-game`)
      .then((response) => response.json())
      .then(({ id }) => {
        if (!id) return;
        setSelectedId(id);
        history.replaceState(null, '', `/${id}`);
      })
      .finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;

    loadRef.current.abort?.abort();
    const controller = new AbortController();
    const requestId = ++loadRef.current.id;

    loadRef.current.abort = controller;
    loadRef.current.selectedId = selectedId;

    fetchGame(selectedId, { signal: controller.signal })
      .then((data) => {
        if (
          requestId === loadRef.current.id &&
          String(selectedId) === String(loadRef.current.selectedId)
        ) {
          applyLoadedGame(data, { stopPlayback: true });
        }
      })
      .catch(() => {});

    if (!initializing) {
      history.replaceState(null, '', `/${selectedId}`);
      if (window.innerWidth < 800) setSidebarOpen(false);
    }

    return () => controller.abort();
  }, [selectedId, initializing, fetchGame, applyLoadedGame]);

  useEffect(() => {
    if (!selectedId) return undefined;

    return subscribe((event) => {
      const eventId = event.game?.id ?? event.id;
      if (String(eventId) !== String(selectedId)) return;

      if (event.type === 'game_start') {
        setGame((current) => {
          const next = { ...current, ...event.game };
          gameRef.current = next;
          return next;
        });
        return;
      }

      if (event.type === 'game_move') {
        setGame((current) => {
          if (current?.winner_color && current.winner_color !== 0) return current;

          const currentCount = parseMoves(current?.moves).length;
          const incomingCount = parseMoves(event.moves).length;
          if (incomingCount < currentCount) return current;

          const next = {
            ...current,
            group_id: event.group_id ?? current?.group_id,
            run_id: event.run_id ?? current?.run_id,
            moves: event.moves,
            duration: event.duration ?? current?.duration
          };

          gameRef.current = next;
          return next;
        });
        return;
      }

      if (event.type === 'game_result') {
        const resultMoves = event.moves ?? gameRef.current?.moves ?? '';

        setGame((current) => {
          const next = {
            ...current,
            group_id: event.group_id ?? current?.group_id,
            run_id: event.run_id ?? current?.run_id,
            winner_color: event.winner_color,
            moves: event.moves ?? current?.moves ?? '',
            duration: event.duration ?? current?.duration
          };

          gameRef.current = next;
          return next;
        });

        if (!playingRef.current) setMoveIndex(parseMoves(resultMoves).length);
      }
    });
  }, [selectedId, subscribe, setMoveIndex]);

  useEffect(() => {
    if (game?.winner_color === 0 && !isPlaying && moveIndex < parsedMoves.length) {
      setMoveIndex(parsedMoves.length);
    }
  }, [game, isPlaying, moveIndex, parsedMoves.length, setMoveIndex]);

  useEffect(() => {
    const keys = new Set(matchups.map(matchupKey));
    setExpanded((key) => (key && keys.has(key) ? key : null));
    setPending((key) => (key && keys.has(key) ? key : null));
  }, [matchups]);

  useEffect(() => {
    if (!matchupSentinel.current) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !matchupsLoading && matchupsHasMore) {
          loadMoreMatchups();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(matchupSentinel.current);
    return () => observer.disconnect();
  }, [matchupsLoading, matchupsHasMore, loadMoreMatchups]);

  useEffect(() => {
    if (!previousConnection.current && isConnected) {
      if (selectedId) {
        const refreshId = selectedId;

        fetchGame(refreshId)
          .then((data) => {
            if (String(refreshId) === String(loadRef.current.selectedId)) {
              applyLoadedGame(data);
            }
          })
          .catch(() => {});
      }

      loadMoreMatchups(true);
      refreshRuns();
    }

    previousConnection.current = isConnected;
  }, [
    isConnected,
    selectedId,
    fetchGame,
    applyLoadedGame,
    loadMoreMatchups,
    refreshRuns
  ]);

  if (initializing) {
    return (
      <div className="app">
        <div className="loading-screen">
          <Loader size={32} className="spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

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
          {matchups.map((group) => {
            const key = matchupKey(group);
            const open = expanded === key || pending === key;

            return (
              <MatchGroup
                key={key}
                group={group}
                run={runsById.get(String(getRunId(group)))}
                selectedGameId={selectedId}
                onSelectGame={setSelectedId}
                subscribe={subscribe}
                open={open}
                onToggle={() => {
                  if (expanded === key) {
                    setExpanded(null);
                    setPending(null);
                  } else if (!expanded) {
                    setExpanded(key);
                  } else {
                    setPending(key);
                  }
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
            <div ref={matchupSentinel} className="loading-sentinel">
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
