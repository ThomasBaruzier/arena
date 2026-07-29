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

const gamePath = (id, generation) =>
  generation ? `/${id}?g=${encodeURIComponent(generation)}` : `/${id}`;

const pathGameId = () => {
  const match = window.location.pathname.match(/^\/(\d+)\/?$/);

  if (!match) return null;

  const id = Number(match[1]);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const [game, setGame] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1000);
  const [initializing, setInitializing] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [httpGeneration, setHttpGeneration] = useState(null);

  const loadRef = useRef({
    id: 0,
    abort: null,
    selectedId: null
  });
  const latestRef = useRef({
    id: 0,
    abort: null
  });
  const generationRef = useRef(null);
  const sseGenerationRef = useRef(null);
  const gameRef = useRef(null);
  const playingRef = useRef(false);
  const matchupSentinel = useRef(null);
  const menuButtonRef = useRef(null);

  const { subscribe, generation, connectionEpoch } = useEventSource(`${API_BASE}/events`);

  sseGenerationRef.current = generation;

  const viewerGeneration = generation ?? httpGeneration;

  const {
    matchups,
    matchupsLoading,
    matchupsHasMore,
    loadMoreMatchups,
    runs,
    runsLoading,
    refreshRuns
  } = useData(subscribe);

  const parsedMoves = useMemo(() => (game?.moves ? parseMoves(game.moves) : []), [game?.moves]);

  const playback = useGamePlayback(parsedMoves.length);

  const { isPlaying, moveIndex, setIsPlaying, setMoveIndex } = playback;

  const runsById = useMemo(() => new Map(runs.map((run) => [String(run.id), run])), [runs]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);

    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

  const clearGameSelection = useCallback(
    (expectedId = null) => {
      if (expectedId != null && String(loadRef.current.selectedId) !== String(expectedId)) {
        return;
      }

      loadRef.current.abort?.abort();
      loadRef.current.abort = null;
      loadRef.current.id += 1;
      loadRef.current.selectedId = null;
      gameRef.current = null;
      playingRef.current = false;

      setSelectedId(null);
      setGame(null);
      setIsPlaying(false);
      setMoveIndex(0);

      window.history.replaceState(null, '', '/');
    },
    [setIsPlaying, setMoveIndex]
  );

  loadRef.current.selectedId = selectedId;

  useEffect(() => {
    gameRef.current = game;
    playingRef.current = isPlaying;
  }, [game, isPlaying]);

  useEffect(() => {
    if (!sidebarOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      closeSidebar();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen, closeSidebar]);

  const applyLoadedGame = useCallback(
    (data, { stopPlayback = false } = {}) => {
      const incomingCount = parseMoves(data.moves).length;
      const current = gameRef.current;
      const currentCount = parseMoves(current?.moves).length;

      if (current && String(current.id) === String(data.id)) {
        const currentTerminal = current.winner_color && current.winner_color !== 0;
        const incomingLive = !data.winner_color || data.winner_color === 0;

        if (currentTerminal && incomingLive) {
          return;
        }

        if (incomingCount < currentCount) {
          return;
        }
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

  const fetchGame = useCallback((id, expectedGeneration, options = {}) => {
    const suffix = expectedGeneration ? `?g=${encodeURIComponent(expectedGeneration)}` : '';

    return fetch(`${API_BASE}/game/${id}${suffix}`, options).then((response) => {
      if (response.ok) {
        return response.json();
      }

      const error = new Error('game request failed');

      error.status = response.status;

      throw error;
    });
  }, []);

  useEffect(() => {
    if (!initializing) {
      return undefined;
    }

    latestRef.current.abort?.abort();

    const controller = new AbortController();
    const requestId = ++latestRef.current.id;
    const expectedGeneration = generation;

    latestRef.current.abort = controller;

    fetch(`${API_BASE}/latest-game`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('latest game request failed');
        }

        const data = await response.json();

        if (!data || (data.id !== null && (!Number.isSafeInteger(data.id) || data.id < 1))) {
          throw new Error('invalid latest game response');
        }

        const responseGeneration = response.headers?.get?.('x-arena-generation') || null;
        const currentSseGeneration = sseGenerationRef.current;

        if (expectedGeneration && responseGeneration && expectedGeneration !== responseGeneration) {
          throw new Error('stale latest game response');
        }

        if (
          currentSseGeneration &&
          responseGeneration &&
          currentSseGeneration !== responseGeneration
        ) {
          throw new Error('stale latest game response');
        }

        if (requestId !== latestRef.current.id || controller.signal.aborted) {
          return;
        }

        const acceptedGeneration =
          responseGeneration || currentSseGeneration || expectedGeneration || null;

        if (responseGeneration) {
          setHttpGeneration(responseGeneration);
        }

        const requestedId = pathGameId();
        const requestedGeneration = new URLSearchParams(window.location.search).get('g');

        if (requestedId) {
          if (
            requestedGeneration &&
            acceptedGeneration &&
            requestedGeneration !== acceptedGeneration
          ) {
            clearGameSelection();
            return;
          }

          setSelectedId(requestedId);

          window.history.replaceState(null, '', gamePath(requestedId, acceptedGeneration));

          return;
        }

        if (data.id) {
          setSelectedId(data.id);

          window.history.replaceState(null, '', gamePath(data.id, acceptedGeneration));
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError' && requestId === latestRef.current.id) {
          clearGameSelection();
        }
      })
      .finally(() => {
        if (requestId === latestRef.current.id && !controller.signal.aborted) {
          latestRef.current.abort = null;
          setInitializing(false);
        }
      });

    return () => controller.abort();
  }, [generation, initializing, clearGameSelection]);

  useEffect(() => {
    if (!viewerGeneration) {
      return;
    }

    const previous = generationRef.current;

    generationRef.current = viewerGeneration;

    if (previous && previous !== viewerGeneration) {
      clearGameSelection();
      setExpanded(null);
    }
  }, [viewerGeneration, clearGameSelection]);

  useEffect(() => {
    if (!selectedId) {
      return undefined;
    }

    loadRef.current.abort?.abort();

    const controller = new AbortController();
    const requestId = ++loadRef.current.id;

    loadRef.current.abort = controller;
    loadRef.current.selectedId = selectedId;

    fetchGame(selectedId, viewerGeneration, {
      signal: controller.signal
    })
      .then((data) => {
        if (
          requestId === loadRef.current.id &&
          String(selectedId) === String(loadRef.current.selectedId)
        ) {
          applyLoadedGame(data, {
            stopPlayback: true
          });
        }
      })
      .catch((error) => {
        if (
          error.name !== 'AbortError' &&
          (error.status === 404 || error.status === 409) &&
          requestId === loadRef.current.id
        ) {
          clearGameSelection(selectedId);
        }
      });

    if (!initializing) {
      window.history.replaceState(null, '', gamePath(selectedId, viewerGeneration));
    }

    return () => controller.abort();
  }, [selectedId, viewerGeneration, initializing, fetchGame, applyLoadedGame, clearGameSelection]);

  useEffect(() => {
    if (!selectedId) {
      return undefined;
    }

    return subscribe((event) => {
      if (event.type === 'reset') {
        clearGameSelection(selectedId);
        setExpanded(null);
        return;
      }

      const eventId = event.game?.id ?? event.id;

      if (String(eventId) !== String(selectedId)) {
        return;
      }

      if (event.type === 'game_start') {
        setGame((current) => {
          const next = {
            ...current,
            ...event.game
          };

          gameRef.current = next;
          return next;
        });

        return;
      }

      if (event.type === 'game_move') {
        setGame((current) => {
          if (current?.winner_color && current.winner_color !== 0) {
            return current;
          }

          const currentCount = parseMoves(current?.moves).length;
          const incomingCount = parseMoves(event.moves).length;

          if (incomingCount < currentCount) {
            return current;
          }

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

        if (!playingRef.current) {
          setMoveIndex(parseMoves(resultMoves).length);
        }
      }
    });
  }, [selectedId, subscribe, setMoveIndex, clearGameSelection]);

  useEffect(() => {
    if (game?.winner_color === 0 && !isPlaying && moveIndex < parsedMoves.length) {
      setMoveIndex(parsedMoves.length);
    }
  }, [game, isPlaying, moveIndex, parsedMoves.length, setMoveIndex]);

  useEffect(() => {
    const keys = new Set(matchups.map(matchupKey));

    setExpanded((key) => (key && keys.has(key) ? key : null));
  }, [matchups]);

  useEffect(() => {
    if (!matchupSentinel.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !matchupsLoading && matchupsHasMore) {
          loadMoreMatchups();
        }
      },
      {
        rootMargin: '100px'
      }
    );

    observer.observe(matchupSentinel.current);

    return () => observer.disconnect();
  }, [matchupsLoading, matchupsHasMore, loadMoreMatchups]);

  useEffect(() => {
    if (connectionEpoch === 0) {
      return;
    }

    loadMoreMatchups(true);
    refreshRuns().catch(() => {});

    if (!selectedId) return;

    const refreshId = selectedId;
    const refreshGeneration = viewerGeneration;

    fetchGame(refreshId, refreshGeneration)
      .then((data) => {
        if (
          String(refreshId) === String(loadRef.current.selectedId) &&
          refreshGeneration === generationRef.current
        ) {
          applyLoadedGame(data);
        }
      })
      .catch((error) => {
        if (error.status === 404 || error.status === 409) {
          clearGameSelection(refreshId);
        }
      });
  }, [
    connectionEpoch,
    viewerGeneration,
    selectedId,
    fetchGame,
    applyLoadedGame,
    clearGameSelection,
    loadMoreMatchups,
    refreshRuns
  ]);

  const selectGame = useCallback(
    (id) => {
      setSelectedId(id);

      if (window.innerWidth <= 1000) {
        closeSidebar();
      }
    },
    [closeSidebar]
  );

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
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Dismiss tournaments"
          onClick={closeSidebar}
        />
      )}

      <aside
        id="tournament-sidebar"
        className={`sidebar ${sidebarOpen ? 'open' : ''}`}
        aria-label="Tournaments"
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        <div className="sidebar-header">
          <div className="logo">
            <Swords size={20} className="accent" />
            <span>ARENA</span>
          </div>

          <button
            type="button"
            className="close-sidebar"
            aria-label="Close tournaments"
            onClick={closeSidebar}
          >
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

            return (
              <MatchGroup
                key={`${key}:${viewerGeneration ?? 'unknown'}:${connectionEpoch}`}
                group={group}
                run={runsById.get(String(getRunId(group)))}
                selectedGameId={selectedId}
                onSelectGame={selectGame}
                subscribe={subscribe}
                open={expanded === key}
                onToggle={() => setExpanded((current) => (current === key ? null : key))}
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
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-toggle"
            aria-label="Toggle tournaments"
            aria-controls="tournament-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => {
              if (sidebarOpen) {
                closeSidebar();
              } else {
                setSidebarOpen(true);
              }
            }}
          >
            <Menu size={20} />
          </button>

          <MatchBar game={game} />
        </header>

        <div className="stage">
          {game ? (
            <>
              <Board
                gameId={game.id}
                parsedMoves={parsedMoves}
                moveIndex={playback.moveIndex}
                winnerColor={game.winner_color}
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
