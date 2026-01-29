import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface ShareToken {
  id: string;
  project_id: string;
  token: string;
  name: string | null;
  password_hash: string | null;
  expires_at: string | null;
  is_active: boolean;
  allowed_filters: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
}

export interface CreateTokenInput {
  project_id: string;
  name?: string;
  password?: string;
  expires_at?: string | null;
  allowed_filters?: Record<string, unknown>;
}

export function useShareTokens(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: ['share-tokens', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('share_tokens')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ShareToken[];
    },
    enabled: !!projectId,
  });

  const createToken = useMutation({
    mutationFn: async (input: CreateTokenInput) => {
      // Use edge function for secure token creation with bcrypt hashing
      const { data, error } = await supabase.functions.invoke('create-share-token', {
        body: {
          project_id: input.project_id,
          name: input.name,
          password: input.password,
          expires_at: input.expires_at,
          allowed_filters: input.allowed_filters,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-tokens', projectId] });
      toast({
        title: 'Link criado!',
        description: 'O link de compartilhamento foi gerado.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar link',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('share_tokens')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-tokens', projectId] });
      toast({
        title: 'Link revogado',
        description: 'O acesso foi desativado.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao revogar link',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('share_tokens')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-tokens', projectId] });
      toast({
        title: 'Link removido',
        description: 'O link foi excluído permanentemente.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover link',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    tokens: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createToken,
    revokeToken,
    deleteToken,
  };
}
