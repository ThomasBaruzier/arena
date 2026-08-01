import { useCallback, useEffect, useRef, useState } from 'react';

export const PLAYBACK_DELAYS = [1000, 500, 50];

export function useGamePlayback(totalMoves) {
  const [moveIndex, setMoveIndexState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [transition, setTransition] = useState(null);

  const timerRef = useRef(null);
  const moveIndexRef = useRef(0);
  const transitionRef = useRef(null);
  const nextTransitionToken = useRef(0);

  moveIndexRef.current = moveIndex;

  const setMoveIndex = useCallback((value) => {
    setMoveIndexState((current) => {
      const next = typeof value === 'function' ? value(current) : value;

      moveIndexRef.current = next;
      return next;
    });
  }, []);

  const beginTransition = useCallback(
    (kind, update) => {
      if (transitionRef.current) {
        return false;
      }

      const token = ++nextTransitionToken.current;

      const next = {
        token,
        kind
      };

      transitionRef.current = next;
      setTransition(next);
      setIsPlaying(false);
      setMoveIndex(update);

      return true;
    },
    [setMoveIndex]
  );

  const replayFromStart = useCallback(() => {
    if (moveIndexRef.current === 0) {
      return false;
    }

    return beginTransition('replay', 0);
  }, [beginTransition]);

  const previousMove = useCallback(() => {
    if (moveIndexRef.current === 0) {
      return false;
    }

    return beginTransition('previous', (current) => Math.max(0, current - 1));
  }, [beginTransition]);

  const nextMove = useCallback(() => {
    if (moveIndexRef.current >= totalMoves) {
      return false;
    }

    return beginTransition('next', (current) => Math.min(totalMoves, current + 1));
  }, [beginTransition, totalMoves]);

  const completeTransition = useCallback((token) => {
    if (transitionRef.current?.token !== token) {
      return;
    }

    transitionRef.current = null;
    setTransition(null);
  }, []);

  const cancelTransition = useCallback(() => {
    if (!transitionRef.current) {
      return;
    }

    transitionRef.current = null;
    setTransition(null);
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (transition) {
      return undefined;
    }

    if (isPlaying && moveIndex < totalMoves) {
      timerRef.current = setTimeout(
        () => setMoveIndex((current) => Math.min(totalMoves, current + 1)),
        PLAYBACK_DELAYS[speed - 1]
      );
    } else if (isPlaying && moveIndex >= totalMoves) {
      setIsPlaying(false);
    }

    return () => clearTimeout(timerRef.current);
  }, [isPlaying, moveIndex, totalMoves, speed, transition, setMoveIndex]);

  return {
    moveIndex,
    setMoveIndex,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    transition,
    replayFromStart,
    previousMove,
    nextMove,
    completeTransition,
    cancelTransition
  };
}
