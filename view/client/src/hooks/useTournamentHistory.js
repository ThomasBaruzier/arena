import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DEFAULT_HISTORY_SORT,
  historyCursor,
  nextHistorySort,
  normalizePair,
  normalizePairs,
  sortedHistoryPairs,
  tournamentHistoryReducer
} from '../model/tournamentHistory';

const API_BASE = '/api';
const PAGE_SIZE = 50;

const sameRun = (first, second) => String(first) === String(second);

const eventRunId = (event) =>
  event?.run_id ?? event?.game?.run_id ?? event?.pair?.games?.[0]?.run_id ?? null;

const requestUrl = (runId, sort, cursor) => {
  const params = new URLSearchParams({
    run_id: runId,
    sort: sort.col,
    order: sort.asc ? 'asc' : 'desc',
    limit: String(PAGE_SIZE)
  });

  if (cursor) {
    params.set('cursor', cursor);
  }

  return `${API_BASE}/games?${params}`;
};

const readPairs = async (response) => {
  if (!response.ok) {
    throw new Error('Tournament history request failed');
  }

  return normalizePairs(await response.json());
};

export function useTournamentHistory({
  runId,
  phase,
  preparationToken,
  subscribe,
  onPrepared
}) {
  const [pairsById, dispatch] = useReducer(tournamentHistoryReducer, new Map());
  const [sort, setSort] = useState(DEFAULT_HISTORY_SORT);
  const [pendingSort, setPendingSort] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [capacity, setCapacity] = useState(0);

  const pairsRef = useRef(pairsById);
  const sortRef = useRef(sort);
  const capacityRef = useRef(capacity);
  const cursorRef = useRef(cursor);
  const phaseRef = useRef(phase);
  const runRef = useRef(runId);
  const onPreparedRef = useRef(onPrepared);
  const preparedRequestRef = useRef(null);
  const preparedNoticeRef = useRef(null);
  const bufferRef = useRef([]);
  const requestRef = useRef({
    id: 0,
    controller: null,
    preparationToken: null
  });

  pairsRef.current = pairsById;
  sortRef.current = sort;
  capacityRef.current = capacity;
  cursorRef.current = cursor;
  phaseRef.current = phase;
  runRef.current = runId;
  onPreparedRef.current = onPrepared;

  const completePreparation = useCallback((token) => {
    if (
      token == null ||
      preparedRequestRef.current !== token ||
      preparedNoticeRef.current === token
    ) {
      return;
    }

    preparedNoticeRef.current = token;
    onPreparedRef.current();
  }, []);

  const requestPage = useCallback(
    async ({
      requestedSort,
      nextCursor = null,
      append = false,
      commitSort = false,
      prepareToken = null,
      blockingFailure = false,
      preserveError = false
    }) => {
      requestRef.current.controller?.abort();

      const controller = new AbortController();
      const requestId = requestRef.current.id + 1;

      requestRef.current = {
        id: requestId,
        controller,
        preparationToken: prepareToken
      };
      bufferRef.current = [];

      setFetching(true);
      setPaginationError(false);

      if (!append && !preserveError) {
        setError(false);
      }

      if (commitSort) {
        setPendingSort(requestedSort);
      }

      try {
        const response = await fetch(requestUrl(runId, requestedSort, nextCursor), {
          signal: controller.signal
        });
        const page = await readPairs(response);

        if (controller.signal.aborted || requestRef.current.id !== requestId) {
          return false;
        }

        const buffered = bufferRef.current;
        const nextCapacity = append ? capacityRef.current + PAGE_SIZE : PAGE_SIZE;

        bufferRef.current = [];

        dispatch({
          type: append ? 'APPEND' : 'SET',
          pairs: page,
          buffered
        });

        capacityRef.current = nextCapacity;
        setCapacity(nextCapacity);

        if (commitSort) {
          sortRef.current = requestedSort;
          setSort(requestedSort);
        }

        const next = page.length ? historyCursor(page.at(-1), requestedSort) : null;

        cursorRef.current = next;
        setCursor(next);
        setServerHasMore(page.length === PAGE_SIZE && Boolean(next));
        setError(false);

        return true;
      } catch (requestError) {
        if (
          requestError.name === 'AbortError' ||
          controller.signal.aborted ||
          requestRef.current.id !== requestId
        ) {
          return false;
        }

        const buffered = bufferRef.current;
        bufferRef.current = [];

        if (buffered.length > 0) {
          dispatch({
            type: 'UPSERT_MANY',
            pairs: buffered
          });

          if (capacityRef.current === 0) {
            capacityRef.current = PAGE_SIZE;
            setCapacity(PAGE_SIZE);
          }
        }

        const hasRows = pairsRef.current.size > 0 || buffered.length > 0;

        if (append) {
          setPaginationError(true);
        } else if (blockingFailure || !hasRows) {
          setError(true);
        }

        return false;
      } finally {
        if (requestRef.current.id === requestId) {
          requestRef.current = {
            id: requestId,
            controller: null,
            preparationToken: null
          };

          setFetching(false);

          if (commitSort) {
            setPendingSort(null);
          }

          completePreparation(prepareToken);
        }
      }
    },
    [runId, completePreparation]
  );

  useEffect(() => {
    requestRef.current.controller?.abort();
    requestRef.current = {
      id: requestRef.current.id + 1,
      controller: null,
      preparationToken: null
    };

    pairsRef.current = new Map();
    sortRef.current = DEFAULT_HISTORY_SORT;
    capacityRef.current = 0;
    cursorRef.current = null;
    preparedRequestRef.current = null;
    preparedNoticeRef.current = null;
    bufferRef.current = [];

    dispatch({ type: 'CLEAR' });
    setSort(DEFAULT_HISTORY_SORT);
    setPendingSort(null);
    setCursor(null);
    setServerHasMore(false);
    setFetching(false);
    setError(false);
    setPaginationError(false);
    setCapacity(0);
  }, [runId]);

  useEffect(() => {
    if (
      phase !== 'preparing' ||
      preparationToken == null ||
      preparedRequestRef.current === preparationToken
    ) {
      return undefined;
    }

    preparedRequestRef.current = preparationToken;
    preparedNoticeRef.current = null;

    requestPage({
      requestedSort: sortRef.current,
      prepareToken: preparationToken,
      blockingFailure: true
    });

    return () => {
      if (requestRef.current.preparationToken === preparationToken) {
        requestRef.current.controller?.abort();
      }
    };
  }, [phase, preparationToken, requestPage]);

  useEffect(
    () =>
      subscribe((event) => {
        if (!event?.pair || !sameRun(eventRunId(event), runRef.current)) {
          return;
        }

        let pair;

        try {
          pair = normalizePair(event.pair);
        } catch {
          return;
        }

        if (requestRef.current.controller) {
          bufferRef.current.push(pair);
        } else if (phaseRef.current !== 'closed' && capacityRef.current > 0) {
          dispatch({
            type: 'UPSERT',
            pair
          });
        }
      }),
    [subscribe]
  );

  useEffect(
    () => () => {
      requestRef.current.controller?.abort();
    },
    []
  );

  const sortBy = useCallback(
    (column) => {
      if (requestRef.current.controller) {
        return;
      }

      requestPage({
        requestedSort: nextHistorySort(sortRef.current, column),
        commitSort: true
      });
    },
    [requestPage]
  );

  const loadMore = useCallback(() => {
    if (requestRef.current.controller || error) {
      return;
    }

    if (serverHasMore && cursorRef.current) {
      requestPage({
        requestedSort: sortRef.current,
        nextCursor: cursorRef.current,
        append: true
      });
      return;
    }

    if (pairsById.size > capacityRef.current) {
      const nextCapacity = Math.min(pairsById.size, capacityRef.current + PAGE_SIZE);

      capacityRef.current = nextCapacity;
      setCapacity(nextCapacity);
    }
  }, [serverHasMore, pairsById.size, error, requestPage]);

  const retry = useCallback(() => {
    if (!requestRef.current.controller) {
      requestPage({
        requestedSort: sortRef.current,
        blockingFailure: true,
        preserveError: true
      });
    }
  }, [requestPage]);

  const retryPage = useCallback(() => {
    if (requestRef.current.controller || !serverHasMore || !cursorRef.current) {
      return;
    }

    requestPage({
      requestedSort: sortRef.current,
      nextCursor: cursorRef.current,
      append: true
    });
  }, [serverHasMore, requestPage]);

  const pairs = useMemo(
    () => sortedHistoryPairs(pairsById, sort).slice(0, capacity),
    [pairsById, sort, capacity]
  );

  return {
    pairs,
    sort,
    pendingSort,
    fetching,
    error,
    paginationError,
    hasMore: serverHasMore || pairsById.size > capacity,
    sortBy,
    loadMore,
    retry,
    retryPage
  };
}
