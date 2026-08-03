import { useCallback, useLayoutEffect, useReducer, useRef } from 'react';

const STONE_ENTER_MS = 150;
const STONE_EXIT_MS = 100;
const LINE_MS = 260;
const STAGGER_MS = 40;

const sameMove = (first, second) =>
  first?.x === second?.x && first?.y === second?.y && first?.c === second?.c;

const sameLine = (first, second) =>
  first.length === second.length &&
  first.every(
    (point, index) => point.x === second[index].x && point.y === second[index].y
  );

const commonPrefix = (first, second) => {
  let index = 0;

  while (
    index < first.length &&
    index < second.length &&
    sameMove(first[index], second[index])
  ) {
    index += 1;
  }

  return index;
};

const copyMoves = (moves) => moves.map((move) => ({ ...move }));
const copyLine = (line) => line.map((point) => ({ ...point }));

const nextEntranceStart = (stones, now) => {
  let latest = -1;

  for (const stone of stones) {
    if (stone.status === 'entering' && stone.startAt > now) {
      latest = Math.max(latest, stone.startAt);
    }
  }

  return latest < 0 ? now : latest + STAGGER_MS;
};

const retireLayer = (layer, now, duration) => {
  if (layer.status === 'exiting') {
    return layer;
  }

  if (layer.status === 'entering' && layer.startAt > now) {
    return null;
  }

  return {
    ...layer,
    status: 'exiting',
    startAt: now,
    duration
  };
};

const outgoingMarker = (markers, priorIndex) => {
  for (let index = markers.length - 1; index >= 0; index -= 1) {
    if (markers[index].index === priorIndex) {
      return markers[index];
    }
  }

  return markers.at(-1) ?? null;
};

export const visualBoardReducer = (state, action) => {
  if (action.type === 'SYNC') {
    return {
      stones: action.stones,
      markers: action.markers,
      line: action.line
    };
  }

  if (action.type === 'FINISH_STONE') {
    const stone = state.stones.find((current) => current.id === action.id);

    if (!stone || stone.status !== action.status) {
      return state;
    }

    return {
      ...state,
      stones:
        stone.status === 'exiting'
          ? state.stones.filter((current) => current.id !== action.id)
          : state.stones.map((current) =>
              current.id === action.id
                ? {
                    ...current,
                    status: 'stable',
                    startAt: 0,
                    duration: 0
                  }
                : current
            )
    };
  }

  if (action.type === 'FINISH_MARKER') {
    const marker = state.markers.find((current) => current.id === action.id);

    if (!marker || marker.status !== action.status) {
      return state;
    }

    return {
      ...state,
      markers:
        marker.status === 'exiting'
          ? state.markers.filter((current) => current.id !== action.id)
          : state.markers.map((current) =>
              current.id === action.id
                ? {
                    ...current,
                    status: 'stable',
                    startAt: 0,
                    duration: 0
                  }
                : current
            )
    };
  }

  if (action.type === 'FINISH_LINE') {
    if (
      !state.line ||
      state.line.id !== action.id ||
      state.line.status !== action.status
    ) {
      return state;
    }

    return {
      ...state,
      line:
        state.line.status === 'exiting'
          ? null
          : {
              ...state.line,
              status: 'stable',
              startAt: 0,
              duration: 0
            }
    };
  }

  return state;
};

