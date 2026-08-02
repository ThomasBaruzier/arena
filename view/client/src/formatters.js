export const formatDuration = (value) => {
  if (value == null || value === '') return '-';

  const milliseconds = Number(value);

  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '-';
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;

  if (milliseconds < 10000) {
    const seconds = Math.floor(milliseconds / 100) / 10;
    return `${String(seconds).replace(/\.0$/, '')}s`;
  }

  const totalSeconds = Math.floor(milliseconds / 1000);

  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes}m${String(totalSeconds % 60).padStart(2, '0')}s`;
  }

  const hours = Math.floor(totalMinutes / 60);

  if (hours >= 100) return '100h+';

  return `${hours}h${String(totalMinutes % 60).padStart(2, '0')}`;
};

export const formatGameId = (value) => {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1) return '#-';
  return id > 999999 ? '#999999+' : `#${id}`;
};
