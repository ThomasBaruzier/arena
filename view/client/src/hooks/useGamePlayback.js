import { useCallback, useEffect, useRef, useState } from 'react';

export const PLAYBACK_DELAYS = [1000, 500, 50];

export function useGamePlayback(totalMoves) {
  const [moveIndex, setMoveIndexState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [motion, setMotion] = useState(null);
  const timerRef = useRef(null);
  const moveIndexRef = useRef(0);
  const totalMovesRef = useRef(totalMoves);
  const nextMotionToken = useRef(0);

  moveIndexRef.current = moveIndex;
  totalMovesRef.current = totalMoves;

  const commit = useCallback((value, kind = 'sync', bounded = true) => {
    const current = moveIndexRef.current;
    const requested = typeof value === 'function' ? value(current) : value;
    const numeric = Number.isFinite(requested) ? Math.trunc(requested) : current;
    const next = Math.max(
      0,
      bounded ? Math.min(totalMovesRef.current, numeric) : numeric
    );

    moveIndexRef.current = next;
    setMoveIndexState(next);
    setMotion({
      token: ++nextMotionToken.current,
      kind
    });

    return next !== current;
  }, []);

  const setMoveIndex = useCallback((value) => commit(value, 'sync', false), [commit]);

  const replayFromStart = useCallback(() => {
    if (moveIndexRef.current === 0) {
      return false;
    }

    setIsPlaying(false);
    return commit(0, 'replay');
  }, [commit]);

  const previousMove = useCallback(() => {
    if (moveIndexRef.current === 0) {
      return false;
    }

    setIsPlaying(false);
    return commit((current) => current - 1, 'previous');
  }, [commit]);

  const nextMove = useCallback(() => {
    if (moveIndexRef.current >= totalMovesRef.current) {
      return false;
    }

    setIsPlaying(false);
    return commit((current) => current + 1, 'next');
  }, [commit]);

  useEffect(() => {
    if (moveIndexRef.current > totalMoves) {
      commit(totalMoves, 'sync');
    }
  }, [totalMoves, commit]);

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (isPlaying && moveIndex < totalMoves) {
      timerRef.current = setTimeout(
        () => commit((current) => current + 1, 'next'),
        PLAYBACK_DELAYS[speed - 1]
      );
    } else if (isPlaying && moveIndex >= totalMoves) {
      setIsPlaying(false);
    }

    return () => clearTimeout(timerRef.current);
  }, [isPlaying, moveIndex, totalMoves, speed, commit]);

  return {
    moveIndex,
    setMoveIndex,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    motion,
    replayFromStart,
    previousMove,
    nextMove
  };
}
