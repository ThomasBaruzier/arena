export const BOARD_SIZE = 20;

export const compareVersions = (p1, p2) => {
  const parse = (v) =>
    String(v)
      .split(/[.-]/)
      .map(Number)
      .filter((n) => !isNaN(n));
  const v1 = parse(p1.version);
  const v2 = parse(p2.version);
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const diff = (v1[i] || 0) - (v2[i] || 0);
    if (diff) return diff;
  }
  return p1.name.localeCompare(p2.name);
};

export const parseMoves = (str) => {
  if (!str) return [];
  return str
    .split(';')
    .filter(Boolean)
    .map((m) => {
      const [x, y, c] = m.split(',').map(Number);
      return { x, y, c };
    });
};

export const getWinningLine = (moves, winnerColor) => {
  if (!moves.length || !winnerColor || winnerColor === 3) return [];
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  moves.forEach(({ x, y, c }) => {
    if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) board[y][x] = c;
  });

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== winnerColor) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
      ]) {
        const line = [{ x, y }];
        for (let k = 1; ; k++) {
          const ny = y + dy * k;
          const nx = x + dx * k;
          if (board[ny]?.[nx] === winnerColor) line.push({ x: nx, y: ny });
          else break;
        }
        if (line.length >= 5) return line;
      }
    }
  }
  return [];
};

export const matchupKey = (m) => {
  const tid = m.tournamentId || 'legacy';
  const minId = Math.min(m.hero.id, m.villain.id);
  const maxId = Math.max(m.hero.id, m.villain.id);
  return `${tid}-${minId}-${maxId}`;
};
