import { useCallback, useLayoutEffect, useMemo, useReducer, useRef } from 'react';

const sameMove = (first, second) =>
  first?.x === second?.x && first?.y === second?.y && first?.c === second?.c;

const sameLine = (first, second) =>
  first.length === second.length &&
  first.every((point, index) => point.x === second[index].x && point.y === second[index].y);

const commonPrefix = (first, second) => {
  let index = 0;

  while (index < first.length && index < second.length && sameMove(first[index], second[index])) {
    index += 1;
  }

  return index;
};

const copyMoves = (moves) => moves.map((move) => ({ ...move }));
const copyLine = (line) => line.map((point) => ({ ...point }));

const initialState = (stones, marker, line) => ({
  stones,
  marker,
  line,
  markerTarget: null,
  waitStoneIds: [],
  clearStoneIds: null,
  operationToken: null
});

const promoteMarker = (state) => {
  if (state.marker || !state.markerTarget || state.waitStoneIds.length > 0) {
    return state;
  }

  return {
    ...state,
    marker: state.markerTarget,
    markerTarget: null
  };
};

export const visualBoardReducer = (state, action) => {
  if (action.type === 'REPLACE') {
    return initialState(action.stones, action.marker, action.line);
  }

  if (action.type === 'APPEND') {
    return {
      stones: action.stones,
      marker: state.marker
        ? {
            ...state.marker,
            status: 'exiting'
          }
        : null,
      line: action.line,
      markerTarget: action.markerTarget,
      waitStoneIds: action.waitStoneIds,
      clearStoneIds: null,
      operationToken: action.operationToken
    };
  }

  if (action.type === 'REWIND') {
    return {
      stones: action.stones,
      marker: state.marker
        ? {
            ...state.marker,
            status: 'exiting'
          }
        : null,
      line: state.line
        ? {
            ...state.line,
            status: 'exiting'
          }
        : null,
      markerTarget: action.markerTarget,
      waitStoneIds: action.waitStoneIds,
      clearStoneIds: null,
      operationToken: action.operationToken
    };
  }

  if (action.type === 'CLEAR') {
    const stones = state.stones.map((stone) => ({
      ...stone,
      status: 'exiting',
      delay: 0
    }));

    return {
      stones,
      marker: state.marker
        ? {
            ...state.marker,
            status: 'exiting'
          }
        : null,
      line: state.line
        ? {
            ...state.line,
            status: 'exiting'
          }
        : null,
      markerTarget: null,
      waitStoneIds: [],
      clearStoneIds: stones.length > 0 ? stones.map((stone) => stone.id) : null,
      operationToken: action.operationToken
    };
  }

  if (action.type === 'SYNC_LINE') {
    return {
      ...state,
      line: action.line
    };
  }

  if (action.type === 'FINISH_STONE') {
    if (action.status !== 'entering' && action.status !== 'exiting') {
      return state;
    }

    if (state.clearStoneIds) {
      const stone = state.stones.find((current) => current.id === action.id);

      if (
        action.status !== 'exiting' ||
        !stone ||
        stone.status !== action.status ||
        !state.clearStoneIds.includes(action.id)
      ) {
        return state;
      }

      const remaining = state.clearStoneIds.filter((id) => id !== action.id);

      return {
        ...state,
        stones: remaining.length > 0 ? state.stones : [],
        clearStoneIds: remaining.length > 0 ? remaining : null
      };
    }

    const stone = state.stones.find((current) => current.id === action.id);

    if (!stone || stone.status !== action.status) {
      return state;
    }

    const stones =
      stone.status === 'exiting'
        ? state.stones.filter((current) => current.id !== action.id)
        : state.stones.map((current) =>
            current.id === action.id
              ? {
                  ...current,
                  status: 'stable',
                  delay: 0
                }
              : current
          );

    return promoteMarker({
      ...state,
      stones,
      waitStoneIds: state.waitStoneIds.filter((id) => id !== action.id)
    });
  }

  if (action.type === 'FINISH_MARKER') {
    if (!state.marker || state.marker.id !== action.id || state.marker.status !== action.status) {
      return state;
    }

    if (state.marker.status === 'exiting') {
      return promoteMarker({
        ...state,
        marker: null
      });
    }

    return {
      ...state,
      marker: {
        ...state.marker,
        status: 'stable'
      }
    };
  }

  if (action.type === 'FINISH_LINE') {
    if (!state.line || state.line.id !== action.id || state.line.status !== action.status) {
      return state;
    }

    return {
      ...state,
      line:
        state.line.status === 'exiting'
          ? null
          : {
              ...state.line,
              status: 'stable'
            }
    };
  }

  return state;
};

