import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYBACK_DELAYS, useGamePlayback } from './useGamePlayback';

describe('useGamePlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses exact playback delays', () => {
    expect(PLAYBACK_DELAYS).toEqual([1000, 500, 50]);
  });

  it.each([
    [1, 1000],
    [2, 500],
    [3, 50]
  ])('advances speed %i after %ims', (speed, delay) => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setSpeed(speed);
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(delay - 1);
    });

    expect(result.current.moveIndex).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.moveIndex).toBe(1);
    expect(result.current.motion).toMatchObject({ kind: 'next' });
  });

  it('synchronizes before a new total has rendered', () => {
    const { result, rerender } = renderHook(({ total }) => useGamePlayback(total), {
      initialProps: { total: 0 }
    });

    act(() => {
      result.current.setMoveIndex(9);
    });

    expect(result.current.moveIndex).toBe(9);

    rerender({ total: 9 });

    expect(result.current.moveIndex).toBe(9);
  });

  it('replays immediately without a completion acknowledgement', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
      result.current.setIsPlaying(true);
    });

    let changed;

    act(() => {
      changed = result.current.replayFromStart();
    });

    expect(changed).toBe(true);
    expect(result.current.moveIndex).toBe(0);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.motion).toMatchObject({ kind: 'replay' });
  });

  it('accepts repeated and opposite manual commands synchronously', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
      result.current.previousMove();
      result.current.previousMove();
      result.current.previousMove();
      result.current.nextMove();
      result.current.previousMove();
    });

    expect(result.current.moveIndex).toBe(2);
    expect(result.current.motion).toMatchObject({ kind: 'previous' });
  });

  it('accepts Next immediately after Replay', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(8);
      result.current.replayFromStart();
      result.current.nextMove();
    });

    expect(result.current.moveIndex).toBe(1);
    expect(result.current.motion).toMatchObject({ kind: 'next' });
  });

  it('increments the motion token for each accepted target', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(4);
    });

    const first = result.current.motion.token;

    act(() => {
      result.current.previousMove();
    });

    const second = result.current.motion.token;

    act(() => {
      result.current.nextMove();
    });

    expect(second).toBeGreaterThan(first);
    expect(result.current.motion.token).toBeGreaterThan(second);
  });

  it('does not move beyond positional boundaries', () => {
    const { result } = renderHook(() => useGamePlayback(2));
    let changed;

    act(() => {
      changed = result.current.previousMove();
    });

    expect(changed).toBe(false);

    act(() => {
      result.current.setMoveIndex(2);
      changed = result.current.nextMove();
    });

    expect(changed).toBe(false);
    expect(result.current.moveIndex).toBe(2);
  });

  it('continues 3x playback every 50ms without visual acknowledgements', () => {
    const { result } = renderHook(() => useGamePlayback(5));

    act(() => {
      result.current.setSpeed(3);
      result.current.setIsPlaying(true);
    });

    for (let expected = 1; expected <= 5; expected += 1) {
      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(result.current.moveIndex).toBe(expected);
    }

    expect(result.current.isPlaying).toBe(false);
  });

  it('stops at the final move without replaying', () => {
    const { result } = renderHook(() => useGamePlayback(2));

    act(() => {
      result.current.setSpeed(3);
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(result.current.moveIndex).toBe(1);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(result.current.moveIndex).toBe(2);
    expect(result.current.isPlaying).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.moveIndex).toBe(2);
  });

  it('clears pending playback when paused', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    act(() => {
      result.current.setIsPlaying(false);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.moveIndex).toBe(0);
  });

  it('clamps the index when the game becomes shorter', () => {
    const { result, rerender } = renderHook(({ total }) => useGamePlayback(total), {
      initialProps: { total: 10 }
    });

    act(() => {
      result.current.setMoveIndex(8);
    });

    rerender({ total: 3 });

    expect(result.current.moveIndex).toBe(3);
    expect(result.current.motion).toMatchObject({ kind: 'sync' });
  });
});
