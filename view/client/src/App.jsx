import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader, Menu, Swords, X } from 'lucide-react';
import Board from './components/Board';
import ControlDeck from './components/ControlDeck';
import MatchBar from './components/MatchBar';
import MatchGroup from './components/MatchGroup';
import { useData } from './hooks/useData';
import { useEventSource } from './hooks/useEventSource';
import { useGamePlayback } from './hooks/useGamePlayback';
import { useTournamentAccordion } from './hooks/useTournamentAccordion';
import { getRunId, matchupKey, parseMoves } from './utils';

const API_BASE = '/api';

const pathGameId = () => {
  const match = window.location.pathname.match(/^\/(\d+)\/?$/);

  if (!match) {
    return null;
  }

  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const gamePath = (id) => (id ? `/${id}` : '/');

export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const [game, setGame] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1000);
  const [initializing, setInitializing] = useState(true);
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
  const selectedRef = useRef(null);
  const gameRef = useRef(null);
  const playingRef = useRef(false);
  const generationRef = useRef(null);
  const sseGenerationRef = useRef(null);
  const awaitingRecoveryRef = useRef(false);
  const matchupSentinel = useRef(null);
  const menuButtonRef = useRef(null);

  const { subscribe, generation, connectionEpoch } = useEventSource(
    `${API_BASE}/events`
  );

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
  const {
    request: requestTournament,
    prepared: prepareTournament,
    transitionEnd: finishTournamentTransition,
    prune: pruneTournaments,
    reset: resetTournaments,
    phaseFor: tournamentPhase,
    tokenFor: tournamentToken
  } = useTournamentAccordion();

  const parsedMoves = useMemo(
    () => (game?.moves ? parseMoves(game.moves) : []),
    [game?.moves]
  );
  const playback = useGamePlayback(parsedMoves.length);
  const { isPlaying, setIsPlaying, setMoveIndex } = playback;
  const runsById = useMemo(
    () => new Map(runs.map((run) => [String(run.id), run])),
    [runs]
  );

  selectedRef.current = selectedId;
  loadRef.current.selectedId = selectedId;

  useEffect(() => {
    gameRef.current = game;
    playingRef.current = isPlaying;
  }, [game, isPlaying]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

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
      const sameGame = current && String(current.id) === String(data.id);
      const currentCount = sameGame ? parseMoves(current.moves).length : 0;

      if (sameGame) {
        const currentTerminal = current.winner_color && current.winner_color !== 0;
        const incomingLive = !data.winner_color || data.winner_color === 0;

        if (currentTerminal && incomingLive) {
          return;
        }

        if (incomingCount < currentCount) {
          return;
        }
      }

      gameRef.current = data;
      setGame(data);

      if (
        stopPlayback ||
        !sameGame ||
        (!playingRef.current && incomingCount > currentCount)
      ) {
        setMoveIndex(incomingCount);
      }

      if (stopPlayback) {
        playingRef.current = false;
        setIsPlaying(false);
      }
    },
    [setMoveIndex, setIsPlaying]
  );

  const clearGameSelection = useCallback(() => {
    loadRef.current.abort?.abort();
    loadRef.current.abort = null;
    loadRef.current.id += 1;
    loadRef.current.selectedId = null;

    selectedRef.current = null;
    gameRef.current = null;
    playingRef.current = false;

    setSelectedId(null);
    setGame(null);
    setIsPlaying(false);
    setMoveIndex(0);

    window.history.replaceState(null, '', '/');
  }, [setIsPlaying, setMoveIndex]);

  const resetViewer = useCallback(
    (nextGeneration = null) => {
      if (nextGeneration) {
        generationRef.current = nextGeneration;
        setHttpGeneration(nextGeneration);
      }

      awaitingRecoveryRef.current = true;
      clearGameSelection();
      resetTournaments();
    },
    [clearGameSelection, resetTournaments]
  );

  const selectGame = useCallback(
    (id, { closeControls = true } = {}) => {
      selectedRef.current = id;
      loadRef.current.selectedId = id;

      setSelectedId(id);
      window.history.replaceState(null, '', gamePath(id));

      if (closeControls && window.innerWidth <= 1000) {
        closeSidebar();
      }
    },
    [closeSidebar]
  );

  const fetchGame = useCallback(
    (id, options = {}) =>
      fetch(`${API_BASE}/game/${id}`, options).then((response) => {
        if (response.ok) {
          return response.json();
        }

        const error = new Error('game request failed');
        error.status = response.status;
        throw error;
      }),
    []
  );

  useEffect(() => {
    latestRef.current.abort?.abort();

    const controller = new AbortController();
    const requestId = ++latestRef.current.id;

    latestRef.current.abort = controller;

    fetch(`${API_BASE}/latest-game`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('latest game request failed');
        }

        const data = await response.json();

        if (
          !data ||
          (data.id !== null && (!Number.isSafeInteger(data.id) || data.id < 1))
        ) {
          throw new Error('invalid latest game response');
        }

        const responseGeneration =
          response.headers?.get?.('x-arena-generation') || null;
        const currentGeneration = sseGenerationRef.current;

        if (
          responseGeneration &&
          currentGeneration &&
          responseGeneration !== currentGeneration
        ) {
          throw new Error('stale latest game response');
        }

        if (requestId !== latestRef.current.id || controller.signal.aborted) {
          return;
        }

        if (responseGeneration) {
          setHttpGeneration(responseGeneration);
        }

        const id = pathGameId() ?? data.id;

        if (id) {
          selectGame(id, {
            closeControls: false
          });
        } else {
          window.history.replaceState(null, '', '/');
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
  }, [clearGameSelection, selectGame]);

  useEffect(() => {
    if (!viewerGeneration) {
      return;
    }

    const previous = generationRef.current;

    if (previous && previous !== viewerGeneration) {
      resetViewer(viewerGeneration);
      return;
    }

    generationRef.current = viewerGeneration;
  }, [viewerGeneration, resetViewer]);

  useEffect(() => {
    if (!selectedId) {
      return undefined;
    }

    loadRef.current.abort?.abort();

    const controller = new AbortController();
    const requestId = ++loadRef.current.id;

    loadRef.current.abort = controller;
    loadRef.current.selectedId = selectedId;

    fetchGame(selectedId, {
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
          error.status === 404 &&
          requestId === loadRef.current.id
        ) {
          clearGameSelection();
        }
      })
      .finally(() => {
        if (loadRef.current.abort === controller) {
          loadRef.current.abort = null;
        }
      });

    if (!initializing) {
      window.history.replaceState(null, '', gamePath(selectedId));
    }

    return () => controller.abort();
  }, [selectedId, initializing, fetchGame, applyLoadedGame, clearGameSelection]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'reset') {
          resetViewer(event.generation || null);
          return;
        }

        if (
          event.type === 'game_start' &&
          event.game &&
          awaitingRecoveryRef.current &&
          !selectedRef.current &&
          event.game.winner_color === 0
        ) {
          const recovered = event.game;
          const recoveredCount = parseMoves(recovered.moves).length;

          awaitingRecoveryRef.current = false;
          selectedRef.current = recovered.id;
          loadRef.current.selectedId = recovered.id;
          gameRef.current = recovered;
          playingRef.current = false;

          setSelectedId(recovered.id);
          setGame(recovered);
          setIsPlaying(false);
          setMoveIndex(recoveredCount);

          window.history.replaceState(null, '', gamePath(recovered.id));
        }

        const selected = selectedRef.current;

        if (!selected) {
          return;
        }

        const eventId = event.game?.id ?? event.id;

        if (String(eventId) !== String(selected)) {
          return;
        }

        if (event.type === 'game_start') {
          const next = {
            ...gameRef.current,
            ...event.game
          };

          gameRef.current = next;
          setGame(next);
          return;
        }

        if (event.type === 'game_move') {
          const current = gameRef.current;

          if (current?.winner_color && current.winner_color !== 0) {
            return;
          }

          const currentCount = parseMoves(current?.moves).length;
          const incomingCount = parseMoves(event.moves).length;

          if (incomingCount < currentCount) {
            return;
          }

          const next = {
            ...current,
            group_id: event.group_id ?? current?.group_id,
            run_id: event.run_id ?? current?.run_id,
            moves: event.moves,
            duration: event.duration ?? current?.duration
          };

          gameRef.current = next;
          setGame(next);

          if (!playingRef.current && incomingCount > currentCount) {
            setMoveIndex(incomingCount);
          }

          return;
        }

        if (event.type === 'game_result') {
          const current = gameRef.current;
          const currentCount = parseMoves(current?.moves).length;
          const next = {
            ...current,
            group_id: event.group_id ?? current?.group_id,
            run_id: event.run_id ?? current?.run_id,
            winner_color: event.winner_color,
            moves: event.moves ?? current?.moves ?? '',
            duration: event.duration ?? current?.duration
          };
          const nextCount = parseMoves(next.moves).length;

          gameRef.current = next;
          setGame(next);

          if (!playingRef.current && nextCount > currentCount) {
            setMoveIndex(nextCount);
          }
        }
      }),
    [subscribe, resetViewer, setIsPlaying, setMoveIndex]
  );

  useEffect(() => {
    pruneTournaments(new Set(matchups.map(matchupKey)));
  }, [matchups, pruneTournaments]);

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

    const selected = selectedRef.current;

    if (!selected) {
      return;
    }

    fetchGame(selected)
      .then((data) => {
        if (String(selected) === String(selectedRef.current)) {
          applyLoadedGame(data);
        }
      })
      .catch((error) => {
        if (error.status === 404) {
          clearGameSelection();
        }
      });
  }, [
    connectionEpoch,
    loadMoreMatchups,
    refreshRuns,
    fetchGame,
    applyLoadedGame,
    clearGameSelection
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
            const phase = tournamentPhase(key);
            const preparationToken = tournamentToken(key);

            return (
              <MatchGroup
                key={key}
                group={group}
                run={runsById.get(String(getRunId(group)))}
                selectedGameId={selectedId}
                onSelectGame={selectGame}
                subscribe={subscribe}
                phase={phase}
                preparationToken={preparationToken}
                onRequest={() => requestTournament(key)}
                onPrepared={() => prepareTournament(key, preparationToken)}
                onTransitionEnd={() => finishTournamentTransition(key)}
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
                motion={playback.motion}
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
