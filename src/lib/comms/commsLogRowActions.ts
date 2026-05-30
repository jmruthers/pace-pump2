import type { PumpMessageRow } from './commsLogTypes.js';

/** PUMP-02 QA S-11, S-14, S-16 — row action visibility predicates */
export function isCommsLogCancelActionHidden(
  row: Pick<PumpMessageRow, 'status' | 'created_by'>,
  context: { userId: string | null | undefined; canUpdate: boolean }
): boolean {
  if (row.status !== 'scheduled') {
    return true;
  }
  if (context.userId == null) {
    return true;
  }
  return !(context.userId === row.created_by || context.canUpdate);
}

export function isCommsLogDeleteActionHidden(
  row: Pick<PumpMessageRow, 'status' | 'created_by'>,
  context: { userId: string | null | undefined; canDelete: boolean }
): boolean {
  if (row.status !== 'draft') {
    return true;
  }
  if (context.userId == null || !context.canDelete) {
    return true;
  }
  return context.userId !== row.created_by;
}
