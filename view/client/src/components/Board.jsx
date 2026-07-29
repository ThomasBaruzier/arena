import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BOARD_SIZE, getWinningLine } from '../utils';

const Board = memo(function Board({
  gameId,
  parsedMoves,
  moveIndex,
  winnerColor,
  boardSize = DEFAULT_BOARD_SIZE
}) {
  const previous = useRef(null);
  const [spawned, setSpawned] = useState(null);

  useEffect(() => {
    const last = parsedMoves[moveIndex - 1];
    const prior = previous.current;

    if (
      prior &&
      String(prior.gameId) === String(gameId) &&
      moveIndex === prior.moveIndex + 1 &&
      last
    ) {
      setSpawned(`${last.x},${last.y}`);
    } else {
      setSpawned(null);
    }

    previous.current = {
      gameId,
      moveIndex
    };
  }, [gameId, moveIndex, parsedMoves]);

  const boardState = useMemo(() => {
    const map = new Map();

    for (let index = 0; index < moveIndex && parsedMoves[index]; index += 1) {
      const move = parsedMoves[index];

      map.set(`${move.x},${move.y}`, move.c);
    }

    return map;
  }, [parsedMoves, moveIndex]);

  const winningLine = useMemo(
    () =>
      moveIndex >= parsedMoves.length ? getWinningLine(parsedMoves, winnerColor, boardSize) : [],
    [winnerColor, moveIndex, parsedMoves, boardSize]
  );

  return (
    <div className="board-wrapper">
      <div className="wood-frame">
        <div
          className="board-grid"
          data-testid="board-grid"
          style={{
            gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
            gridTemplateRows: `repeat(${boardSize}, 1fr)`
          }}
        >
          {Array.from(
            {
              length: boardSize * boardSize
            },
            (_, index) => {
              const x = index % boardSize;

              const y = Math.floor(index / boardSize);

              const stars = [3, boardSize - 4, Math.floor(boardSize / 2)];

              const isStar = stars.includes(x) && stars.includes(y);

              return (
                <div key={index} className="cell">
                  <div className="line h" />
                  <div className="line v" />
                  {isStar && <div className="hoshi" />}
                </div>
              );
            }
          )}

          {[...boardState].map(([key, color]) => {
            const [x, y] = key.split(',').map(Number);

            const last = parsedMoves[moveIndex - 1];

            const isLast = last?.x === x && last?.y === y;

            const isSpawned = spawned === key;

            return (
              <div
                key={key}
                className={`stone-layer ${color === 1 ? 'black' : 'white'} ${
                  isLast ? 'last' : ''
                } ${isSpawned ? 'spawn' : ''}`}
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
                key={`${gameId}-${parsedMoves.length}`}
                x1={winningLine[0].x + 0.5}
                y1={winningLine[0].y + 0.5}
                x2={winningLine[winningLine.length - 1].x + 0.5}
                y2={winningLine[winningLine.length - 1].y + 0.5}
                pathLength="1"
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
