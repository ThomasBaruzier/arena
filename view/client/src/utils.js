export const DEFAULT_BOARD_SIZE = 20;

export const parseMoves = (value) => {
  if (!value) {
    return [];
  }

  return value
    .split(';')
    .filter(Boolean)
    .map((move) => {
      const [x, y, c] = move.split(',').map(Number);
      return { x, y, c };
    });
};

export const getWinningLine = (moves, winnerColor, boardSize = DEFAULT_BOARD_SIZE) => {
  if (!moves.length || !winnerColor || winnerColor === 3 || winnerColor === 4) {
    return [];
  }

  const board = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));

  for (const { x, y, c } of moves) {
    if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
      board[y][x] = c;
    }
  }

  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      if (board[y][x] !== winnerColor) {
        continue;
      }

      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
      ]) {
        const line = [{ x, y }];

        for (let distance = 1; ; distance += 1) {
          const previousX = x - dx * distance;
          const previousY = y - dy * distance;

          if (board[previousY]?.[previousX] !== winnerColor) {
            break;
          }

          line.unshift({
            x: previousX,
            y: previousY
          });
        }

        for (let distance = 1; ; distance += 1) {
          const nextX = x + dx * distance;
          const nextY = y + dy * distance;

          if (board[nextY]?.[nextX] !== winnerColor) {
            break;
          }

          line.push({
            x: nextX,
            y: nextY
          });
        }

        if (line.length >= 5) {
          return line;
        }
      }
    }
  }

  return [];
};

export const getRunId = (value) => value?.runId || value?.run_id || null;

export const getEventRunId = (event) =>
  event?.game?.run_id || event?.run_id || event?.run?.id || null;

export const slotPairKey = (first, second) =>
  `${Math.min(first, second)}-${Math.max(first, second)}`;

export const sameSlotPair = (first, second, black, white) =>
  slotPairKey(first, second) === slotPairKey(black, white);

export const matchupKey = (matchup) => getRunId(matchup);
