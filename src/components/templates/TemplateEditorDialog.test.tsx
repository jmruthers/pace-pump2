/* eslint-disable pace-core-compliance/prefer-pace-core-components, pace-core-compliance/prefer-pace-core-form */
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TemplateEditorDialog } from './TemplateEditorDialog';

const onSave = vi.fn(async () => undefined);
const onOpenChange = vi.fn();

vi.mock('@solvera/pace-core/components', () => ({
  toast: vi.fn(),
  Button: ({
    children,
    type = 'button',
    onClick,
  }: {
    children?: ReactNode;
    type?: 'button' | 'submit';
    onClick?: () => void;
  }) => (
    <button type={type} onClick={onClick}>
      {children}
    </button>
  ),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <aside>{children}</aside> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  Form: ({
    children,
    onSubmit,
    onError,
  }: {
    children: (methods: {
      watch: (field: string) => string | boolean;
      setValue: (field: string, value: string | boolean) => void;
    }) => ReactNode;
    onSubmit: (values: {
      name: string;
      description: string;
      channel: 'email' | 'sms';
      subject: string;
      body: string;
      require_merge_field_validation: boolean;
    }) => void;
    onError?: () => void;
  }) => {
    const methods = {
      watch: (field: string) => {
        if (field === 'channel') return 'email';
        if (field === 'require_merge_field_validation') return false;
        return '';
      },
      setValue: vi.fn(),
    };
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const nameInput = document.querySelector<HTMLInputElement>('[name="name"]');
          if (nameInput?.value.trim() === '') {
            onError?.();
            return;
          }
          const bodyInput = document.querySelector<HTMLTextAreaElement>('[name="body"]');
          if (bodyInput?.value.includes('{{first_name')) {
            onError?.();
            return;
          }
          onSubmit({
            name: nameInput?.value ?? '',
            description: '',
            channel: 'email',
            subject: 'Subject',
            body: bodyInput?.value ?? '',
            require_merge_field_validation: false,
          });
        }}
      >
        {children(methods)}
      </form>
    );
  },
  FormField: ({
    name,
    label,
    render,
  }: {
    name: string;
    label?: string;
    render?: (props: {
      field: { value: string; onChange: (v: string) => void; onBlur: () => void };
    }) => ReactNode;
  }) => {
    if (render != null) {
      return (
        <label>
          {label}
          {render({
            field: {
              value: '',
              onChange: () => undefined,
              onBlur: () => undefined,
            },
          })}
        </label>
      );
    }
    return (
      <label>
        {label}
        <input id={`form-field-${name}`} name={name} />
      </label>
    );
  },
  Label: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
  LoadingSpinner: () => <span>spinner</span>,
  Select: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  Textarea: () => <textarea name="body" />,
  Switch: () => <input type="checkbox" />,
  Input: () => null,
}));

describe('TemplateEditorDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders create dialog title (AC-5 UI)', () => {
    render(
      <TemplateEditorDialog
        mode="create"
        template={null}
        open
        onOpenChange={onOpenChange}
        defaultValues={{
          name: '',
          description: '',
          channel: 'email',
          subject: '',
          body: '',
          require_merge_field_validation: false,
        }}
        canUpdateStrictMode
        onSave={onSave}
        isSaving={false}
      />
    );

    expect(screen.getByText('Create template')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save template' })).toBeTruthy();
  });
});
