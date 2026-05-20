import { useMutation } from '@tanstack/react-query';
import { toast } from '@solvera/pace-core/components';
import { usePumpSupabase } from '@/hooks/comms/usePumpSupabase.js';
import { useUnifiedAuth } from '@solvera/pace-core/hooks';

interface DeleteInput {
  messageId: string;
}

export function useDeletePumpDraft(onListRefresh?: () => void) {
  const supabase = usePumpSupabase();
  const { user } = useUnifiedAuth();

  return useMutation({
    mutationFn: async ({ messageId }: DeleteInput) => {
      const userId = user?.id;
      if (userId == null) {
        throw new Error('Not signed in.');
      }
      const { data, error } = await (supabase.from('pump_message') as {
        delete: () => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => {
                select: (cols: string) => Promise<{ data: { id: string }[] | null; error: Error | null }>;
              };
            };
          };
        };
      })
        .delete()
        .eq('id', messageId)
        .eq('status', 'draft')
        .eq('created_by', userId)
        .select('id');
      if (error) {
        throw error;
      }
      return data ?? [];
    },
    onSuccess: (rows) => {
      if (rows.length === 0) {
        toast({ variant: 'default', title: 'Draft already removed.' });
      } else {
        toast({ variant: 'success', title: 'Draft deleted.' });
      }
      onListRefresh?.();
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: error.message,
      });
    },
  });
}
