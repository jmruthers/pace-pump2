import { useMemo, type MouseEvent } from 'react';
import type { DataTableColumn } from '@solvera/pace-core/components';
import {
  Badge,
  Button,
  DataTable,
} from '@solvera/pace-core/components';
import { formatTemplateCreatedAt } from './formatTemplateCreatedAt';
import type { OrganisationTemplateRow } from '@/lib/templates/types';

export interface TemplatesListPanelProps {
  rows: OrganisationTemplateRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isEmpty: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  onCreateClick: () => void;
  onPreview: (row: OrganisationTemplateRow) => void;
  onEdit: (row: OrganisationTemplateRow) => void;
  onRetire: (row: OrganisationTemplateRow) => void;
  onActivate: (row: OrganisationTemplateRow) => void;
}

function stopRowActivate(event: MouseEvent) {
  event.stopPropagation();
}

export function TemplatesListPanel({
  rows,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  canCreate,
  canUpdate,
  onCreateClick,
  onPreview,
  onEdit,
  onRetire,
  onActivate,
}: TemplatesListPanelProps) {
  const columns = useMemo((): DataTableColumn<OrganisationTemplateRow>[] => {
    return [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        sortable: false,
        cell: ({ row }) => (
          <span className={row.is_active ? undefined : 'text-muted-foreground'}>{row.name}</span>
        ),
      },
      {
        id: 'channel',
        accessorKey: 'channel',
        header: 'Channel',
        sortable: false,
        cell: ({ row }) => (
          <Badge variant={row.channel === 'email' ? 'solid-main-normal' : 'soft-sec-normal'}>
            {row.channel === 'email' ? 'Email' : 'SMS'}
          </Badge>
        ),
      },
      {
        id: 'subject',
        accessorKey: 'subject',
        header: 'Subject',
        sortable: false,
        cell: ({ row }) => {
          if (row.channel !== 'email' || row.subject == null) {
            return null;
          }
          return (
            <span
              className={`block max-w-full truncate ${row.is_active ? '' : 'text-muted-foreground'}`}
            >
              {row.subject}
            </span>
          );
        },
      },
      {
        id: 'strict',
        accessorKey: 'require_merge_field_validation',
        header: 'Strict',
        sortable: false,
        cell: ({ row }) =>
          row.require_merge_field_validation ? (
            <Badge variant="soft-sec-normal">Strict</Badge>
          ) : null,
      },
      {
        id: 'status',
        accessorKey: 'is_active',
        header: 'Status',
        sortable: false,
        cell: ({ row }) =>
          row.is_active ? null : <Badge variant="soft-sec-normal">Inactive</Badge>,
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        sortable: false,
        cell: ({ row }) => formatTemplateCreatedAt(row.created_at),
      },
      {
        id: 'actions',
        header: '',
        sortable: false,
        cell: ({ row }) => (
          <menu
            className="grid auto-cols-max grid-flow-col justify-end gap-1"
            onClick={stopRowActivate}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="small"
              aria-label={`Preview ${row.name}`}
              onClick={() => onPreview(row)}
            >
              Preview
            </Button>
            {canUpdate && row.is_active ? (
              <Button
                type="button"
                variant="ghost"
                size="small"
                aria-label={`Edit ${row.name}`}
                onClick={() => onEdit(row)}
              >
                Edit
              </Button>
            ) : null}
            {canUpdate && row.is_active ? (
              <Button
                type="button"
                variant="ghost"
                size="small"
                aria-label={`Retire ${row.name}`}
                onClick={() => onRetire(row)}
              >
                Retire
              </Button>
            ) : null}
            {canUpdate && !row.is_active ? (
              <Button
                type="button"
                variant="ghost"
                size="small"
                aria-label={`Activate ${row.name}`}
                onClick={() => onActivate(row)}
              >
                Activate
              </Button>
            ) : null}
          </menu>
        ),
      },
    ];
  }, [canUpdate, onActivate, onEdit, onPreview, onRetire]);

  if (isError) {
    return (
      <section className="grid place-items-center gap-4 rounded-lg border border-sec-200 p-8">
        <p>Couldn&apos;t load templates.</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </section>
    );
  }

  if (!isLoading && isEmpty) {
    return (
      <section className="grid place-items-center gap-4 rounded-lg border border-sec-200 p-8">
        <p>No templates yet — create one to get started.</p>
        {canCreate ? (
          <Button type="button" variant="default" onClick={onCreateClick}>
            Create template
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <DataTable<OrganisationTemplateRow>
      data={rows}
      columns={columns}
      rbac={{ pageName: 'CommsTemplates' }}
      isLoading={isLoading}
      getRowId={(row) => row.id}
      onRowActivate={onPreview}
      initialPageSize={1000}
      initialSorting={[{ id: 'created_at', desc: true }]}
      features={{
        search: false,
        pagination: false,
        sorting: false,
        filtering: false,
        import: false,
        export: false,
        selection: false,
        creation: false,
        editing: false,
        deletion: false,
        deleteSelected: false,
        grouping: false,
        columnVisibility: false,
        columnReordering: false,
        hierarchical: false,
      }}
    />
  );
}
