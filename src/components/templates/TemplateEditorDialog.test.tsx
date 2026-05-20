/* eslint-disable pace-core-compliance/prefer-pace-core-components, pace-core-compliance/prefer-pace-core-form */
// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { MERGE_TOKEN_SHAPE_MESSAGE } from '@/lib/templates/tokenValidation';
import { TemplateEditorDialog } from './TemplateEditorDialog';

const toast = vi.fn();
const onSave = vi.fn(async () => undefined);
const onOpenChange = vi.fn();

vi.mock('@solvera/pace-core/components', () => ({
  toast: (...args: unknown[]) => toast(...args),
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
    open ? <aside data-testid="editor-dialog">{children}</aside> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  Form: ({
    children,
    onSubmit,
  }: {
    children: (methods: {
      watch: (field: string) => string | boolean;
      setValue: (field: string, value: string | boolean) => void;
      setError: (name: string, error: { message: string }) => void;
      clearErrors: () => void;
    }) => ReactNode;
    onSubmit: (values: {
      name: string;
      description: string;
      channel: 'email' | 'sms';
      subject: string;
      body: string;
      require_merge_field_validation: boolean;
    }) => void | Promise<void>;
  }) => {
    function MockForm() {
      const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
      const methods = {
        watch: (field: string) => {
          if (field === 'channel') return 'email';
          if (field === 'require_merge_field_validation') return false;
          return '';
        },
        setValue: vi.fn(),
        setError: (name: string, error: { message: string }) => {
          setFieldErrors((prev) => ({ ...prev, [name]: error.message }));
        },
        clearErrors: () => {
          setFieldErrors({});
        },
      };
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const nameInput = document.querySelector<HTMLInputElement>('[name="name"]');
            const bodyInput = document.querySelector<HTMLTextAreaElement>('[name="body"]');
            const subjectInput = document.querySelector<HTMLInputElement>('[name="subject"]');
            void onSubmit({
              name: nameInput?.value ?? '',
              description: '',
              channel: 'email',
              subject: subjectInput?.value ?? 'Subject',
              body: bodyInput?.value ?? '',
              require_merge_field_validation: false,
            });
          }}
        >
          {children(methods)}
          {Object.entries(fieldErrors).map(([name, message]) => (
            <p key={name} role="alert" data-field={name}>
              {message}
            </p>
          ))}
        </form>
      );
    }
    return <MockForm />;
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
        <input id={`form-field-${name}`} name={name} defaultValue="" />
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

const defaultValues = {
  name: '',
  description: '',
  channel: 'email' as const,
  subject: '',
  body: '',
  require_merge_field_validation: false,
};

function renderEditor() {
  return render(
    <TemplateEditorDialog
      mode="create"
      template={null}
      open
      onOpenChange={onOpenChange}
      defaultValues={defaultValues}
      canUpdateStrictMode
      onSave={onSave}
      isSaving={false}
    />
  );
}

describe('TemplateEditorDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders create dialog title (AC-5 UI)', () => {
    renderEditor();
    expect(screen.getByText('Create template')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save template' })).toBeTruthy();
  });

  it('shows inline name error and toast when name is empty (AC-6)', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => {
      expect(screen.getByText('Name is required.')).toBeTruthy();
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Fix the highlighted fields before saving.',
      })
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows inline merge-token error on body when tokens are malformed (AC-8)', async () => {
    const user = userEvent.setup();
    render(
      <TemplateEditorDialog
        mode="create"
        template={null}
        open
        onOpenChange={onOpenChange}
        defaultValues={{
          ...defaultValues,
          name: 'Test',
          body: 'Hello {{first_name',
        }}
        canUpdateStrictMode
        onSave={onSave}
        isSaving={false}
      />
    );
    const body = document.querySelector<HTMLTextAreaElement>('[name="body"]');
    if (body != null) {
      body.value = 'Hello {{first_name';
    }
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => {
      expect(screen.getByText(MERGE_TOKEN_SHAPE_MESSAGE)).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps editor open when save rejects (AC-14)', async () => {
    const user = userEvent.setup();
    onSave.mockRejectedValueOnce(new Error('Save failed'));
    render(
      <TemplateEditorDialog
        mode="create"
        template={null}
        open
        onOpenChange={onOpenChange}
        defaultValues={{
          ...defaultValues,
          name: 'Valid name',
          subject: 'Subject line',
          body: 'Body text',
        }}
        canUpdateStrictMode
        onSave={onSave}
        isSaving={false}
      />
    );
    await user.type(document.querySelector<HTMLInputElement>('[name="name"]')!, 'Valid name');
    await user.type(document.querySelector<HTMLInputElement>('[name="subject"]')!, 'Subject line');
    await user.type(document.querySelector<HTMLTextAreaElement>('[name="body"]')!, 'Body text');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.getByTestId('editor-dialog')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
