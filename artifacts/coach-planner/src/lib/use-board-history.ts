import { useCallback, useReducer, useRef } from 'react';
import type { BoardData } from './tactics-api';

// Real undo/redo (a history stack with redo, replacing the previous
// "remove the last item from whichever array matches the current tool"
// button, which had no redo and quietly did the wrong thing if you'd
// switched tools since your last edit) — matching the "continuous drag
// = one undo entry" requirement from the architecture discussion:
// dragging a marker across the board for two seconds should undo in a
// single press, not once per pixel moved.
//
// Board/past/future live together in one useReducer rather than three
// separate useState calls that update each other from inside their own
// functional updaters — that version compiled fine but was never
// actually reliable (setPast/setFuture as side effects nested inside
// setBoardState's updater), which is exactly why "delete a player,
// press undo" sometimes did nothing: a reducer's transitions are atomic
// and pure, so there's no equivalent failure mode.
//
// Two ways to change the board:
//   - commitBoard(next): a single discrete action (add a marker, delete
//     an arrow, apply a formation, ...) — pushes the *current* state
//     onto the undo stack, then applies `next`.
//   - setBoardLive(next) + beginLiveChange()/commitLiveChange(): for
//     anything that fires many times per interaction (dragging a
//     shape, scrubbing an animation, typing in a text field).
//     beginLiveChange() remembers what to revert to; setBoardLive
//     applies every intermediate frame without touching history;
//     commitLiveChange() finalizes it as exactly one undo entry once
//     the interaction is actually done.

interface HistoryState {
  board: BoardData;
  past: BoardData[];
  future: BoardData[];
}

type HistoryAction =
  | { type: 'commit'; next: BoardData }
  | { type: 'setLive'; next: BoardData | ((prev: BoardData) => BoardData) }
  | { type: 'commitLive'; snapshot: BoardData }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; next: BoardData };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'commit':
      return { board: action.next, past: [...state.past, state.board], future: [] };
    case 'setLive':
      return { ...state, board: typeof action.next === 'function' ? action.next(state.board) : action.next };
    case 'commitLive':
      // The board itself was already updated live during the drag —
      // this only records the pre-drag snapshot as the undo target,
      // it doesn't touch `board`.
      return { ...state, past: [...state.past, action.snapshot], future: [] };
    case 'undo': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return { board: prev, past: state.past.slice(0, -1), future: [state.board, ...state.future] };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return { board: next, past: [...state.past, state.board], future: state.future.slice(1) };
    }
    case 'reset':
      return { board: action.next, past: [], future: [] };
  }
}

export function useBoardHistory(initial: BoardData) {
  const [state, dispatch] = useReducer(historyReducer, undefined, (): HistoryState => ({ board: initial, past: [], future: [] }));
  const liveStartSnapshot = useRef<BoardData | null>(null);
  // Tracked separately from state.board so beginLiveChange can stay a
  // stable (empty-deps) callback while still reading the current value
  // rather than whatever board existed on the render that created it.
  const latestBoard = useRef(state.board);
  latestBoard.current = state.board;

  const commitBoard = useCallback((next: BoardData) => dispatch({ type: 'commit', next }), []);

  const setBoardLive = useCallback((next: BoardData | ((prev: BoardData) => BoardData)) => dispatch({ type: 'setLive', next }), []);

  const beginLiveChange = useCallback(() => {
    if (liveStartSnapshot.current === null) liveStartSnapshot.current = latestBoard.current;
  }, []);

  const commitLiveChange = useCallback(() => {
    const snapshot = liveStartSnapshot.current;
    liveStartSnapshot.current = null;
    if (snapshot === null) return;
    dispatch({ type: 'commitLive', snapshot });
  }, []);

  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  // Loading an entirely different document (opening a saved tactic,
  // starting a new one) isn't something the undo stack from the
  // *previous* document should apply to.
  const resetBoard = useCallback((next: BoardData) => {
    liveStartSnapshot.current = null;
    dispatch({ type: 'reset', next });
  }, []);

  return {
    board: state.board, commitBoard, setBoardLive, beginLiveChange, commitLiveChange,
    undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0, resetBoard,
  };
}
