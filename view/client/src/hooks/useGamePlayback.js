import { useState, useCallback } from 'react';

export function useGamePlayback(totalMoves) {
  const [moveIndex, setMoveIndexState] = useState(totalMoves);

  const setMoveIndex = useCallback(
    (val) => {
      setMoveIndexState((prev) => {
        const next = typeof val === 'function' ? val(prev) : val;
        return Math.max(0, Math.min(next, totalMoves));
      });
    },
    [totalMoves]
  );

  return {
    moveIndex,
    setMoveIndex
  };
}
