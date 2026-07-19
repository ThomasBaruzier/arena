import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGamePlayback } from './useGamePlayback';

describe('useGamePlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes correctly', () => {
    const { result } = renderHook(() => useGamePlayback(10));
    expect(result.current.moveIndex).toBe(0);
    expect(result.current.isPlaying).toBe(false);
  });

  it('increments move index when playing', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.moveIndex).toBe(1);
  });

  it('stops playing when reaching total moves', () => {
    const { result } = renderHook(() => useGamePlayback(2));

    act(() => {
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.moveIndex).toBe(2);
    expect(result.current.isPlaying).toBe(false);
  });

  it('adjusts speed correctly', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setSpeed(3);
      result.current.setIsPlaying(true);
    });

    act(() => {
      vi.advanceTimersByTime(55);
    });

    expect(result.current.moveIndex).toBe(1);
  });
});
