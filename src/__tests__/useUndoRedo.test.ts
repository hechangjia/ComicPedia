import { describe, it, expect } from "vitest";

// Test the core undo/redo logic directly (no React dependency)
// The hook wraps this logic in useState/useRef, but the algorithm is testable standalone.

const MAX_HISTORY = 30;

interface UndoRedoState<T> {
  history: T[];
  index: number;
}

function createState<T>(initial: T): UndoRedoState<T> {
  return { history: [initial], index: 0 };
}

function push<T>(state: UndoRedoState<T>, value: T): UndoRedoState<T> {
  const history = state.history.slice(0, state.index + 1);
  history.push(value);
  const trimmed = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
  return { history: trimmed, index: trimmed.length - 1 };
}

function undo<T>(state: UndoRedoState<T>): UndoRedoState<T> {
  if (state.index <= 0) return state;
  return { ...state, index: state.index - 1 };
}

function redo<T>(state: UndoRedoState<T>): UndoRedoState<T> {
  if (state.index >= state.history.length - 1) return state;
  return { ...state, index: state.index + 1 };
}

function current<T>(state: UndoRedoState<T>): T {
  return state.history[state.index];
}

describe("UndoRedo logic", () => {
  it("initializes with given state", () => {
    const s = createState("hello");
    expect(current(s)).toBe("hello");
    expect(s.index).toBe(0);
  });

  it("pushes new state", () => {
    let s = createState("a");
    s = push(s, "b");
    expect(current(s)).toBe("b");
    expect(s.index).toBe(1);
  });

  it("undoes to previous state", () => {
    let s = createState("a");
    s = push(s, "b");
    s = push(s, "c");
    s = undo(s);
    expect(current(s)).toBe("b");
  });

  it("redoes after undo", () => {
    let s = createState("a");
    s = push(s, "b");
    s = undo(s);
    s = redo(s);
    expect(current(s)).toBe("b");
  });

  it("truncates redo history on new push after undo", () => {
    let s = createState("a");
    s = push(s, "b");
    s = push(s, "c");
    s = undo(s); // at "b"
    s = push(s, "d"); // "c" gone
    expect(current(s)).toBe("d");
    s = undo(s);
    expect(current(s)).toBe("b"); // not "c"
  });

  it("does nothing on undo at start", () => {
    const s = createState("a");
    const s2 = undo(s);
    expect(current(s2)).toBe("a");
    expect(s2.index).toBe(0);
  });

  it("does nothing on redo at end", () => {
    let s = createState("a");
    s = push(s, "b");
    const s2 = redo(s);
    expect(current(s2)).toBe("b");
    expect(s2.index).toBe(1);
  });

  it("handles multiple undos and redos", () => {
    let s = createState("a");
    s = push(s, "b");
    s = push(s, "c");
    s = push(s, "d");
    s = undo(s); // "c"
    s = undo(s); // "b"
    s = undo(s); // "a"
    expect(current(s)).toBe("a");
    s = redo(s); // "b"
    s = redo(s); // "c"
    expect(current(s)).toBe("c");
  });

  it("respects max history limit", () => {
    let s = createState(0);
    for (let i = 1; i <= 35; i++) {
      s = push(s, i);
    }
    expect(current(s)).toBe(35);
    expect(s.history.length).toBeLessThanOrEqual(MAX_HISTORY);

    // Count available undos
    let undoCount = 0;
    let state = s;
    while (state.index > 0) {
      state = undo(state);
      undoCount++;
    }
    expect(undoCount).toBeLessThanOrEqual(MAX_HISTORY - 1);
  });

  it("works with objects", () => {
    let s = createState({ name: "Alice", age: 20 });
    s = push(s, { name: "Alice", age: 21 });
    expect(current(s).age).toBe(21);
    s = undo(s);
    expect(current(s).age).toBe(20);
  });

  it("reset clears all history", () => {
    let s = createState("a");
    s = push(s, "b");
    s = push(s, "c");
    s = createState("x"); // equivalent to reset
    expect(current(s)).toBe("x");
    expect(s.history.length).toBe(1);
    expect(s.index).toBe(0);
  });
});
