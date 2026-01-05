import { useMemo } from 'react';
import { BOARD_SIZE, getWinningLine } from '../utils';

export default function Board({ parsedMoves, moveIndex, winnerColor, isPlaying }) {
  const boardState = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < moveIndex && parsedMoves[i]; i++) {
      map.set(`${parsedMoves[i].x},${parsedMoves[i].y}`, parsedMoves[i].c);
    }
    return map;
  }, [parsedMoves, moveIndex]);

  const winningLine = useMemo(
    () => (moveIndex >= parsedMoves.length ? getWinningLine(parsedMoves, winnerColor) : []),
    [winnerColor, moveIndex, parsedMoves]
  );

  return (
    <div className="board-wrapper">
      <div className="wood-frame">
        <div className="board-grid" data-testid="board-grid">
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
            const x = i % BOARD_SIZE;
            const y = Math.floor(i / BOARD_SIZE);
            const isStar =
              [3, BOARD_SIZE - 4, Math.floor(BOARD_SIZE / 2)].includes(x) &&
              [3, BOARD_SIZE - 4, Math.floor(BOARD_SIZE / 2)].includes(y);
            return (
              <div key={i} className="cell">
                <div className="line h" />
                <div className="line v" />
                {isStar && <div className="hoshi" />}
              </div>
            );
          })}
          {[...boardState].map(([k, c]) => {
            const [x, y] = k.split(',').map(Number);
            const last = parsedMoves[moveIndex - 1];
            const isLast = !isPlaying && last?.x === x && last?.y === y;
            return (
              <div
                key={k}
                className={`stone-layer ${c === 1 ? 'black' : 'white'} ${isLast ? 'last' : ''}`}
                style={{ left: `${x * 5}%`, top: `${y * 5}%` }}
                data-testid={`stone-${x}-${y}`}
              />
            );
          })}
          <svg
            className="board-overlay"
            viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
            preserveAspectRatio="none"
          >
            {winningLine.length === 5 && (
              <line
                x1={winningLine[0].x + 0.5}
                y1={winningLine[0].y + 0.5}
                x2={winningLine[4].x + 0.5}
                y2={winningLine[4].y + 0.5}
                className="win-line-svg"
                data-testid="win-line"
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
