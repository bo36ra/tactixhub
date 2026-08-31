import { useCallback, useRef, useState } from 'react';
import type { BoardData } from './tactics-api';

// Real undo/redo (a history stack with redo, replacing the previous
// "remove the last item from whichever array matches the current tool"
// button, which had no redo and quietly did the wrong thing if you'd
// switched tools since your last edit) — matching the "continuous drag
// = one undo entry" requirement from the architecture discussion:
// dragging a marker across the board for two seconds should undo in a
// single press, not once per pixel moved.
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
export function useBoardHistory(initial: BoardData) {
  const [board, setBoardState] = useState<BoardData>(initial);
  const [past, setPast] = useState<BoardData[]>([]);
  const [future, setFuture] = useState<BoardData[]>([]);
  const liveStartSnapshot = useRef<BoardData | null>(null);

  const commitBoard = useCallback((next: BoardData) => {
    setBoardState((prev) => {
      setPast((p) => [...p, prev]);
      setFuture([]);
      return next;
    });
  }, []);

  const setBoardLive = useCallback((next: BoardData | ((prev: BoardData) => BoardData)) => {
    setBoardState((prev) => (typeof next === 'function' ? (next as (p: BoardData) => BoardData)(prev) : next));
  }, []);

  const beginLiveChange = useCallback(() => {
    setBoardState((current) => {
      if (liveStartSnapshot.current === null) liveStartSnapshot.current = current;
      return current;
    });
  }, []);

  const commitLiveChange = useCallback(() => {
    const snapshot = liveStartSnapshot.current;
    liveStartSnapshot.current = null;
    if (snapshot === null) return;
    setPast((p) => [...p, snapshot]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prevState = p[p.length - 1];
      setBoardState((current) => {
        setFuture((f) => [current, ...f]);
        return prevState;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const nextState = f[0];
      setBoardState((current) => {
        setPast((p) => [...p, current]);
        return nextState;
      });
      return f.slice(1);
    });
  }, []);

  // Loading an entirely different document (opening a saved tactic,
  // starting a new one) isn't something the undo stack from the
  // *previous* document should apply to.
  const resetBoard = useCallback((next: BoardData) => {
    setBoardState(next);
    setPast([]);
    setFuture([]);
    liveStartSnapshot.current = null;
  }, []);

  return {
    board, commitBoard, setBoardLive, beginLiveChange, commitLiveChange,
    undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, resetBoard,
  };
}
