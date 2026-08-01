import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEventSource } from './useEventSource';

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;

    FakeEventSource.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  message(data) {
    this.onmessage?.({
      data: JSON.stringify(data)
    });
  }

  fail() {
    this.onerror?.();
  }

  close() {
    this.closed = true;
  }
}

const currentSource = () => FakeEventSource.instances.at(-1);

describe('useEventSource', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];

    vi.useFakeTimers();

    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not count the first connection as a reconnect', () => {
    const { result } = renderHook(() => useEventSource('/api/events'));

    act(() => {
      currentSource().open();
    });

    expect(result.current.isConnected).toBe(true);

    expect(result.current.connectionEpoch).toBe(0);
  });

  it('increments once per successful reconnect', () => {
    const { result } = renderHook(() => useEventSource('/api/events'));

    act(() => {
      currentSource().open();
      currentSource().fail();
      vi.advanceTimersByTime(2000);
    });

    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => {
      currentSource().open();
    });

    expect(result.current.connectionEpoch).toBe(1);

    act(() => {
      currentSource().fail();
      vi.advanceTimersByTime(2000);
      currentSource().open();
    });

    expect(result.current.connectionEpoch).toBe(2);
  });

  it('publishes generation and active-source events', () => {
    const listener = vi.fn();

    const { result } = renderHook(() => useEventSource('/api/events'));

    act(() => {
      result.current.subscribe(listener);

      currentSource().open();

      currentSource().message({
        type: 'connected',
        generation: 'viewer-2'
      });
    });

    expect(result.current.generation).toBe('viewer-2');

    expect(listener).toHaveBeenCalledWith({
      type: 'connected',
      generation: 'viewer-2'
    });
  });

  it('ignores messages from a replaced source', () => {
    const listener = vi.fn();

    const { result } = renderHook(() => useEventSource('/api/events'));

    act(() => {
      result.current.subscribe(listener);
    });

    const first = currentSource();

    act(() => {
      first.open();
      first.fail();
      vi.advanceTimersByTime(2000);
    });

    const second = currentSource();

    act(() => {
      first.message({
        type: 'stale'
      });

      second.open();

      second.message({
        type: 'current',
        generation: 'new'
      });
    });

    expect(listener).toHaveBeenCalledTimes(1);

    expect(listener).toHaveBeenCalledWith({
      type: 'current',
      generation: 'new'
    });
  });

  it('closes the active source on unmount', () => {
    const { unmount } = renderHook(() => useEventSource('/api/events'));

    const active = currentSource();

    unmount();

    expect(active.closed).toBe(true);
  });
});
