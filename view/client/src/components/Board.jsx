import { useMemo, memo, useState, useEffect } from 'react';
import { BOARD_SIZE, getWinningLine } from '../utils';

const Stone = memo(function Stone({ x, y, c, isVisible, isLast, isOpening }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const show = isVisible && isReady;

  return (
    <div
      className={`stone-layer ${c === 1 ? 'black' : 'white'} ${show ? 'visible' : ''} ${isLast ? 'last' : ''} ${isOpening ? 'stone-opening' : ''}`}
      style={{ left: `${x * 5}%`, top: `${y * 5}%` }}
      data-testid={`stone-${x}-${y}`}
    />
  );
});

const Board = memo(function Board({
  parsedMoves,
  moveIndex,
  winnerColor,
  isPlaying,
  openingLen = 0,
  isExiting
}) {
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
          {parsedMoves.map((move, i) => {
            const isVisible = !isExiting && i < moveIndex;
            const isLast = i === moveIndex - 1 && !isPlaying;
            const isOpening = i < openingLen;
            return (
              <Stone
                key={`${move.x}-${move.y}-${i}`}
                x={move.x}
                y={move.y}
                c={move.c}
                isVisible={isVisible}
                isLast={isLast}
                isOpening={isOpening}
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
});

export default Board;
