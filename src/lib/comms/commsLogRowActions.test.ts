/** PUMP-02 QA S-11, S-14, S-16 — cancel/delete row action visibility */
import { describe, expect, it } from 'vitest';
import {
  isCommsLogCancelActionHidden,
  isCommsLogDeleteActionHidden,
} from './commsLogRowActions.js';

const authorId = 'user-author';
const otherId = 'user-other';

describe('commsLogRowActions', () => {
  describe('isCommsLogCancelActionHidden', () => {
    it('shows cancel for scheduled message author', () => {
      expect(
        isCommsLogCancelActionHidden(
          { status: 'scheduled', created_by: authorId },
          { userId: authorId, canUpdate: false }
        )
      ).toBe(false);
    });

    it('shows cancel for admin with update grant on another author row', () => {
      expect(
        isCommsLogCancelActionHidden(
          { status: 'scheduled', created_by: authorId },
          { userId: otherId, canUpdate: true }
        )
      ).toBe(false);
    });

    it('hides cancel for non-author without update grant', () => {
      expect(
        isCommsLogCancelActionHidden(
          { status: 'scheduled', created_by: authorId },
          { userId: otherId, canUpdate: false }
        )
      ).toBe(true);
    });

    it('hides cancel when user id is missing', () => {
      expect(
        isCommsLogCancelActionHidden(
          { status: 'scheduled', created_by: authorId },
          { userId: null, canUpdate: true }
        )
      ).toBe(true);
    });

    it('hides cancel for non-scheduled statuses', () => {
      expect(
        isCommsLogCancelActionHidden(
          { status: 'sent', created_by: authorId },
          { userId: authorId, canUpdate: true }
        )
      ).toBe(true);
    });
  });

  describe('isCommsLogDeleteActionHidden', () => {
    it('shows delete for draft author with delete grant', () => {
      expect(
        isCommsLogDeleteActionHidden(
          { status: 'draft', created_by: authorId },
          { userId: authorId, canDelete: true }
        )
      ).toBe(false);
    });

    it('hides delete for draft authored by another user even with delete grant (S-16)', () => {
      expect(
        isCommsLogDeleteActionHidden(
          { status: 'draft', created_by: authorId },
          { userId: otherId, canDelete: true }
        )
      ).toBe(true);
    });

    it('hides delete without delete grant', () => {
      expect(
        isCommsLogDeleteActionHidden(
          { status: 'draft', created_by: authorId },
          { userId: authorId, canDelete: false }
        )
      ).toBe(true);
    });

    it('hides delete for non-draft statuses', () => {
      expect(
        isCommsLogDeleteActionHidden(
          { status: 'scheduled', created_by: authorId },
          { userId: authorId, canDelete: true }
        )
      ).toBe(true);
    });
  });
});
