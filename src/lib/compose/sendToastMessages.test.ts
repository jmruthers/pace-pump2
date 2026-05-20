import { describe, expect, it } from 'vitest';
import {
  buildScheduleSuccessToast,
  buildSendSuccessToast,
  buildSendTestSuccessToast,
  sendFailureToastTitle,
} from './sendToastMessages';

describe('sendToastMessages', () => {
  it('appends suppression and warnings to send success description', () => {
    const toast = buildSendSuccessToast({
      message_id: 'm1',
      total_recipients: 47,
      suppression_skipped: 3,
      warnings: [{ type: 'unresolved_token', token: '{{x}}', count: 5, message: 'warn' }],
    });
    expect(toast.title).toBe('Message sent');
    expect(toast.description).toContain('47 recipients');
    expect(toast.description).toContain('3 skipped');
    expect(toast.description).toContain('check delivery in the comms log');
  });

  it('formats schedule success toast', () => {
    const toast = buildScheduleSuccessToast('2026-12-01T10:00:00.000Z');
    expect(toast.title).toBe('Message scheduled');
    expect(toast.description).toContain('Message scheduled for');
  });

  it('uses channel-aware send-test copy', () => {
    expect(buildSendTestSuccessToast('email').description).toBe('Test sent to your email');
    expect(buildSendTestSuccessToast('sms').description).toBe('Test sent to your phone');
  });

  it('maps failure titles by action', () => {
    expect(sendFailureToastTitle('schedule')).toBe('Schedule failed');
    expect(sendFailureToastTitle('sendTest')).toBe('Send test failed');
    expect(sendFailureToastTitle('saveDraft')).toBe('Save draft failed');
  });
});
