export interface UndoEntry {
  stableParagraphId: string;
  before: string;
  after: string;
}

export interface UndoStacks {
  undo: UndoEntry[];
  redo: UndoEntry[];
}

export function pushUndo(
  stacks: UndoStacks,
  entry: UndoEntry,
  maxDepth = 100,
): UndoStacks {
  return {
    undo: [...stacks.undo, entry].slice(-maxDepth),
    redo: [],
  };
}

export function popUndo(stacks: UndoStacks): { stacks: UndoStacks; entry: UndoEntry | null } {
  if (stacks.undo.length === 0) {
    return { stacks, entry: null };
  }
  const entry = stacks.undo[stacks.undo.length - 1];
  return {
    stacks: {
      undo: stacks.undo.slice(0, -1),
      redo: [...stacks.redo, entry],
    },
    entry,
  };
}

export function popRedo(stacks: UndoStacks): { stacks: UndoStacks; entry: UndoEntry | null } {
  if (stacks.redo.length === 0) {
    return { stacks, entry: null };
  }
  const entry = stacks.redo[stacks.redo.length - 1];
  return {
    stacks: {
      undo: [...stacks.undo, entry],
      redo: stacks.redo.slice(0, -1),
    },
    entry,
  };
}
