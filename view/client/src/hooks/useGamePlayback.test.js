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
  });

  it('locks Replay with an explicit token', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
      result.current.setIsPlaying(true);
    });

    act(() => {
      result.current.replayFromStart();
    });

    expect(result.current.moveIndex).toBe(0);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.transition).toEqual({
      token: 1,
      kind: 'replay'
    });

    act(() => {
      result.current.completeTransition(1);
    });

    expect(result.current.transition).toBeNull();
  });

  it('ignores another manual command while locked', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
    });

    act(() => {
      result.current.previousMove();
      result.current.previousMove();
      result.current.nextMove();
    });

    expect(result.current.moveIndex).toBe(4);
    expect(result.current.transition).toEqual({
      token: 1,
      kind: 'previous'
    });
  });

  it('ignores completion from an older token', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
      result.current.previousMove();
    });

    act(() => {
      result.current.completeTransition(99);
    });

    expect(result.current.transition).toEqual({
      token: 1,
      kind: 'previous'
    });
  });

  it('cancels a superseded transition directly', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
      result.current.previousMove();
    });

    act(() => {
      result.current.cancelTransition();
    });

    expect(result.current.transition).toBeNull();

    act(() => {
      result.current.nextMove();
    });

    expect(result.current.transition).toEqual({
      token: 2,
      kind: 'next'
    });
  });

  it('does not advance autoplay while a manual transition is active', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
      result.current.previousMove();
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.moveIndex).toBe(4);
  });

  it('stops at the final move', () => {
    const { result } = renderHook(() => useGamePlayback(2));

    act(() => {
      result.current.setSpeed(3);
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(result.current.moveIndex).toBe(2);
    expect(result.current.isPlaying).toBe(false);
  });

  it('clears pending playback when paused', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(500);
      result.current.setIsPlaying(false);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.moveIndex).toBe(0);
  });
});
