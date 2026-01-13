import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEventSource } from './useEventSource';
import { useGamePlayback } from './useGamePlayback';
import { parseMoves } from '../utils';

export function useGameContext(apiBase) {
  const [selectedId, setSelectedId] = useState(null);
  const [game, setGame] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [loadingKey, setLoadingKey] = useState(null);
  const [isManualSelection, setIsManualSelection] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const [sidebarOffset, setSidebarOffset] = useState(null);
  const [gameListOffset, setGameListOffset] = useState(null);

  const reqIdRef = useRef(0);
  const initialLoadDone = useRef(false);
  const selectedIdRef = useRef(selectedId);

  const { subscribe, isConnected } = useEventSource(`${apiBase}/events`);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const movesStr = game?.moves;
  const parsedMoves = useMemo(() => (movesStr ? parseMoves(movesStr) : []), [movesStr]);
  const openingLen = game?.opening_len || 0;

  const totalLogicalMoves = useMemo(() => {
    return Math.max(0, parsedMoves.length - openingLen);
  }, [parsedMoves.length, openingLen]);

  const playback = useGamePlayback(totalLogicalMoves);
  const { setMoveIndex } = playback;

  const effectiveMoveIndex = isLive ? totalLogicalMoves : playback.moveIndex;

  useEffect(() => {
    if (isLive && playback.moveIndex !== totalLogicalMoves) {
      setMoveIndex(totalLogicalMoves);
    }
  }, [totalLogicalMoves, isLive, playback.moveIndex, setMoveIndex]);

  const onPlayInteraction = useCallback(() => setIsLive(false), []);

  const handleSeekStart = useCallback(() => {
    setIsSeeking(true);
    onPlayInteraction();
  }, [onPlayInteraction]);

  const onSeekEnd = useCallback(
    (val) => {
      setIsSeeking(false);
      if (val === totalLogicalMoves) setIsLive(true);
    },
    [totalLogicalMoves]
  );

  useEffect(() => {
    if (!isLive && !isSeeking && playback.moveIndex === totalLogicalMoves) {
      setIsLive(true);
    }
  }, [isLive, isSeeking, playback.moveIndex, totalLogicalMoves]);

  const safeSetGame = useCallback((newGame) => {
    setGame((prev) => {
      if (!newGame) return null;
      if (!prev || prev.id !== newGame.id) return newGame;
      const prevMoves = prev.moves ? prev.moves.split(';').length : 0;
      const newMoves = newGame.moves ? newGame.moves.split(';').length : 0;
      if (prevMoves > newMoves) {
        return { ...newGame, moves: prev.moves, winner_color: prev.winner_color };
      }
      return newGame;
    });
  }, []);

  const fetchContext = useCallback(
    (id) => {
      const rid = ++reqIdRef.current;
      fetch(`${apiBase}/game/${id}?context=true`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          if (reqIdRef.current !== rid) return;
          safeSetGame(data);
          setSelectedId(data.id);
          setIsManualSelection(false);

          const moves = parseMoves(data.moves);
          const opLen = data.opening_len || 0;
          const logicalLen = Math.max(0, moves.length - opLen);

          setMoveIndex(logicalLen);
          setIsLive(true);

          history.replaceState(null, '', `/${data.id}`);

          if (data.matchup_offset !== undefined) {
            const tid = data.tournament_id || 'legacy';
            const minId = Math.min(data.black_id, data.white_id);
            const maxId = Math.max(data.black_id, data.white_id);
            const key = `${tid}-${minId}-${maxId}`;

            setExpandedKey(key);
            setLoadingKey(key);

            setSidebarOffset(data.matchup_offset);
            if (data.game_offset !== undefined) setGameListOffset(data.game_offset);
          }
        })
        .catch(() => {
          if (reqIdRef.current === rid) {
            history.replaceState(null, '', '/');
            safeSetGame(null);
            setSelectedId(null);
          }
        })
        .finally(() => {
          if (reqIdRef.current === rid) setInitializing(false);
        });
    },
    [apiBase, setMoveIndex, safeSetGame]
  );

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const urlId = parseInt(window.location.pathname.slice(1));
    if (!isNaN(urlId) && urlId > 0) {
      fetchContext(urlId);
    } else {
      fetch(`${apiBase}/latest-game`)
        .then((r) => r.json())
        .then(({ id }) => (id ? fetchContext(id) : setInitializing(false)))
        .catch(() => setInitializing(false));
    }
  }, [fetchContext, apiBase]);

  useEffect(() => {
    if (!selectedId || game?.id === selectedId) return;

    setIsExiting(true);

    const controller = new AbortController();
    const rid = ++reqIdRef.current;

    const fetchPromise = fetch(`${apiBase}/game/${selectedId}`, { signal: controller.signal }).then(
      (r) => (r.ok ? r.json() : Promise.reject())
    );

    const animPromise = new Promise((resolve) => setTimeout(resolve, 150));

    Promise.all([fetchPromise, animPromise])
      .then(([data]) => {
        if (reqIdRef.current !== rid) return;
        safeSetGame(data);
        const moves = parseMoves(data.moves);
        const opLen = data.opening_len || 0;
        const logicalLen = Math.max(0, moves.length - opLen);
        setMoveIndex(logicalLen);
        setIsLive(true);
        history.replaceState(null, '', `/${selectedId}`);
        setIsExiting(false);
      })
      .catch(() => {
        if (reqIdRef.current === rid) setIsExiting(false);
      });

    return () => controller.abort();
  }, [selectedId, apiBase, game?.id, setMoveIndex, safeSetGame]);

  useEffect(() => {
    if (!selectedId) return;
    return subscribe((e) => {
      if (e.id !== selectedId) return;
      setGame((prev) => {
        if (!prev || prev.id !== e.id) return prev;
        if (e.type === 'game_move') return { ...prev, moves: e.moves };
        if (e.type === 'game_result')
          return { ...prev, winner_color: e.winner_color, moves: e.moves || prev.moves };
        return prev;
      });
    });
  }, [selectedId, subscribe]);

  useEffect(() => {
    if (isConnected && selectedIdRef.current) {
      fetch(`${apiBase}/game/${selectedIdRef.current}`)
        .then((r) => r.ok && r.json())
        .then(safeSetGame)
        .catch(() => {});
    }
  }, [isConnected, apiBase, safeSetGame]);

  return {
    game,
    selectedId,
    setSelectedId,
    initializing,
    parsedMoves,
    openingLen,
    totalLogicalMoves,
    playback: { ...playback, moveIndex: effectiveMoveIndex, isLive },
    onSeekStart: handleSeekStart,
    onSeekEnd,
    onPlayInteraction,
    subscribe,
    expandedKey,
    setExpandedKey,
    loadingKey,
    setLoadingKey,
    sidebarOffset,
    gameListOffset,
    setGameListOffset,
    isManualSelection,
    setIsManualSelection,
    isExiting
  };
}
