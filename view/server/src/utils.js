export const groupIdFromExternalId = (externalId = '') => {
  const value = externalId == null ? '' : String(externalId);
  const last = value.lastIndexOf('_');

  return /^.+_\d+_\d+$/.test(value) ? value.substring(0, last) : value;
};
