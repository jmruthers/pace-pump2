import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@solvera/pace-core/components';
import { useSecureSupabase } from '@solvera/pace-core/rbac';
import { buildTemplateSavePayload } from '@/lib/templates/buildTemplateSavePayload';
import { pumpOrganisationTemplates } from '@/lib/templates/templatesDb';
import type { OrganisationTemplateRow, TemplateFormValues } from '@/lib/templates/types';
import { organisationTemplatesQueryKey } from './queryKeys';

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Request failed';
}

export function useTemplateMutations(organisationId: string, userId: string) {
  const client = useSecureSupabase();
  const queryClient = useQueryClient();

  const invalidateList = async () => {
    await queryClient.invalidateQueries({
      queryKey: organisationTemplatesQueryKey(organisationId),
    });
  };

  const createMutation = useMutation({
    mutationFn: async (form: TemplateFormValues) => {
      if (client == null) {
        throw new Error('Not authenticated');
      }
      const payload = buildTemplateSavePayload({
        form,
        organisationId,
        userId,
        mode: 'create',
      });
      const { error } = await pumpOrganisationTemplates(client).insert(payload);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      await invalidateList();
      toast({ variant: 'success', title: 'Template created.' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: mutationErrorMessage(error) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: TemplateFormValues }) => {
      if (client == null) {
        throw new Error('Not authenticated');
      }
      const payload = buildTemplateSavePayload({
        form,
        organisationId,
        userId,
        mode: 'update',
      });
      const { created_by: omittedCreatedBy, ...updateFields } = payload;
      void omittedCreatedBy;
      const { error } = await pumpOrganisationTemplates(client).update(updateFields).eq('id', id);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      await invalidateList();
      toast({ variant: 'success', title: 'Template updated.' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: mutationErrorMessage(error) });
    },
  });

  const retireMutation = useMutation({
    mutationFn: async (id: string) => {
      if (client == null) {
        throw new Error('Not authenticated');
      }
      const { error } = await pumpOrganisationTemplates(client)
        .update({ is_active: false })
        .eq('id', id);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      await invalidateList();
      toast({ variant: 'success', title: 'Template retired.' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: mutationErrorMessage(error) });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (client == null) {
        throw new Error('Not authenticated');
      }
      const { error } = await pumpOrganisationTemplates(client)
        .update({ is_active: true })
        .eq('id', id);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      await invalidateList();
      toast({ variant: 'success', title: 'Template activated.' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: mutationErrorMessage(error) });
    },
  });

  return {
    createMutation,
    updateMutation,
    retireMutation,
    activateMutation,
    rowToFormValues(row: OrganisationTemplateRow): TemplateFormValues {
      return {
        name: row.name,
        description: row.description ?? '',
        channel: row.channel,
        subject: row.subject ?? '',
        body: row.channel === 'email' ? (row.body_html ?? '') : row.body_text,
        require_merge_field_validation: row.require_merge_field_validation,
      };
    },
  };
}
