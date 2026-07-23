export const BOARD_SIZE = 20;

const parseVersion = (v) =>
  String(v)
    .split(/[.-]/)
    .map(Number)
    .filter((n) => !isNaN(n));

const compareVersionsOnly = (a, b) => {
  const v1 = parseVersion(a);
  const v2 = parseVersion(b);
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const diff = (v1[i] || 0) - (v2[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const numericMtime = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const compareHeroOrder = (p1, p2) => {
  if (p1.name === p2.name) {
    const versionDiff = compareVersionsOnly(p1.version, p2.version);
    if (versionDiff !== 0) return versionDiff;
  } else {
    const m1 = numericMtime(p1.mtime ?? p1.p1_mtime);
    const m2 = numericMtime(p2.mtime ?? p2.p2_mtime);
    if (m1 !== null && m2 !== null && m1 !== m2) return m1 - m2;
  }

  const nameDiff = p2.name.localeCompare(p1.name);
  if (nameDiff !== 0) return nameDiff;
  return String(p1.version).localeCompare(String(p2.version));
};

export const compareVersions = compareHeroOrder;

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

export const getRunId = (value) => value?.runId || value?.run_id || value?.id || value?.tournamentId || value?.tournament_id || 'legacy';

export const getEventRunId = (event) =>
  event?.game?.run_id || event?.run_id || event?.run?.id || event?.game?.tournament_id || event?.tournament_id || 'legacy';

export const playerPairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

export const samePlayerPair = (a, b, c, d) => playerPairKey(a, b) === playerPairKey(c, d);

export const matchupKey = (m) => {
  const tid = getRunId(m);
  const minId = Math.min(m.hero.id, m.villain.id);
  const maxId = Math.max(m.hero.id, m.villain.id);
  return `${tid}-${minId}-${maxId}`;
};
