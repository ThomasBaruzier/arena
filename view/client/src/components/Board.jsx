import { useMemo, memo } from 'react';
import { DEFAULT_BOARD_SIZE, getWinningLine } from '../utils';

const Board = memo(function Board({ parsedMoves, moveIndex, winnerColor, isPlaying, boardSize = DEFAULT_BOARD_SIZE }) {
  const boardState = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < moveIndex && parsedMoves[i]; i++) {
      map.set(`${parsedMoves[i].x},${parsedMoves[i].y}`, parsedMoves[i].c);
    }
    return map;
  }, [parsedMoves, moveIndex]);

  const winningLine = useMemo(
    () => (moveIndex >= parsedMoves.length ? getWinningLine(parsedMoves, winnerColor, boardSize) : []),
    [winnerColor, moveIndex, parsedMoves, boardSize]
  );

  return (
    <div className="board-wrapper">
      <div className="wood-frame">
        <div
          className="board-grid"
          data-testid="board-grid"
          style={{ gridTemplateColumns: `repeat(${boardSize}, 1fr)`, gridTemplateRows: `repeat(${boardSize}, 1fr)` }}
        >
          {Array.from({ length: boardSize * boardSize }, (_, i) => {
            const x = i % boardSize;
            const y = Math.floor(i / boardSize);
            const isStar =
              [3, boardSize - 4, Math.floor(boardSize / 2)].includes(x) &&
              [3, boardSize - 4, Math.floor(boardSize / 2)].includes(y);
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
                style={{
                  left: `${(x * 100) / boardSize}%`,
                  top: `${(y * 100) / boardSize}%`,
                  width: `${100 / boardSize}%`,
                  height: `${100 / boardSize}%`
                }}
                data-testid={`stone-${x}-${y}`}
              />
            );
          })}
          <svg
            className="board-overlay"
            viewBox={`0 0 ${boardSize} ${boardSize}`}
            preserveAspectRatio="none"
          >
            {winningLine.length >= 5 && (
              <line
                x1={winningLine[0].x + 0.5}
                y1={winningLine[0].y + 0.5}
                x2={winningLine[winningLine.length - 1].x + 0.5}
                y2={winningLine[winningLine.length - 1].y + 0.5}
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
