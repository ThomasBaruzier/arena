import { memo, useEffect, useMemo, useRef } from 'react';
import { useVisualBoard } from '../hooks/useVisualBoard';
import { DEFAULT_BOARD_SIZE, getWinningLine } from '../utils';

const transitionStyle = (layer, now, name) => ({
  [`--${name}-delay`]: `${Math.max(0, Math.round(layer.startAt - now))}ms`,
  [`--${name}-duration`]: `${layer.duration}ms`
});

const Board = memo(function Board({
  gameId,
  parsedMoves,
  moveIndex,
  winnerColor,
  motion,
  boardSize = DEFAULT_BOARD_SIZE
}) {
  const moves = useMemo(
    () => parsedMoves.slice(0, Math.max(0, Math.min(moveIndex, parsedMoves.length))),
    [parsedMoves, moveIndex]
  );

  const winningLine = useMemo(
    () =>
      moveIndex >= parsedMoves.length
        ? getWinningLine(moves, winnerColor, boardSize)
        : [],
    [moveIndex, parsedMoves.length, moves, winnerColor, boardSize]
  );

  const visual = useVisualBoard({
    gameId,
    moves,
    winningLine,
    motion
  });
  const { finishStone, finishMarker, finishLine } = visual;
  const gridRef = useRef(null);
  const renderTime = performance.now();

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) {
      return undefined;
    }

    const finish = (event) => {
      if (event.propertyName !== 'opacity') {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const { transitionKind, transitionId, transitionStatus } = target.dataset;

      if (!transitionKind || !transitionId || !transitionStatus) {
        return;
      }

      if (transitionKind === 'stone') {
        finishStone(transitionId, transitionStatus);
      } else if (transitionKind === 'marker') {
        finishMarker(transitionId, transitionStatus);
      } else if (transitionKind === 'line') {
        finishLine(transitionId, transitionStatus);
      }
    };

    grid.addEventListener('transitionend', finish);
    return () => grid.removeEventListener('transitionend', finish);
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
          {Array.from({ length: boardSize * boardSize }, (_, index) => {
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
          })}

          {visual.stones.map((stone) => (
            <div
              key={stone.id}
              className={`stone-layer ${stone.c === 1 ? 'black' : 'white'} ${
                stone.status
              }`}
              style={{
                ...position(stone.x, stone.y),
                ...transitionStyle(stone, renderTime, 'stone')
              }}
              data-testid={`stone-${stone.x}-${stone.y}`}
              data-transition-kind="stone"
              data-transition-id={stone.id}
              data-transition-status={stone.status}
            />
          ))}

          {visual.markers.map((marker) => (
            <div
              key={marker.id}
              className={`move-marker ${
                marker.c === 1 ? 'on-black' : 'on-white'
              } ${marker.status}`}
              style={{
                ...position(marker.x, marker.y),
                ...transitionStyle(marker, renderTime, 'marker')
              }}
              data-testid="last-move-marker"
              data-transition-kind="marker"
              data-transition-id={marker.id}
              data-transition-status={marker.status}
              aria-hidden="true"
            />
          ))}

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
                style={transitionStyle(visual.line, renderTime, 'line')}
                data-testid="win-line"
                data-transition-kind="line"
                data-transition-id={visual.line.id}
                data-transition-status={visual.line.status}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
});

export default Board;
