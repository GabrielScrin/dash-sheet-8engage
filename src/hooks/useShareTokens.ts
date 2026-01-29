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
  allowed_filters: Record<string, any> | null;
  created_at: string;
  created_by: string | null;
}

export interface CreateTokenInput {
  project_id: string;
  name?: string;
  password?: string;
  expires_at?: string | null;
  allowed_filters?: Record<string, any>;
}

function generateToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function useShareTokens(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

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
      const token = generateToken();
      const passwordHash = input.password ? await hashPassword(input.password) : null;

      const { data, error } = await supabase
        .from('share_tokens')
        .insert({
          project_id: input.project_id,
          token,
          name: input.name || 'Link de Acesso',
          password_hash: passwordHash,
          expires_at: input.expires_at,
          allowed_filters: input.allowed_filters || {},
          is_active: true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ShareToken;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-tokens', projectId] });
      toast({
        title: 'Link criado!',
        description: 'O link de compartilhamento foi gerado.',
      });
    },
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
