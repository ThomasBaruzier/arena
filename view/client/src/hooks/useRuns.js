import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export function useRuns(subscribe) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(() => {
    fetch(`${API_BASE}/runs`)
      .then((r) => r.json())
      .then(setRuns)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRuns();
    const onFocus = () => fetchRuns();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchRuns]);

  useEffect(() => {
    return subscribe((e) => {
      if (e.type === 'reset') fetchRuns();
      else if (e.type === 'run_start') setRuns((p) => [e.run, ...p]);
      else if (e.type === 'run_update')
        setRuns((p) => p.map((r) => (r.id === e.run.id ? { ...r, ...e.run } : r)));
      else if (e.type === 'run_delete') setRuns((p) => p.filter((r) => r.id !== e.run_id));
    });
  }, [subscribe, fetchRuns]);

  return { runs, loading };
}
