export const DEFAULT_HISTORY_SORT = Object.freeze({
  col: 'id',
  asc: false
});

const SORT_COLUMNS = new Set(['id', 'moves', 'duration', 'result']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const isInteger = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;

const validSlot = (value) => value === 1 || value === 2;
const terminal = (winner) => winner !== 0;

const latestTimestamp = (first, second) => {
  const firstTime = Date.parse(first);
  const secondTime = Date.parse(second);

  if (Number.isFinite(firstTime) && Number.isFinite(secondTime)) {
    return firstTime >= secondTime ? first : second;
  }

  return first >= second ? first : second;
};

const slot1Won = (game) =>
  (game.winner_color === 1 && game.black_slot === 1) ||
  (game.winner_color === 2 && game.white_slot === 1);

const gameSideOrder = (game) => (game.black_slot === 1 ? 0 : 1);

const normalizeGame = (game) => {
  if (
    !isRecord(game) ||
    !isInteger(game.id, 1) ||
    typeof game.external_id !== 'string' ||
    !game.external_id ||
    typeof game.group_id !== 'string' ||
    !game.group_id ||
    typeof game.run_id !== 'string' ||
    !game.run_id ||
    typeof game.timestamp !== 'string' ||
    !game.timestamp ||
    !isInteger(game.winner_color) ||
    game.winner_color > 4 ||
    !isInteger(game.move_count) ||
    !validSlot(game.black_slot) ||
    !validSlot(game.white_slot) ||
    game.black_slot === game.white_slot ||
    !isInteger(game.board_size, 1) ||
    !isInteger(game.opening_len) ||
    !isInteger(game.duration)
  ) {
    throw new Error('Invalid tournament game');
  }

  return {
    id: game.id,
    external_id: game.external_id,
    group_id: game.group_id,
    run_id: game.run_id,
    timestamp: game.timestamp,
    winner_color: game.winner_color,
    move_count: game.move_count,
    black_slot: game.black_slot,
    white_slot: game.white_slot,
    board_size: game.board_size,
    opening_len: game.opening_len,
    duration: game.duration
  };
};

const summarizeGames = (groupId, games) => {
  const ordered = [...games].sort(
    (first, second) => gameSideOrder(first) - gameSideOrder(second) || first.id - second.id
  );

  const moveCounts = ordered.map((game) => game.move_count);

  return {
    group_id: groupId,
    pair_size: ordered.length,
    latest_ts: ordered.reduce(
      (latest, game) => latestTimestamp(latest, game.timestamp),
      ordered[0].timestamp
    ),
    max_id: Math.max(...ordered.map((game) => game.id)),
    min_moves: Math.min(...moveCounts),
    max_moves: Math.max(...moveCounts),
    live_count: ordered.filter((game) => game.winner_color === 0).length,
    duration: Math.max(...ordered.map((game) => game.duration)),
    slot1_wins: ordered.filter(slot1Won).length,
    games: ordered
  };
};

export const normalizePair = (pair) => {
  if (
    !isRecord(pair) ||
    typeof pair.group_id !== 'string' ||
    !pair.group_id ||
    !isInteger(pair.pair_size, 1) ||
    typeof pair.latest_ts !== 'string' ||
    !pair.latest_ts ||
    !isInteger(pair.max_id, 1) ||
    !isInteger(pair.min_moves) ||
    !isInteger(pair.max_moves) ||
    !isInteger(pair.live_count) ||
    !isInteger(pair.duration) ||
    !isInteger(pair.slot1_wins) ||
    !Array.isArray(pair.games)
  ) {
    throw new Error('Invalid tournament pair');
  }

  const games = pair.games.map(normalizeGame);

  if (pair.pair_size !== games.length || games.some((game) => game.group_id !== pair.group_id)) {
    throw new Error('Invalid tournament pair membership');
  }

  return summarizeGames(pair.group_id, games);
};

export const normalizePairs = (pairs) => {
  if (!Array.isArray(pairs)) {
    throw new Error('Invalid tournament history');
  }

  return pairs.map(normalizePair);
};

const sameGameIdentity = (current, incoming) =>
  current.id === incoming.id &&
  current.external_id === incoming.external_id &&
  current.group_id === incoming.group_id &&
  current.run_id === incoming.run_id &&
  current.black_slot === incoming.black_slot &&
  current.white_slot === incoming.white_slot &&
  current.board_size === incoming.board_size &&
  current.opening_len === incoming.opening_len;

const mergeGame = (current, incoming) => {
  if (!current) return incoming;
  if (!sameGameIdentity(current, incoming)) return current;

  const winner = terminal(current.winner_color) ? current.winner_color : incoming.winner_color;

  return {
    ...current,
    timestamp: latestTimestamp(current.timestamp, incoming.timestamp),
    winner_color: winner,
    move_count: Math.max(current.move_count, incoming.move_count),
    duration: Math.max(current.duration, incoming.duration)
  };
};

export const mergePair = (current, incoming) => {
  if (!current) return incoming;
  if (current.group_id !== incoming.group_id) return current;

  const games = new Map(current.games.map((game) => [String(game.id), game]));

  for (const game of incoming.games) {
    const key = String(game.id);

    games.set(key, mergeGame(games.get(key), game));
  }

  return summarizeGames(current.group_id, [...games.values()]);
};

export const validHistorySort = (sort) =>
  isRecord(sort) && SORT_COLUMNS.has(sort.col) && typeof sort.asc === 'boolean';

export const nextHistorySort = (current, column) => {
  if (!SORT_COLUMNS.has(column)) {
    throw new Error('Invalid history sort');
  }

  return current.col === column
    ? {
        col: column,
        asc: !current.asc
      }
    : {
        col: column,
        asc: false
      };
};

const compareNumber = (first, second, ascending) => (ascending ? first - second : second - first);

export const comparePairs = (first, second, sort) => {
  if (!validHistorySort(sort)) {
    throw new Error('Invalid history sort');
  }

  let result = 0;

  if (sort.col === 'id') {
    result = compareNumber(first.max_id, second.max_id, sort.asc);
  } else if (sort.col === 'moves') {
    result = compareNumber(
      sort.asc ? first.min_moves : first.max_moves,
      sort.asc ? second.min_moves : second.max_moves,
      sort.asc
    );
  } else if (sort.col === 'duration') {
    result = compareNumber(first.duration, second.duration, sort.asc);
  } else {
    result = compareNumber(first.live_count, second.live_count, sort.asc);

    if (result === 0) {
      result = compareNumber(first.slot1_wins, second.slot1_wins, sort.asc);
    }
  }

  if (result === 0 && sort.col !== 'id') {
    result = second.max_id - first.max_id;
  }

  if (result === 0) {
    result = first.group_id.localeCompare(second.group_id);
  }

  return result;
};

export const sortedHistoryPairs = (pairs, sort) =>
  [...pairs.values()].sort((first, second) => comparePairs(first, second, sort));

export const historyCursor = (pair, sort) => {
  if (!pair) return null;

  const cursor = {
    id: pair.max_id
  };

  if (sort.col === 'moves') {
    cursor.value = sort.asc ? pair.min_moves : pair.max_moves;
  } else if (sort.col === 'duration') {
    cursor.value = pair.duration;
  } else if (sort.col === 'result') {
    cursor.value = pair.live_count;
    cursor.secondary = pair.slot1_wins;
  }

  return JSON.stringify(cursor);
};

const installPairs = (current, pairs, replace) => {
  const next = replace ? new Map() : new Map(current);

  for (const pair of pairs) {
    next.set(pair.group_id, mergePair(next.get(pair.group_id), pair));
  }

  return next;
};

const installSnapshots = (current, pairs, buffered, replace) =>
  installPairs(installPairs(current, pairs, replace), buffered || [], false);

export const tournamentHistoryReducer = (state, action) => {
  if (action.type === 'CLEAR') {
    return new Map();
  }

  if (action.type === 'SET') {
    return installSnapshots(new Map(), action.pairs, action.buffered, true);
  }

  if (action.type === 'APPEND') {
    return installSnapshots(state, action.pairs, action.buffered, false);
  }

  if (action.type === 'UPSERT') {
    return installPairs(state, [action.pair], false);
  }

  if (action.type === 'UPSERT_MANY') {
    return installPairs(state, action.pairs, false);
  }

  return state;
};
