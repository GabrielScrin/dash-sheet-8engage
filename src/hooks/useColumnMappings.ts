import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ColumnMapping {
  id: string;
  project_id: string;
  source_column: string;
  mapped_to: string;
  mapped_to_key: string | null;
  display_name: string | null;
  data_type: string | null;
  is_big_number: boolean;
  is_funnel_step: boolean;
  funnel_order: number | null;
  format_options: Record<string, any> | null;
  created_at: string;
}

export interface CreateMappingInput {
  project_id: string;
  source_column: string;
  mapped_to: string;
  mapped_to_key?: string;
  display_name?: string;
  data_type?: string;
  is_big_number?: boolean;
  is_funnel_step?: boolean;
  funnel_order?: number;
  format_options?: Record<string, any>;
}

export function useColumnMappings(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['column-mappings', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('column_mappings')
        .select('*')
        .eq('project_id', projectId)
        .order('funnel_order', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as ColumnMapping[];
    },
    enabled: !!projectId,
  });

  const createMapping = useMutation({
    mutationFn: async (input: CreateMappingInput) => {
      const { data, error } = await supabase
        .from('column_mappings')
        .insert({
          project_id: input.project_id,
          source_column: input.source_column,
          mapped_to: input.mapped_to,
          mapped_to_key: input.mapped_to_key,
          display_name: input.display_name || input.source_column,
          data_type: input.data_type || 'text',
          is_big_number: input.is_big_number || false,
          is_funnel_step: input.is_funnel_step || false,
          funnel_order: input.funnel_order,
          format_options: input.format_options || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-mappings', projectId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar mapeamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMapping = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ColumnMapping> & { id: string }) => {
      const { data, error } = await supabase
        .from('column_mappings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-mappings', projectId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar mapeamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMapping = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('column_mappings')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-mappings', projectId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover mapeamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const saveMappings = useMutation({
    mutationFn: async (mappings: CreateMappingInput[]) => {
      // Delete existing mappings first
      const { error: deleteError } = await supabase
        .from('column_mappings')
        .delete()
        .eq('project_id', projectId);

      if (deleteError) throw deleteError;

      // Insert new mappings
      if (mappings.length > 0) {
        const { error: insertError } = await supabase
          .from('column_mappings')
          .insert(mappings.map(m => ({
            project_id: m.project_id,
            source_column: m.source_column,
            mapped_to: m.mapped_to,
            mapped_to_key: m.mapped_to_key,
            display_name: m.display_name || m.source_column,
            data_type: m.data_type || 'text',
            is_big_number: m.is_big_number || false,
            is_funnel_step: m.is_funnel_step || false,
            funnel_order: m.funnel_order,
            format_options: m.format_options || {},
          })));

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-mappings', projectId] });
      toast({
        title: 'Mapeamentos salvos!',
        description: 'As configurações foram atualizadas.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao salvar mapeamentos',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    mappings: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createMapping,
    updateMapping,
    deleteMapping,
    saveMappings,
  };
}
