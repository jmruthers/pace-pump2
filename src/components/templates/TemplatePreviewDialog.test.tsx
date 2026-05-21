// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MessagePreview } from '@solvera/pace-core/comms';
import { toPreviewDraft } from '@/lib/templates/toPreviewDraft';
import type { OrganisationTemplateRow } from '@/lib/templates/types';
import { TemplatePreviewDialog } from './TemplatePreviewDialog';

vi.mock('@solvera/pace-core/comms', () => ({
  MessagePreview: vi.fn(() => <article>Message preview</article>),
}));

vi.mock('@solvera/pace-core/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solvera/pace-core/components')>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <aside>{children}</aside> : null,
    DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  };
});

const template: OrganisationTemplateRow = {
  id: 'tpl-1',
  organisation_id: 'org-1',
  name: 'Welcome',
  description: '',
  channel: 'email',
  subject: 'Hi {{first_name}}',
  body_html: '<p>Hello {{first_name}}</p>',
  body_text: 'Hello {{first_name}}',
  merge_fields_used: ['{{first_name}}'],
  is_active: true,
  require_merge_field_validation: false,
  created_by: 'user-1',
  created_at: '2026-05-07T10:00:00Z',
  updated_at: '2026-05-07T10:00:00Z',
};

describe('TemplatePreviewDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('passes preview draft to MessagePreview with empty merge context (AC-12)', () => {
    render(
      <TemplatePreviewDialog template={template} open onOpenChange={vi.fn()} />
    );
    expect(screen.getByText('Preview: Welcome')).toBeTruthy();
    expect(MessagePreview).toHaveBeenCalledWith(
      {
        draft: toPreviewDraft(template),
        mergeFields: [],
        sampleValues: {},
      },
      undefined
    );
  });
});
