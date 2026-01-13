import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGamePlayback } from './useGamePlayback';

describe('useGamePlayback', () => {
  it('initializes correctly', () => {
    const { result } = renderHook(() => useGamePlayback(10));
    expect(result.current.moveIndex).toBe(10);
  });

  it('sets move index correctly', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
    });

    expect(result.current.moveIndex).toBe(5);
  });

  it('clamps move index within bounds', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(15);
    });
    expect(result.current.moveIndex).toBe(10);

    act(() => {
      result.current.setMoveIndex(-5);
    });
    expect(result.current.moveIndex).toBe(0);
  });

  it('handles function updates', () => {
    const { result } = renderHook(() => useGamePlayback(10));

    act(() => {
      result.current.setMoveIndex(5);
    });

    act(() => {
      result.current.setMoveIndex((prev) => prev + 1);
    });

    expect(result.current.moveIndex).toBe(6);
  });
});
