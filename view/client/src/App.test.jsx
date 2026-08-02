import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

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

  emit(data) {
    this.onmessage?.({
      data: JSON.stringify(data)
    });
  }

  close() {
    this.closed = true;
  }
}

class FakeIntersectionObserver {
  observe() {}

  disconnect() {}
}

const response = (data, generation = null) => ({
  ok: true,
  headers: {
    get: (name) => (name.toLowerCase() === 'x-arena-generation' ? generation : null)
  },
  json: async () => data
});

const game = (id, moves) => ({
  id,
  external_id: `run_${id}_0`,
  group_id: `run_${id}`,
  run_id: 'run',
  board_size: 20,
  moves,
  winner_color: 0,
  black_slot: 1,
  white_slot: 2,
  black_name: 'Alpha',
  white_name: 'Beta',
  black_ver: '1.0',
  white_ver: '2.0',
  timestamp: '2026-01-01T00:00:00Z',
  duration: 0
});

const source = () => FakeEventSource.instances.at(-1);

beforeEach(() => {
  FakeEventSource.instances = [];
  window.history.replaceState(null, '', '/');

  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      if (url === '/api/latest-game') {
        return Promise.resolve(response({ id: 1 }, 'generation-1'));
      }

      if (url === '/api/game/1') {
        return Promise.resolve(response(game(1, '1,1,1')));
      }

      if (url === '/api/game/2') {
        return Promise.resolve(response(game(2, '5,5,1')));
      }

      if (String(url).startsWith('/api/matchups') || url === '/api/runs') {
        return Promise.resolve(response([]));
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App recovery and playback', () => {
  it('selects the first recovered live game with a clean URL', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('stone-1-1')).toBeInTheDocument());

    expect(window.location.pathname).toBe('/1');

    act(() => {
      source().emit({
        type: 'reset',
        seq: 1,
        generation: 'generation-2'
      });
    });

    await waitFor(() => expect(screen.getByText('Select a match')).toBeInTheDocument());

    act(() => {
      source().emit({
        type: 'run_start',
        seq: 2,
        generation: 'generation-2',
        run: {
          id: 'run',
          status: 'live',
          analysis_enabled: 0,
          games_played: 0,
          total_games: 2,
          slot1_name: 'Alpha',
          slot1_version: '1.0',
          slot2_name: 'Beta',
          slot2_version: '2.0'
        }
      });

      source().emit({
        type: 'game_start',
        seq: 3,
        generation: 'generation-2',
        game: game(2, '5,5,1')
      });
    });

    await waitFor(() => expect(screen.getByTestId('stone-5-5')).toBeInTheDocument());

    expect(window.location.pathname).toBe('/2');
    expect(window.location.search).toBe('');
  });

  it('keeps a paused rewind until a newer live move arrives', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('Move 1/1')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Previous move'));

    expect(screen.getByText('Move 0/1')).toBeInTheDocument();

    act(() => {
      source().emit({
        type: 'game_move',
        id: 1,
        group_id: 'run_1',
        run_id: 'run',
        moves: '1,1,1',
        move_count: 1
      });
    });

    expect(screen.getByText('Move 0/1')).toBeInTheDocument();

    act(() => {
      source().emit({
        type: 'game_move',
        id: 1,
        group_id: 'run_1',
        run_id: 'run',
        moves: '1,1,1;2,2,2',
        move_count: 2
      });
    });

    await waitFor(() => expect(screen.getByText('Move 2/2')).toBeInTheDocument());
  });

  it('accepts rapid opposite playback commands without waiting for animation', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/latest-game') {
        return Promise.resolve(response({ id: 1 }, 'generation-1'));
      }

      if (url === '/api/game/1') {
        return Promise.resolve(response(game(1, '1,1,1;2,2,2;3,3,1')));
      }

      if (String(url).startsWith('/api/matchups') || url === '/api/runs') {
        return Promise.resolve(response([]));
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('Move 3/3')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Previous move'));
    fireEvent.click(screen.getByLabelText('Previous move'));

    expect(screen.getByText('Move 1/3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next move'));

    expect(screen.getByText('Move 2/3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Replay from start'));

    expect(screen.getByText('Move 0/3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next move'));

    expect(screen.getByText('Move 1/3')).toBeInTheDocument();
  });

  it('does not move active playback when a reconnect snapshot arrives', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('Move 1/1')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Previous move'));

    expect(screen.getByText('Move 0/1')).toBeInTheDocument();

    const initialFetches = globalThis.fetch.mock.calls.filter(
      ([url]) => url === '/api/game/1'
    ).length;

    vi.useFakeTimers();

    act(() => {
      source().onopen?.();
      source().onerror?.();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => {
      source().onopen?.();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const reconnectFetches = globalThis.fetch.mock.calls.filter(
      ([url]) => url === '/api/game/1'
    ).length;

    expect(reconnectFetches).toBe(initialFetches + 1);
    expect(screen.getByText('Move 0/1')).toBeInTheDocument();
  });
});
