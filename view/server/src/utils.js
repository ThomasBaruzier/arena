export const parseExternalGameId = (externalId = '') => {
  externalId = externalId == null ? '' : String(externalId);
  const last = externalId.lastIndexOf('_');
  const candidateGroupId = last >= 0 ? externalId.substring(0, last) : externalId;
  const prev = candidateGroupId.lastIndexOf('_');
  const inferredRunId = prev >= 0 ? candidateGroupId.substring(0, prev) : candidateGroupId;
  const valid = inferredRunId ? /^_\d+_\d+$/.test(externalId.slice(inferredRunId.length)) : false;
  return {
    groupId: valid ? candidateGroupId : externalId,
    inferredRunId,
    valid
  };
};

export const compareVersions = (p1, p2) => {
  const nameDiff = p2.name.localeCompare(p1.name);
  if (nameDiff !== 0) return nameDiff;

  const parse = (v) =>
    String(v)
      .split(/[.-]/)
      .map(Number)
      .filter((n) => !isNaN(n));
  const v1 = parse(p1.version);
  const v2 = parse(p2.version);
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const diff = (v1[i] || 0) - (v2[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};
