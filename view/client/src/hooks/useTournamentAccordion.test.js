import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  initialTournamentAccordionState,
  tournamentAccordionReducer,
  useTournamentAccordion
} from './useTournamentAccordion';

const openTournament = (result, key) => {
  act(() => {
    result.current.request(key);
  });

  const token = result.current.tokenFor(key);

  act(() => {
    result.current.prepared(key, token);
  });

  expect(result.current.phaseFor(key)).toBe('opening');

  act(() => {
    result.current.transitionEnd(key);
  });

  expect(result.current.phaseFor(key)).toBe('open');
};

describe('tournamentAccordionReducer', () => {
  it('returns the initial state after reset', () => {
    expect(
      tournamentAccordionReducer(
        {
          activeKey: 'a',
          targetKey: 'b',
          targetToken: 2,
          targetReady: true,
          phase: 'closing'
        },
        {
          type: 'RESET'
        }
      )
    ).toEqual(initialTournamentAccordionState);
  });

  it('ignores requests during transitions', () => {
    for (const phase of ['opening', 'closing']) {
      const state = {
        activeKey: 'a',
        targetKey: null,
        targetToken: null,
        targetReady: false,
        phase
      };

      expect(
        tournamentAccordionReducer(state, {
          type: 'REQUEST',
          key: 'b',
          token: 2
        })
      ).toBe(state);
    }
  });

  it('ignores stale preparation tokens', () => {
    const state = {
      activeKey: 'a',
      targetKey: 'b',
      targetToken: 4,
      targetReady: false,
      phase: 'open'
    };

    expect(
      tournamentAccordionReducer(state, {
        type: 'PREPARED',
        key: 'b',
        token: 3
      })
    ).toBe(state);
  });
});

describe('useTournamentAccordion', () => {
  it('prepares before opening the first tournament', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    act(() => {
      result.current.request('a');
    });

    expect(result.current.phaseFor('a')).toBe('preparing');

    const token = result.current.tokenFor('a');

    expect(token).toBe(1);

    act(() => {
      result.current.prepared('a', token);
    });

    expect(result.current.phaseFor('a')).toBe('opening');

    act(() => {
      result.current.transitionEnd('a');
    });

    expect(result.current.phaseFor('a')).toBe('open');
  });

  it('keeps the current tournament open until the target is prepared', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    openTournament(result, 'a');

    act(() => {
      result.current.request('b');
    });

    expect(result.current.phaseFor('a')).toBe('open');
    expect(result.current.phaseFor('b')).toBe('preparing');

    const token = result.current.tokenFor('b');

    act(() => {
      result.current.prepared('b', token);
    });

    expect(result.current.phaseFor('a')).toBe('closing');
    expect(result.current.phaseFor('b')).toBe('preparing');

    act(() => {
      result.current.transitionEnd('a');
    });

    expect(result.current.phaseFor('a')).toBe('closed');
    expect(result.current.phaseFor('b')).toBe('opening');

    act(() => {
      result.current.transitionEnd('b');
    });

    expect(result.current.phaseFor('b')).toBe('open');
  });

  it('replaces a pending target without closing the current tournament', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    openTournament(result, 'a');

    act(() => {
      result.current.request('b');
    });

    const oldToken = result.current.tokenFor('b');

    act(() => {
      result.current.request('c');
    });

    expect(result.current.phaseFor('a')).toBe('open');
    expect(result.current.phaseFor('b')).toBe('closed');
    expect(result.current.phaseFor('c')).toBe('preparing');

    act(() => {
      result.current.prepared('b', oldToken);
    });

    expect(result.current.phaseFor('a')).toBe('open');
    expect(result.current.phaseFor('c')).toBe('preparing');
  });

  it('cancels preparation when the active tournament is requested', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    openTournament(result, 'a');

    act(() => {
      result.current.request('b');
      result.current.request('a');
    });

    expect(result.current.phaseFor('a')).toBe('open');
    expect(result.current.phaseFor('b')).toBe('closed');
  });

  it('cancels a pending first tournament when requested again', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    act(() => {
      result.current.request('a');
    });

    expect(result.current.phaseFor('a')).toBe('preparing');

    act(() => {
      result.current.request('a');
    });

    expect(result.current.phaseFor('a')).toBe('closed');
  });

  it('closes an open tournament without a replacement', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    openTournament(result, 'a');

    act(() => {
      result.current.request('a');
    });

    expect(result.current.phaseFor('a')).toBe('closing');

    act(() => {
      result.current.transitionEnd('a');
    });

    expect(result.current.phaseFor('a')).toBe('closed');
  });

  it('prunes unavailable active and target keys', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    openTournament(result, 'a');

    act(() => {
      result.current.request('b');
      result.current.prune(new Set(['a']));
    });

    expect(result.current.phaseFor('a')).toBe('open');
    expect(result.current.phaseFor('b')).toBe('closed');

    act(() => {
      result.current.prune(new Set());
    });

    expect(result.current.state).toEqual(initialTournamentAccordionState);
  });

  it('resets all orchestration state', () => {
    const { result } = renderHook(() => useTournamentAccordion());

    openTournament(result, 'a');

    act(() => {
      result.current.request('b');
      result.current.reset();
    });

    expect(result.current.state).toEqual(initialTournamentAccordionState);
  });
});
