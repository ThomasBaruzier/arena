import { useState, useEffect, useRef } from 'react';

export function useGamePlayback(totalMoves) {
  const [moveIndex, setMoveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isPlaying && moveIndex < totalMoves) {
      const delay = [500, 200, 50][speed - 1];
      timerRef.current = setTimeout(() => setMoveIndex((i) => i + 1), delay);
    } else if (moveIndex >= totalMoves) {
      setIsPlaying(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [isPlaying, moveIndex, totalMoves, speed]);

  return {
    moveIndex,
    setMoveIndex,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed
  };
}
