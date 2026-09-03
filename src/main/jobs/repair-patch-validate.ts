/**
 * Validate targeted repair patches — only allowed paragraph IDs may change.
 */

export interface RepairPatchLine {
  paragraphId: string;
  text: string;
}

export interface RepairPatchValidation {
  ok: boolean;
  violatedIds: string[];
  /** IDs in patch that were not in allowed set (new inventions). */
  unexpectedIds: string[];
  changedAllowedIds: string[];
}

/**
 * Compare before/after translation maps.
 * Fail if any id outside `allowedIds` changed text, or unexpected ids appear in after.
 */
export function validateRepairPatch(input: {
  before: RepairPatchLine[];
  after: RepairPatchLine[];
  allowedIds: ReadonlySet<string> | string[];
}): RepairPatchValidation {
  const allowed =
    input.allowedIds instanceof Set
      ? input.allowedIds
      : new Set(input.allowedIds);
  const beforeMap = new Map(
    input.before.map((l) => [l.paragraphId, l.text] as const),
  );
  const afterMap = new Map(
    input.after.map((l) => [l.paragraphId, l.text] as const),
  );

  const violatedIds: string[] = [];
  const unexpectedIds: string[] = [];
  const changedAllowedIds: string[] = [];

  for (const [id, afterText] of afterMap) {
    if (!allowed.has(id) && !beforeMap.has(id)) {
      unexpectedIds.push(id);
      continue;
    }
    const beforeText = beforeMap.get(id);
    if (beforeText === undefined) {
      if (!allowed.has(id)) unexpectedIds.push(id);
      else changedAllowedIds.push(id);
      continue;
    }
    if (beforeText !== afterText) {
      if (!allowed.has(id)) violatedIds.push(id);
      else changedAllowedIds.push(id);
    }
  }

  // IDs removed outside allowed set also violate
  for (const [id, beforeText] of beforeMap) {
    if (!afterMap.has(id) && beforeText.trim() && !allowed.has(id)) {
      violatedIds.push(id);
    }
  }

  return {
    ok: violatedIds.length === 0 && unexpectedIds.length === 0,
    violatedIds: [...new Set(violatedIds)],
    unexpectedIds: [...new Set(unexpectedIds)],
    changedAllowedIds: [...new Set(changedAllowedIds)],
  };
}

/** Apply patch only for allowed IDs; keep others from base. */
export function applyValidatedPatch(input: {
  base: RepairPatchLine[];
  patch: RepairPatchLine[];
  allowedIds: ReadonlySet<string> | string[];
}): { applied: RepairPatchLine[]; validation: RepairPatchValidation } {
  const allowed =
    input.allowedIds instanceof Set
      ? input.allowedIds
      : new Set(input.allowedIds);
  const baseMap = new Map(input.base.map((l) => [l.paragraphId, l.text]));
  const patchMap = new Map(input.patch.map((l) => [l.paragraphId, l.text]));

  const after: RepairPatchLine[] = [];
  for (const [id, text] of baseMap) {
    if (allowed.has(id) && patchMap.has(id)) {
      after.push({ paragraphId: id, text: patchMap.get(id)! });
    } else {
      after.push({ paragraphId: id, text });
    }
  }
  for (const [id, text] of patchMap) {
    if (allowed.has(id) && !baseMap.has(id)) {
      after.push({ paragraphId: id, text });
    }
  }

  const validation = validateRepairPatch({
    before: input.base,
    after,
    allowedIds: allowed,
  });
  return { applied: after, validation };
}
