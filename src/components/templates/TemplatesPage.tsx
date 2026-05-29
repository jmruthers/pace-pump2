import { useMemo, useState } from 'react';
import { PagePermissionGuard, useCan } from '@solvera/pace-core/rbac';
import { useUnifiedAuth } from '@solvera/pace-core/hooks';
import { filterTemplates } from '@/lib/templates/filterTemplates';
import type { TemplateFormSchemaValues } from '@/lib/templates/templateFormValidation';
import type { OrganisationTemplateRow } from '@/lib/templates/types';
import { useOrganisationTemplates } from '@/hooks/templates/useOrganisationTemplates';
import { useTemplateMutations } from '@/hooks/templates/useTemplateMutations';
import { TemplateEditorDialog } from './TemplateEditorDialog';
import { TemplatePreviewDialog } from './TemplatePreviewDialog';
import { TemplateRetireDialog } from './TemplateRetireDialog';
import { TemplatesListHeader } from './TemplatesListHeader';
import { TemplatesListPanel } from './TemplatesListPanel';
import { PUMP_PAGE } from '@/config/pumpPageNames';

const EMPTY_FORM: TemplateFormSchemaValues = {
  name: '',
  description: '',
  channel: 'email',
  subject: '',
  body: '',
  require_merge_field_validation: false,
};

function TemplatesPageContent() {
  const { selectedOrganisation, user } = useUnifiedAuth();
  const organisationId = selectedOrganisation?.id ?? '';
  const scope = useMemo(
    () => (organisationId.length > 0 ? { organisationId } : undefined),
    [organisationId]
  );

  const { can: canCreate } = useCan(`create:page.${PUMP_PAGE.commsTemplates}`, scope);
  const { can: canUpdate } = useCan(`update:page.${PUMP_PAGE.commsTemplates}`, scope);

  const { data: templates = [], isLoading, isError, retry } =
    useOrganisationTemplates(organisationId);
  const mutations = useTemplateMutations(organisationId, user?.id ?? '');

  const [searchQuery, setSearchQuery] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingTemplate, setEditingTemplate] = useState<OrganisationTemplateRow | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<OrganisationTemplateRow | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [retireTemplate, setRetireTemplate] = useState<OrganisationTemplateRow | null>(null);
  const [retireOpen, setRetireOpen] = useState(false);

  const filteredRows = useMemo(
    () => filterTemplates(templates, { query: searchQuery, showRetired }),
    [templates, searchQuery, showRetired]
  );

  const editorDefaultValues = useMemo(() => {
    if (editorMode === 'edit' && editingTemplate != null) {
      return mutations.rowToFormValues(editingTemplate);
    }
    return EMPTY_FORM;
  }, [editorMode, editingTemplate, mutations]);

  const openCreate = () => {
    setEditorMode('create');
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const openEdit = (row: OrganisationTemplateRow) => {
    setEditorMode('edit');
    setEditingTemplate(row);
    setEditorOpen(true);
  };

  const openPreview = (row: OrganisationTemplateRow) => {
    setPreviewTemplate(row);
    setPreviewOpen(true);
  };

  const openRetire = (row: OrganisationTemplateRow) => {
    setRetireTemplate(row);
    setRetireOpen(true);
  };

  const handleSave = async (values: TemplateFormSchemaValues) => {
    try {
      if (editorMode === 'create') {
        await mutations.createMutation.mutateAsync(values);
      } else if (editingTemplate != null) {
        await mutations.updateMutation.mutateAsync({ id: editingTemplate.id, form: values });
      }
      setEditorOpen(false);
    } catch (saveError) {
      void saveError;
      // Mutation onError shows destructive toast; editor stays open (AC-14).
    }
  };

  const isSaving =
    mutations.createMutation.isPending || mutations.updateMutation.isPending;

  return (
    <main className="grid gap-4">
      <TemplatesListHeader
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        showRetired={showRetired}
        onShowRetiredChange={setShowRetired}
        canCreate={canCreate}
        onCreateClick={openCreate}
      />
      <TemplatesListPanel
        rows={filteredRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={retry}
        isEmpty={!isLoading && !isError && templates.length === 0}
        canCreate={canCreate}
        canUpdate={canUpdate}
        onCreateClick={openCreate}
        onPreview={openPreview}
        onEdit={openEdit}
        onRetire={openRetire}
        onActivate={(row) => {
          void mutations.activateMutation.mutateAsync(row.id);
        }}
      />
      <TemplateEditorDialog
        mode={editorMode}
        template={editingTemplate}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        defaultValues={editorDefaultValues}
        canUpdateStrictMode={canUpdate}
        onSave={handleSave}
        isSaving={isSaving}
      />
      <TemplatePreviewDialog
        template={previewTemplate}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
      <TemplateRetireDialog
        template={retireTemplate}
        open={retireOpen}
        onOpenChange={setRetireOpen}
        isPending={mutations.retireMutation.isPending}
        onConfirm={() => {
          if (retireTemplate == null) {
            return;
          }
          void mutations.retireMutation
            .mutateAsync(retireTemplate.id)
            .then(() => setRetireOpen(false))
            .catch(() => undefined);
        }}
      />
    </main>
  );
}

export function TemplatesPage() {
  const { selectedOrganisation } = useUnifiedAuth();
  const organisationId = selectedOrganisation?.id;

  return (
    <PagePermissionGuard
      pageName="comms-templates"
      operation="read"
      scope={organisationId != null ? { organisationId } : undefined}
    >
      <TemplatesPageContent />
    </PagePermissionGuard>
  );
}
