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

let triggerFormSubmit: (() => void) | null = null;
const fieldValues: Record<string, string> = {};

vi.mock('@solvera/pace-core/components', async () => {
  const actual = await vi.importActual<typeof import('@solvera/pace-core/components')>(
    '@solvera/pace-core/components'
  );
  const { Button: PaceButton, Input, Textarea: PaceTextarea, Label } = actual;

  const Textarea = ({
    id,
    value,
    onChange,
    ...rest
  }: {
    id?: string;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    rows?: number;
  }) => (
    <PaceTextarea
      id={id}
      value={id != null ? (fieldValues[id] ?? value ?? '') : (value ?? '')}
      onChange={(next) => {
        if (id != null) {
          fieldValues[id] = next;
        }
        onChange?.(next);
      }}
      {...rest}
    />
  );

  return {
    toast: (...args: unknown[]) => toast(...args),
    Button: ({
      type = 'button',
      onClick,
      children,
      ...rest
    }: {
      type?: 'button' | 'submit';
      onClick?: () => void;
      children?: ReactNode;
      disabled?: boolean;
      variant?: string;
    }) =>
      type === 'submit' ? (
        <PaceButton type="button" onClick={() => triggerFormSubmit?.()} {...rest}>
          {children}
        </PaceButton>
      ) : (
        <PaceButton type={type} onClick={onClick} {...rest}>
          {children}
        </PaceButton>
      ),
    Input,
    Textarea,
    Label,
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
        triggerFormSubmit = () => {
          const nameInput = document.querySelector<HTMLInputElement>('[name="name"]');
          const subjectInput =
            document.querySelector<HTMLInputElement>('[name="subject"]') ??
            document.getElementById('form-field-subject');
          void onSubmit({
            name: nameInput?.value ?? fieldValues['form-field-name'] ?? '',
            description: '',
            channel: 'email',
            subject: subjectInput?.value ?? fieldValues['form-field-subject'] ?? 'Subject',
            body: fieldValues['form-field-body'] ?? '',
            require_merge_field_validation: false,
          });
        };
        return (
          <div>
            {children(methods)}
            {Object.entries(fieldErrors).map(([name, message]) => (
              <p key={name} role="alert" data-field={name}>
                {message}
              </p>
            ))}
          </div>
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
          <Label>
            {label}
            {render({
              field: {
                value: '',
                onChange: () => undefined,
                onBlur: () => undefined,
              },
            })}
          </Label>
        );
      }
      return (
        <Label>
          {label}
          <Input id={`form-field-${name}`} name={name} defaultValue="" />
        </Label>
      );
    },
    LoadingSpinner: () => <span>spinner</span>,
    Select: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ children }: { children: ReactNode }) => <>{children}</>,
    Switch: () => <Input type="checkbox" aria-label="strict" />,
  };
});

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
    triggerFormSubmit = null;
    for (const key of Object.keys(fieldValues)) {
      delete fieldValues[key];
    }
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
        defaultValues={defaultValues}
        canUpdateStrictMode
        onSave={onSave}
        isSaving={false}
      />
    );
    fieldValues['form-field-name'] = 'Test';
    fieldValues['form-field-subject'] = 'Subject';
    fieldValues['form-field-body'] = 'Hello {{first_name';
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
    await user.type(document.getElementById('form-field-name')!, 'Valid name');
    await user.type(document.getElementById('form-field-subject')!, 'Subject line');
    await user.type(document.getElementById('form-field-body')!, 'Body text');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(onSave).toHaveBeenCalled();
    expect(screen.getByTestId('editor-dialog')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
