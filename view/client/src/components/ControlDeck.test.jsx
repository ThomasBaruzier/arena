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
    transition: null,
    visualTransitioning: false,
    ...callbacks,
    ...overrides
  };

  const view = render(<ControlDeck {...values} />);

  const rerenderDeck = (next = {}) => {
    Object.assign(values, next);
    view.rerender(<ControlDeck {...values} />);
  };

  return {
    ...callbacks,
    rerenderDeck
  };
};

describe('ControlDeck', () => {
  it('orders replay, play, previous, and next', () => {
    renderDeck();

    expect(
      [...screen.getByLabelText('Game playback').querySelectorAll('.playback button')].map(
        (button) => button.getAttribute('aria-label')
      )
    ).toEqual(['Replay from start', 'Play playback', 'Previous move', 'Next move']);
  });

  it('delegates explicit manual operations', () => {
    const callbacks = renderDeck();

    fireEvent.click(screen.getByLabelText('Replay from start'));
    fireEvent.click(screen.getByLabelText('Previous move'));
    fireEvent.click(screen.getByLabelText('Next move'));

    expect(callbacks.replayFromStart).toHaveBeenCalledTimes(1);
    expect(callbacks.previousMove).toHaveBeenCalledTimes(1);
    expect(callbacks.nextMove).toHaveBeenCalledTimes(1);
  });

  it('locks Play and manual movement for a tokenized transition', () => {
    renderDeck({
      transition: {
        token: 1,
        kind: 'previous'
      }
    });

    expect(screen.getByLabelText('Replay from start')).toBeDisabled();
    expect(screen.getByLabelText('Previous move')).toBeDisabled();
    expect(screen.getByLabelText('Next move')).toBeDisabled();
    expect(screen.getByLabelText('Play playback')).toBeDisabled();
  });

  it('keeps Pause available during automatic board motion', () => {
    const callbacks = renderDeck({
      isPlaying: true,
      visualTransitioning: true
    });

    expect(screen.getByLabelText('Pause playback')).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('Pause playback'));

    expect(callbacks.setIsPlaying).toHaveBeenCalledWith(false);
  });

  it('unlocks when the explicit transition is cleared', () => {
    const callbacks = renderDeck({
      transition: {
        token: 1,
        kind: 'previous'
      }
    });

    expect(screen.getByLabelText('Previous move')).toBeDisabled();

    callbacks.rerenderDeck({
      transition: null,
      visualTransitioning: false
    });

    expect(screen.getByLabelText('Previous move')).not.toBeDisabled();
    expect(screen.getByLabelText('Play playback')).not.toBeDisabled();
  });

  it('selects speed independently', () => {
    const callbacks = renderDeck();

    fireEvent.click(
      screen.getByRole('button', {
        name: '2x'
      })
    );

    expect(callbacks.setSpeed).toHaveBeenCalledWith(2);
  });
});
