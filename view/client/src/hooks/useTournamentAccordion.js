import { useCallback, useReducer, useRef } from 'react';

export const initialTournamentAccordionState = {
  activeKey: null,
  targetKey: null,
  targetToken: null,
  targetReady: false,
  phase: 'closed'
};

export const tournamentAccordionReducer = (state, action) => {
  if (action.type === 'RESET') {
    return initialTournamentAccordionState;
  }

  if (action.type === 'REQUEST') {
    if (state.phase === 'opening' || state.phase === 'closing') {
      return state;
    }

    if (action.key === state.activeKey) {
      return state.targetKey
        ? {
            ...state,
            targetKey: null,
            targetToken: null,
            targetReady: false,
            phase: 'open'
          }
        : {
            ...state,
            phase: 'closing'
          };
    }

    if (action.key === state.targetKey) {
      return {
        ...state,
        targetKey: null,
        targetToken: null,
        targetReady: false,
        phase: state.activeKey ? 'open' : 'closed'
      };
    }

    return {
      ...state,
      targetKey: action.key,
      targetToken: action.token,
      targetReady: false,
      phase: state.activeKey ? 'open' : 'closed'
    };
  }

  if (action.type === 'PREPARED') {
    if (action.key !== state.targetKey || action.token !== state.targetToken) {
      return state;
    }

    if (!state.activeKey) {
      return {
        activeKey: state.targetKey,
        targetKey: null,
        targetToken: null,
        targetReady: false,
        phase: 'opening'
      };
    }

    return {
      ...state,
      targetReady: true,
      phase: 'closing'
    };
  }

  if (action.type === 'TRANSITION_END') {
    if (action.key !== state.activeKey) {
      return state;
    }

    if (state.phase === 'opening') {
      return {
        ...state,
        phase: 'open'
      };
    }

    if (state.phase !== 'closing') {
      return state;
    }

    if (state.targetKey && state.targetReady) {
      return {
        activeKey: state.targetKey,
        targetKey: null,
        targetToken: null,
        targetReady: false,
        phase: 'opening'
      };
    }

    return {
      activeKey: null,
      targetKey: state.targetKey,
      targetToken: state.targetToken,
      targetReady: false,
      phase: 'closed'
    };
  }

  if (action.type === 'PRUNE') {
    const activeKey =
      state.activeKey && action.keys.has(state.activeKey) ? state.activeKey : null;
    const targetKey =
      state.targetKey && action.keys.has(state.targetKey) ? state.targetKey : null;

    if (activeKey === state.activeKey && targetKey === state.targetKey) {
      return state;
    }

    if (!activeKey) {
      if (targetKey && state.targetReady) {
        return {
          activeKey: targetKey,
          targetKey: null,
          targetToken: null,
          targetReady: false,
          phase: 'opening'
        };
      }

      return {
        activeKey: null,
        targetKey,
        targetToken: targetKey ? state.targetToken : null,
        targetReady: false,
        phase: 'closed'
      };
    }

    return {
      ...state,
      activeKey,
      targetKey,
      targetToken: targetKey ? state.targetToken : null,
      targetReady: targetKey ? state.targetReady : false
    };
  }

  return state;
};

export function useTournamentAccordion() {
  const [state, dispatch] = useReducer(
    tournamentAccordionReducer,
    initialTournamentAccordionState
  );
  const nextToken = useRef(0);

  const request = useCallback((key) => {
    dispatch({
      type: 'REQUEST',
      key,
      token: ++nextToken.current
    });
  }, []);

  const prepared = useCallback((key, token) => {
    dispatch({
      type: 'PREPARED',
      key,
      token
    });
  }, []);

  const transitionEnd = useCallback((key) => {
    dispatch({
      type: 'TRANSITION_END',
      key
    });
  }, []);

  const prune = useCallback((keys) => {
    dispatch({
      type: 'PRUNE',
      keys
    });
  }, []);

  const reset = useCallback(() => {
    dispatch({
      type: 'RESET'
    });
  }, []);

  const phaseFor = useCallback(
    (key) => {
      if (key === state.activeKey) {
        return state.phase;
      }

      return key === state.targetKey ? 'preparing' : 'closed';
    },
    [state]
  );

  const tokenFor = useCallback(
    (key) => (key === state.targetKey ? state.targetToken : null),
    [state]
  );

  return {
    state,
    request,
    prepared,
    transitionEnd,
    prune,
    reset,
    phaseFor,
    tokenFor
  };
}
