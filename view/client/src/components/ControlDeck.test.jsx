import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ControlDeck from './ControlDeck';

const renderDeck = (overrides = {}) => {
  const callbacks = {
    setIsPlaying: vi.fn(),
    replayFromStart: vi.fn(),
    previousMove: vi.fn(),
    nextMove: vi.fn(),
    setSpeed: vi.fn()
  };
  const values = {
    isPlaying: false,
    totalMoves: 20,
    moveIndex: 8,
    speed: 1,
    ...callbacks,
    ...overrides
  };
  const view = render(<ControlDeck {...values} />);

  return {
    ...callbacks,
    rerenderDeck: (next = {}) => {
      Object.assign(values, next);
      view.rerender(<ControlDeck {...values} />);
    }
  };
};

describe('ControlDeck', () => {
  it('orders replay, play, previous, and next', () => {
    renderDeck();

    expect(
      [
        ...screen.getByLabelText('Game playback').querySelectorAll('.playback button')
      ].map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Replay from start', 'Play playback', 'Previous move', 'Next move']);
  });

  it('delegates every manual operation immediately', () => {
    const callbacks = renderDeck();

    fireEvent.click(screen.getByLabelText('Replay from start'));
    fireEvent.click(screen.getByLabelText('Previous move'));
    fireEvent.click(screen.getByLabelText('Next move'));

    expect(callbacks.replayFromStart).toHaveBeenCalledTimes(1);
    expect(callbacks.previousMove).toHaveBeenCalledTimes(1);
    expect(callbacks.nextMove).toHaveBeenCalledTimes(1);
  });

  it('disables navigation only at positional boundaries', () => {
    const callbacks = renderDeck({
      moveIndex: 0,
      totalMoves: 3
    });

    expect(screen.getByLabelText('Replay from start')).toBeDisabled();
    expect(screen.getByLabelText('Previous move')).toBeDisabled();
    expect(screen.getByLabelText('Next move')).not.toBeDisabled();

    callbacks.rerenderDeck({
      moveIndex: 3
    });

    expect(screen.getByLabelText('Replay from start')).not.toBeDisabled();
    expect(screen.getByLabelText('Previous move')).not.toBeDisabled();
    expect(screen.getByLabelText('Next move')).toBeDisabled();
    expect(screen.getByLabelText('Play playback')).toBeDisabled();
  });

  it('keeps Pause available at the end while playback settles', () => {
    const callbacks = renderDeck({
      isPlaying: true,
      moveIndex: 3,
      totalMoves: 3
    });
    const pause = screen.getByLabelText('Pause playback');

    expect(pause).not.toBeDisabled();

    fireEvent.click(pause);

    expect(callbacks.setIsPlaying).toHaveBeenCalledWith(false);
  });

  it('disables Play only when there is no playable range', () => {
    const callbacks = renderDeck({
      moveIndex: 0,
      totalMoves: 0
    });

    expect(screen.getByLabelText('Play playback')).toBeDisabled();

    callbacks.rerenderDeck({
      totalMoves: 1
    });

    expect(screen.getByLabelText('Play playback')).not.toBeDisabled();
  });

  it('selects speed independently', () => {
    const callbacks = renderDeck();

    fireEvent.click(screen.getByRole('button', { name: '2x' }));

    expect(callbacks.setSpeed).toHaveBeenCalledWith(2);
  });
});