export function useVisualBoard({ gameId, moves, winningLine, transition, onTransitionComplete }) {
  const serial = useRef(0);
  const completeRef = useRef(onTransitionComplete);
  const completedTokenRef = useRef(null);

  completeRef.current = onTransitionComplete;

  const makeStone = useCallback(
    (move, index, status, delay = 0) => ({
      ...move,
      index,
      status,
      delay,
      id: `${gameId}:stone:${index}:${++serial.current}`
    }),
    [gameId]
  );

  const makeMarker = useCallback(
    (move, status) =>
      move
        ? {
            x: move.x,
            y: move.y,
            c: move.c,
            status,
            id: `${gameId}:marker:${++serial.current}`
          }
        : null,
    [gameId]
  );

  const makeLine = useCallback(
    (points, status) =>
      points.length >= 5
        ? {
            points: copyLine(points),
            status,
            id: `${gameId}:line:${++serial.current}`
          }
        : null,
    [gameId]
  );

  const [visual, dispatch] = useReducer(visualBoardReducer, null, () =>
    initialState(
      moves.map((move, index) => makeStone(move, index, 'stable')),
      makeMarker(moves.at(-1), 'stable'),
      makeLine(winningLine, 'stable')
    )
  );

  const visualRef = useRef(visual);
  visualRef.current = visual;

  const previous = useRef({
    gameId,
    moves: copyMoves(moves),
    line: copyLine(winningLine),
    transitionToken: transition?.token ?? null
  });

  const complete = useCallback((token) => {
    if (token == null || completedTokenRef.current === token) {
      return;
    }

    completedTokenRef.current = token;
    completeRef.current?.(token);
  }, []);

  useLayoutEffect(() => {
    const prior = previous.current;
    const current = visualRef.current;
    const sameGame = String(prior.gameId) === String(gameId);
    const token = transition?.token ?? null;
    const freshToken = token != null && token !== prior.transitionToken;
    const prefix = sameGame ? commonPrefix(prior.moves, moves) : 0;
    const appended = sameGame && prefix === prior.moves.length && moves.length > prior.moves.length;
    const removedOne =
      sameGame && prior.moves.length === moves.length + 1 && prefix === moves.length;

    if (!sameGame) {
      complete(current.operationToken);

      dispatch({
        type: 'REPLACE',
        stones: moves.map((move, index) => makeStone(move, index, 'stable')),
        marker: makeMarker(moves.at(-1), 'stable'),
        line: makeLine(winningLine, 'stable')
      });
    } else if (freshToken && transition.kind === 'replay') {
      dispatch({
        type: 'CLEAR',
        operationToken: token
      });
    } else if (appended) {
      if (current.operationToken && transition?.kind !== 'next') {
        complete(current.operationToken);
      }

      const retained = current.stones.filter(
        (stone) =>
          stone.status !== 'exiting' &&
          stone.index < prior.moves.length &&
          sameMove(stone, moves[stone.index])
      );

      const additions = moves
        .slice(prior.moves.length)
        .map((move, offset) =>
          makeStone(move, prior.moves.length + offset, 'entering', offset * 40)
        );

      const stones = [...retained, ...additions];
      const waiting = new Set([...current.waitStoneIds, ...additions.map((stone) => stone.id)]);

      dispatch({
        type: 'APPEND',
        stones,
        markerTarget: makeMarker(moves.at(-1), 'entering'),
        waitStoneIds: stones
          .filter((stone) => stone.status === 'entering' && waiting.has(stone.id))
          .map((stone) => stone.id),
        line: makeLine(winningLine, winningLine.length >= 5 ? 'entering' : 'stable'),
        operationToken: freshToken && transition.kind === 'next' ? token : null
      });
    } else if (removedOne) {
      if (current.operationToken && transition?.kind !== 'previous') {
        complete(current.operationToken);
      }

      const removedIndex = prior.moves.length - 1;

      const exiting = current.stones.find((stone) => stone.index === removedIndex);

      dispatch({
        type: 'REWIND',
        stones: current.stones
          .filter((stone) => stone.index <= removedIndex)
          .map((stone) =>
            stone.index === removedIndex
              ? {
                  ...stone,
                  status: 'exiting',
                  delay: 0
                }
              : stone
          ),
        markerTarget: makeMarker(moves.at(-1), 'entering'),
        waitStoneIds: exiting ? [exiting.id] : [],
        operationToken: freshToken && transition.kind === 'previous' ? token : null
      });
    } else if (prefix !== moves.length || prior.moves.length !== moves.length) {
      complete(current.operationToken);

      dispatch({
        type: 'REPLACE',
        stones: moves.map((move, index) => makeStone(move, index, 'stable')),
        marker: makeMarker(moves.at(-1), 'stable'),
        line: makeLine(winningLine, 'stable')
      });

      if (freshToken) {
        complete(token);
      }
    } else if (!sameLine(prior.line, winningLine)) {
      dispatch({
        type: 'SYNC_LINE',
        line:
          winningLine.length >= 5
            ? makeLine(winningLine, 'entering')
            : current.line
              ? {
                  ...current.line,
                  status: 'exiting'
                }
              : null
      });
    } else if (freshToken) {
      complete(token);
    }

    previous.current = {
      gameId,
      moves: copyMoves(moves),
      line: copyLine(winningLine),
      transitionToken: token
    };
  }, [gameId, moves, winningLine, transition, makeStone, makeMarker, makeLine, complete]);

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

  const transitioning = useMemo(
    () =>
      visual.clearStoneIds !== null ||
      visual.waitStoneIds.length > 0 ||
      visual.markerTarget !== null ||
      visual.stones.some((stone) => stone.status !== 'stable') ||
      (visual.marker !== null && visual.marker.status !== 'stable') ||
      (visual.line !== null && visual.line.status !== 'stable'),
    [visual]
  );

  useLayoutEffect(() => {
    if (visual.operationToken != null && !transitioning) {
      complete(visual.operationToken);
    }
  }, [visual.operationToken, transitioning, complete]);

  return {
    ...visual,
    transitioning,
    finishStone,
    finishMarker,
    finishLine
  };
}
