import { useCallback, useEffect, useRef, useState } from 'react';

export function useEventSource(url) {
  const listeners = useRef(new Set());
  const source = useRef(null);
  const reconnectTimer = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [generation, setGeneration] = useState(null);
  const [connectionEpoch, setConnectionEpoch] = useState(0);

  useEffect(() => {
    let mounted = true;
    let opened = false;

    const connect = () => {
      if (!mounted) return;

      clearTimeout(reconnectTimer.current);

      source.current?.close();
      setIsConnected(false);

      const eventSource = new EventSource(url);

      source.current = eventSource;

      eventSource.onopen = () => {
        if (!mounted || source.current !== eventSource) {
          return;
        }

        setIsConnected(true);

        if (opened) {
          setConnectionEpoch((current) => current + 1);
        } else {
          opened = true;
        }
      };

      eventSource.onmessage = (event) => {
        if (!mounted || source.current !== eventSource) {
          return;
        }

        try {
          const data = JSON.parse(event.data);

          if (typeof data.generation === 'string' && data.generation) {
            setGeneration(data.generation);
          }

          listeners.current.forEach((listener) => listener(data));
        } catch (error) {
          console.warn('SSE error:', error);
        }
      };

      eventSource.onerror = () => {
        if (!mounted || source.current !== eventSource) {
          return;
        }

        setIsConnected(false);
        eventSource.close();

        reconnectTimer.current = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      mounted = false;
      clearTimeout(reconnectTimer.current);
      source.current?.close();
      source.current = null;
    };
  }, [url]);

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);

    return () => listeners.current.delete(listener);
  }, []);

  return {
    subscribe,
    isConnected,
    generation,
    connectionEpoch
  };
}
