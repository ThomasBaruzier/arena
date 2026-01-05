import { useState, useEffect, useRef, useCallback } from 'react';

export function useEventSource(url) {
  const listeners = useRef(new Set());
  const es = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    let reconnectTimer;

    const connect = () => {
      if (!mounted) return;
      setIsConnected(false);
      es.current = new EventSource(url);
      es.current.onopen = () => setIsConnected(true);
      es.current.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          listeners.current.forEach((fn) => fn(data));
        } catch (err) {
          console.warn('SSE error:', err);
        }
      };
      es.current.onerror = () => {
        setIsConnected(false);
        es.current.close();
        if (mounted) reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      mounted = false;
      clearTimeout(reconnectTimer);
      es.current?.close();
    };
  }, [url]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return { subscribe, isConnected };
}