export function useVisualBoard({ gameId, moves, winningLine, motion }) {
  const serial = useRef(0);

  const makeStone = useCallback(
    (move, index, status, startAt = 0, duration = 0) => ({
      ...move,
      index,
      status,
      startAt,
      duration,
      id: `${gameId}:stone:${index}:${++serial.current}`
    }),
    [gameId]
  );

  const makeMarker = useCallback(
    (move, index, status, startAt = 0, duration = 0) =>
      move
        ? {
            x: move.x,
            y: move.y,
            c: move.c,
            index,
            status,
            startAt,
            duration,
            id: `${gameId}:marker:${index}:${++serial.current}`
          }
        : null,
    [gameId]
  );

  const makeLine = useCallback(
    (points, status, startAt = 0, duration = 0) =>
      points.length >= 5
        ? {
            points: copyLine(points),
            status,
            startAt,
            duration,
            id: `${gameId}:line:${++serial.current}`
          }
        : null,
    [gameId]
  );

  const [visual, dispatch] = useReducer(visualBoardReducer, null, () => ({
    stones: moves.map((move, index) => makeStone(move, index, 'stable')),
    markers:
      moves.length > 0 ? [makeMarker(moves.at(-1), moves.length - 1, 'stable')] : [],
    line: makeLine(winningLine, 'stable')
  }));

  const visualRef = useRef(visual);
  visualRef.current = visual;

  const previous = useRef({
    gameId,
    moves: copyMoves(moves),
    line: copyLine(winningLine)
  });

  useLayoutEffect(() => {
    const prior = previous.current;
    const current = visualRef.current;
    const sameGame = String(prior.gameId) === String(gameId);
    const prefix = sameGame ? commonPrefix(prior.moves, moves) : 0;
    const compatible =
      sameGame && prefix === Math.min(prior.moves.length, moves.length);
    const movesChanged =
      !sameGame || prior.moves.length !== moves.length || prefix !== moves.length;
    const lineChanged = !sameLine(prior.line, winningLine);

    if (!movesChanged && !lineChanged) {
      previous.current = {
        gameId,
        moves: copyMoves(moves),
        line: copyLine(winningLine)
      };
      return;
    }

    if (!sameGame || !compatible) {
      const marker = makeMarker(moves.at(-1), moves.length - 1, 'stable');

      dispatch({
        type: 'SYNC',
        stones: moves.map((move, index) => makeStone(move, index, 'stable')),
        markers: marker ? [marker] : [],
        line: makeLine(winningLine, 'stable')
      });

      previous.current = {
        gameId,
        moves: copyMoves(moves),
        line: copyLine(winningLine)
      };
      return;
    }

    const now = performance.now();
    const forward = moves.length > prior.moves.length;
    const backward = moves.length < prior.moves.length;
    const selected = new Set();
    const desired = [];
    let scheduledStart = nextEntranceStart(current.stones, now);

    for (let index = 0; index < moves.length; index += 1) {
      const existing = current.stones.find(
        (stone) => stone.index === index && sameMove(stone, moves[index])
      );

      if (existing) {
        selected.add(existing.id);

        if (existing.status === 'exiting') {
          desired.push({
            ...existing,
            status: 'entering',
            startAt: scheduledStart,
            duration: STONE_ENTER_MS
          });
          scheduledStart += STAGGER_MS;
        } else {
          desired.push(existing);
        }

        continue;
      }

      if (forward && index >= prefix) {
        desired.push(
          makeStone(moves[index], index, 'entering', scheduledStart, STONE_ENTER_MS)
        );
        scheduledStart += STAGGER_MS;
      } else {
        desired.push(makeStone(moves[index], index, 'stable'));
      }
    }

    const leaving = [];

    for (const stone of current.stones) {
      if (selected.has(stone.id)) {
        continue;
      }

      const retired = retireLayer(stone, now, STONE_EXIT_MS);

      if (retired) {
        leaving.push(retired);
      }
    }

    let markers = current.markers;

    if (movesChanged) {
      const targetIndex = moves.length - 1;
      const targetMove = moves.at(-1);
      const finalStone = desired.at(-1);
      const markerDuration = backward ? STONE_EXIT_MS : STONE_ENTER_MS;
      const markerStart =
        forward && finalStone?.status === 'entering' ? finalStone.startAt : now;
      let targetMarker = null;

      for (let index = current.markers.length - 1; index >= 0; index -= 1) {
        const marker = current.markers[index];

        if (marker.index === targetIndex && sameMove(marker, targetMove)) {
          targetMarker = marker;
          break;
        }
      }

      const retiring = [];

      for (const marker of current.markers) {
        if (marker.index === targetIndex && sameMove(marker, targetMove)) {
          continue;
        }

        const retired = retireLayer(marker, now, markerDuration);

        if (retired) {
          retiring.push(retired);
        }
      }

      const nextMarkers = [];
      const outgoing = outgoingMarker(retiring, prior.moves.length - 1);

      if (outgoing) {
        nextMarkers.push(outgoing);
      }

      if (targetMove) {
        nextMarkers.push(
          targetMarker?.status === 'stable'
            ? targetMarker
            : targetMarker
              ? {
                  ...targetMarker,
                  status: 'entering',
                  startAt: markerStart,
                  duration: markerDuration
                }
              : makeMarker(
                  targetMove,
                  targetIndex,
                  'entering',
                  markerStart,
                  markerDuration
                )
        );
      }

      markers = nextMarkers;
    }

    let line = current.line;
    const finalStone = desired.at(-1);
    const lineStart =
      forward && finalStone?.status === 'entering' ? finalStone.startAt : now;

    if (winningLine.length >= 5) {
      if (current.line && sameLine(current.line.points, winningLine)) {
        line =
          current.line.status === 'exiting'
            ? {
                ...current.line,
                status: 'entering',
                startAt: lineStart,
                duration: LINE_MS
              }
            : current.line;
      } else {
        line = makeLine(winningLine, 'entering', lineStart, LINE_MS);
      }
    } else if (current.line) {
      line = retireLayer(current.line, now, LINE_MS);
    }

    dispatch({
      type: 'SYNC',
      stones: [...desired, ...leaving],
      markers,
      line
    });

    previous.current = {
      gameId,
      moves: copyMoves(moves),
      line: copyLine(winningLine)
    };
  }, [gameId, moves, winningLine, motion, makeStone, makeMarker, makeLine]);

  const finishStone = useCallback((id, status) => {
    dispatch({
      type: 'FINISH_STONE',
      id,
      status
    });
  }, []);

  const finishMarker = useCallback((id, status) => {
    dispatch({
      type: 'FINISH_MARKER',
      id,
      status
    });
  }, []);

  const finishLine = useCallback((id, status) => {
    dispatch({
      type: 'FINISH_LINE',
      id,
      status
    });
  }, []);

  return {
    ...visual,
    finishStone,
    finishMarker,
    finishLine
  };
}
