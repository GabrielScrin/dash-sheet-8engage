import { useState, useEffect } from 'react';
import { Loader2, GripVertical, Trash2, Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSheetData } from '@/hooks/useSheetData';
import { useColumnMappings, CreateMappingInput } from '@/hooks/useColumnMappings';
import { useToast } from '@/hooks/use-toast';

interface ColumnMapperProps {
  projectId: string;
  spreadsheetId: string;
  sheetNames: string[];
}

type MappingCategory = 'big_number' | 'funnel' | 'creative' | 'weekly';

interface LocalMapping {
  id?: string;
  source_column: string;
  category: MappingCategory;
  display_name: string;
  funnel_order?: number;
}

const CATEGORY_LABELS: Record<MappingCategory, string> = {
  big_number: 'Big Numbers',
  funnel: 'Etapas do Funil',
  creative: 'Dados de Criativos',
  weekly: 'Comparação Semanal',
};

export function ColumnMapper({ projectId, spreadsheetId, sheetNames }: ColumnMapperProps) {
  const { toast } = useToast();
  const [localMappings, setLocalMappings] = useState<LocalMapping[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MappingCategory>('big_number');

  // Fetch headers from all selected sheets and merge them
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);

  useEffect(() => {
    const fetchAllHeaders = async () => {
      if (sheetNames.length === 0) return;
      setLoadingHeaders(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const providerToken = sessionData.session?.provider_token;

        const headerPromises = sheetNames.map(async (name) => {
          const { data, error } = await supabase.functions.invoke('google-sheets', {
            body: { action: 'read-data', spreadsheetId, sheetName: name, range: 'A1:Z1' },
            headers: providerToken ? { 'x-google-token': providerToken } : undefined,
          });
          if (error) throw error;
          return data?.headers || [];
        });

        const allHeadersArrays = await Promise.all(headerPromises);
        const uniqueHeaders = Array.from(new Set(allHeadersArrays.flat()));
        setHeaders(uniqueHeaders);
      } catch (error: any) {
        console.error('Error fetching headers:', error);
        toast({
          title: 'Erro ao carregar colunas',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setLoadingHeaders(false);
      }
    };

    fetchAllHeaders();
  }, [spreadsheetId, JSON.stringify(sheetNames)]);

  const { mappings, isLoading: loadingMappings, saveMappings } = useColumnMappings(projectId);

  // Initialize local state from saved mappings
  useEffect(() => {
    if (mappings.length > 0) {
      setLocalMappings(mappings.map(m => ({
        id: m.id,
        source_column: m.source_column,
        category: m.is_big_number ? 'big_number' : m.is_funnel_step ? 'funnel' : m.mapped_to as MappingCategory,
        display_name: m.display_name || m.source_column,
        funnel_order: m.funnel_order || undefined,
      })));
    }
  }, [mappings]);

  const usedColumns = new Set(localMappings.map(m => m.source_column));
  const availableColumns = headers.filter(h => !usedColumns.has(h));

  const addMapping = (column: string) => {
    setLocalMappings(prev => [
      ...prev,
      {
        source_column: column,
        category: selectedCategory,
        display_name: column,
        funnel_order: selectedCategory === 'funnel'
          ? prev.filter(m => m.category === 'funnel').length + 1
          : undefined,
      },
    ]);
  };

  const removeMapping = (column: string) => {
    setLocalMappings(prev => prev.filter(m => m.source_column !== column));
  };

  const handleSave = async () => {
    const mappingsToSave: CreateMappingInput[] = localMappings.map(m => ({
      project_id: projectId,
      source_column: m.source_column,
      mapped_to: m.category,
      display_name: m.display_name,
      is_big_number: m.category === 'big_number',
      is_funnel_step: m.category === 'funnel',
      funnel_order: m.funnel_order,
    }));

    await saveMappings.mutateAsync(mappingsToSave);
  };

  const getMappingsByCategory = (category: MappingCategory) => {
    return localMappings.filter(m => m.category === category);
  };

  if (loadingHeaders || loadingMappings) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Carregando colunas...</p>
      </div>
    );
  }

  if (sheetNames.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-muted-foreground">
          Primeiro, selecione as abas da planilha na etapa anterior.
        </p>
      </div>
    );
  }

  if (headers.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-muted-foreground">
          Não foi possível carregar as colunas da planilha. Verifique se a aba contém dados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 bg-muted/50">
        <p className="text-sm">
          <span className="text-muted-foreground">Planilha:</span>{' '}
          <span className="font-medium">{sheetNames.join(', ')}</span>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Available Columns */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Colunas Disponíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as MappingCategory)}>
                <SelectTrigger>
                  <SelectValue placeholder="Categoria do mapeamento" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {availableColumns.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Todas as colunas foram mapeadas
                  </p>
                ) : (
                  availableColumns.map((column) => (
                    <div
                      key={column}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted cursor-pointer"
                      onClick={() => addMapping(column)}
                    >
                      <span className="text-sm font-medium">{column}</span>
                      <Button size="sm" variant="ghost">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Mapped Columns */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mapeamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
                  const categoryMappings = getMappingsByCategory(category as MappingCategory);
                  if (categoryMappings.length === 0) return null;

                  return (
                    <div key={category}>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">{label}</h4>
                      <div className="space-y-1">
                        {categoryMappings.map((mapping, index) => (
                          <div
                            key={mapping.source_column}
                            className="flex items-center gap-2 rounded-lg border p-2 bg-background"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            {mapping.category === 'funnel' && (
                              <Badge variant="outline" className="text-xs">
                                {index + 1}
                              </Badge>
                            )}
                            <span className="flex-1 text-sm">{mapping.source_column}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => removeMapping(mapping.source_column)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {localMappings.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Clique em uma coluna para adicionar ao mapeamento
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMappings.isPending} className="gap-2">
          {saveMappings.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Mapeamentos
        </Button>
      </div>
    </div>
  );
}
