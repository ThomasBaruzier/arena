import { useState, useEffect, useRef, useMemo } from 'react';
import { Menu, Swords, X, Loader } from 'lucide-react';
import { useEventSource } from './hooks/useEventSource';
import { useMatchups, useRuns } from './hooks/useData';
import { useGamePlayback } from './hooks/useGamePlayback';
import { parseMoves, matchupKey } from './utils';
import Board from './components/Board';
import ControlDeck from './components/ControlDeck';
import MatchGroup from './components/MatchGroup';

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

    fetch(`${API_BASE}/game/${selectedId}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (reqId === loadRef.current.id) {
          setGame(data);
          setMoveIndex(parseMoves(data.moves).length);
          setIsPlaying(false);
        }
      })
      .catch(() => {});

    if (!initializing) {
      history.replaceState(null, '', `/${selectedId}`);
      if (window.innerWidth < 800) setSidebarOpen(false);
    }
    return () => controller.abort();
  }, [selectedId, initializing, setMoveIndex, setIsPlaying]);

  useEffect(() => {
    if (!selectedId) return;
    return subscribe((e) => {
      if (e.id !== selectedId) return;
      if (e.type === 'game_move') setGame((g) => ({ ...g, moves: e.moves }));
      if (e.type === 'game_result')
        setGame((g) => ({ ...g, winner_color: e.winner_color, moves: e.moves || g.moves }));
    });
  }, [selectedId, subscribe]);

  useEffect(() => {
    if (game?.winner_color === 0 && !isPlaying && moveIndex < parsedMoves.length) {
      setMoveIndex(parsedMoves.length);
    }
  }, [game, isPlaying, parsedMoves.length, moveIndex, setMoveIndex]);

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
      if (selectedId)
        fetch(`${API_BASE}/game/${selectedId}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((data) => {
            setGame(data);
            setMoveIndex(parseMoves(data.moves).length);
          })
          .catch(() => {});
      loadMore(true);
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, selectedId, loadMore, setMoveIndex]);

  if (initializing)
    return (
      <div className="app">
        <div className="loading-screen">
          <Loader size={32} className="spin" />
          <span>Loading...</span>
        </div>
      </div>
    );

  const renderMatchBar = () => {
    if (!game) return <div className="placeholder-text">Select a match</div>;
    const isBlackP1 = game.black_is_p1 ?? true;
    return (
      <div className="match-bar">
        <div className="player-left">
          <span className="p-ver">{isBlackP1 ? game.black_ver : game.white_ver}</span>
          <span className={`p-name ${game.winner_color === 1 ? 'gold' : ''}`}>
            {isBlackP1 ? game.black_name : game.white_name}
          </span>
          <div className={`p-color ${isBlackP1 ? 'black' : 'white'}`} />
        </div>
        <div className="score-center">
          {game.winner_color === 0 ? (
            <span className="live-tag">LIVE</span>
          ) : game.winner_color === 3 ? (
            <span className="final-score">½ - ½</span>
          ) : (
            <span className="final-score">
              {game.winner_color === 1 ? 1 : 0} - {game.winner_color === 2 ? 1 : 0}
            </span>
          )}
        </div>
        <div className="player-right">
          <div className={`p-color ${isBlackP1 ? 'white' : 'black'}`} />
          <span className={`p-name ${game.winner_color === 2 ? 'gold' : ''}`}>
            {isBlackP1 ? game.white_name : game.black_name}
          </span>
          <span className="p-ver">{isBlackP1 ? game.white_ver : game.black_ver}</span>
        </div>
      </div>
    );
  };

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
                run={runs.find((r) => r.id === g.tournamentId)}
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
          {renderMatchBar()}
        </header>
        <div className="stage">
          {game ? (
            <>
              <Board
                parsedMoves={parsedMoves}
                moveIndex={playback.moveIndex}
                winnerColor={game.winner_color}
                isPlaying={playback.isPlaying}
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
