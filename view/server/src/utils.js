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
