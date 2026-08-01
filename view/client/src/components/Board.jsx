import { memo, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_BOARD_SIZE, getWinningLine } from '../utils';
import { useVisualBoard } from '../hooks/useVisualBoard';

const animationStatus = (name) => {
  if (name.endsWith('-enter')) return 'entering';
  if (name.endsWith('-exit')) return 'exiting';
  return null;
};

const Board = memo(function Board({
  gameId,
  parsedMoves,
  moveIndex,
  winnerColor,
  transition,
  boardSize = DEFAULT_BOARD_SIZE,
  onTransitionChange,
  onTransitionComplete
}) {
  const moves = useMemo(
    () => parsedMoves.slice(0, Math.max(0, Math.min(moveIndex, parsedMoves.length))),
    [parsedMoves, moveIndex]
  );

  const winningLine = useMemo(
    () => (moveIndex >= parsedMoves.length ? getWinningLine(moves, winnerColor, boardSize) : []),
    [moveIndex, parsedMoves.length, moves, winnerColor, boardSize]
  );

  const visual = useVisualBoard({
    gameId,
    moves,
    winningLine,
    transition,
    onTransitionComplete
  });

  const { finishStone, finishMarker, finishLine } = visual;
  const gridRef = useRef(null);

  useEffect(() => {
    onTransitionChange?.(visual.transitioning);
  }, [visual.transitioning, onTransitionChange]);

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) return undefined;

    const finish = (event) => {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const { animationKind, animationId } = target.dataset;
      const status = animationStatus(event.animationName);

      if (!animationKind || !animationId || !status) return;

      if (animationKind === 'stone') {
        finishStone(animationId, status);
      } else if (animationKind === 'marker') {
        finishMarker(animationId, status);
      } else if (animationKind === 'line') {
        finishLine(animationId, status);
      }
    };

    grid.addEventListener('animationend', finish);
    grid.addEventListener('animationcancel', finish);

    return () => {
      grid.removeEventListener('animationend', finish);
      grid.removeEventListener('animationcancel', finish);
    };
  }, [finishStone, finishMarker, finishLine]);

  const position = (x, y) => ({
    left: `${(x * 100) / boardSize}%`,
    top: `${(y * 100) / boardSize}%`,
    width: `${100 / boardSize}%`,
    height: `${100 / boardSize}%`
  });

  return (
    <div className="board-wrapper">
      <div className="wood-frame">
        <div
          ref={gridRef}
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

          {visual.stones.map((stone) => (
            <div
              key={stone.id}
              className={`stone-layer ${stone.c === 1 ? 'black' : 'white'} ${stone.status}`}
              style={{
                ...position(stone.x, stone.y),
                '--stone-delay': `${stone.delay}ms`
              }}
              data-testid={`stone-${stone.x}-${stone.y}`}
              data-animation-kind="stone"
              data-animation-id={stone.id}
            />
          ))}

          {visual.marker && (
            <div
              key={visual.marker.id}
              className={`move-marker ${
                visual.marker.c === 1 ? 'on-black' : 'on-white'
              } ${visual.marker.status}`}
              style={position(visual.marker.x, visual.marker.y)}
              data-testid="last-move-marker"
              data-animation-kind="marker"
              data-animation-id={visual.marker.id}
            />
          )}

          <svg
            className="board-overlay"
            viewBox={`0 0 ${boardSize} ${boardSize}`}
            preserveAspectRatio="none"
          >
            {visual.line && visual.line.points.length >= 5 && (
              <line
                key={visual.line.id}
                x1={visual.line.points[0].x + 0.5}
                y1={visual.line.points[0].y + 0.5}
                x2={visual.line.points.at(-1).x + 0.5}
                y2={visual.line.points.at(-1).y + 0.5}
                pathLength="1"
                className={`win-line-svg ${visual.line.status}`}
                data-testid="win-line"
                data-animation-kind="line"
                data-animation-id={visual.line.id}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
});

export default Board;
