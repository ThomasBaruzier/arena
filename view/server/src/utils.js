export const groupIdFromExternalId = (externalId = '') => {
  externalId = externalId == null ? '' : String(externalId);
  const last = externalId.lastIndexOf('_');
  const groupId = last >= 0 ? externalId.substring(0, last) : externalId;
  return /^.+_\d+_\d+$/.test(externalId) ? groupId : externalId;
};

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
  }

  const m1 = numericMtime(p1.mtime ?? p1.p1_mtime);
  const m2 = numericMtime(p2.mtime ?? p2.p2_mtime);
  if (m1 !== null && m2 !== null && m1 !== m2) return m1 - m2;

  const nameDiff = p2.name.localeCompare(p1.name);
  if (nameDiff !== 0) return nameDiff;
  return String(p1.version).localeCompare(String(p2.version));
};

export const compareVersions = compareHeroOrder;
