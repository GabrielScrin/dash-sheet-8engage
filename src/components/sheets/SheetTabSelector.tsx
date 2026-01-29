import { useState, useEffect } from 'react';
import { Table2, Loader2, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

interface SheetTabSelectorProps {
  spreadsheetId: string;
  spreadsheetName: string;
  selectedTabs?: string[];
  onSelect: (tabs: SheetTab[]) => void;
  onBack: () => void;
}

export function SheetTabSelector({ 
  spreadsheetId, 
  spreadsheetName, 
  selectedTabs = [],
  onSelect, 
  onBack 
}: SheetTabSelectorProps) {
  const { toast } = useToast();
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedTabs));

  useEffect(() => {
    const fetchTabs = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const providerToken = sessionData.session?.provider_token;

        const { data, error } = await supabase.functions.invoke('google-sheets', {
          body: { action: 'get-sheets', spreadsheetId },
          headers: providerToken ? { 'x-google-token': providerToken } : undefined,
        });

        if (error) throw error;
        setTabs(data || []);
      } catch (error: any) {
        console.error('Error fetching tabs:', error);
        toast({
          title: 'Erro ao carregar abas',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTabs();
  }, [spreadsheetId]);

  const toggleTab = (tab: SheetTab) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tab.title)) {
        next.delete(tab.title);
      } else {
        next.add(tab.title);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedTabObjects = tabs.filter(tab => selected.has(tab.title));
    if (selectedTabObjects.length === 0) {
      toast({
        title: 'Selecione ao menos uma aba',
        description: 'Você precisa selecionar ao menos uma aba para continuar.',
        variant: 'destructive',
      });
      return;
    }
    onSelect(selectedTabObjects);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Carregando abas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={onBack} className="hover:underline">
          Planilhas
        </button>
        <ChevronRight className="h-4 w-4" />
        <span className="font-medium text-foreground">{spreadsheetName}</span>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Selecione as abas que contêm os dados do dashboard:
        </p>
        {selected.size > 0 && (
          <Badge variant="secondary">
            {selected.size} aba{selected.size > 1 ? 's' : ''} selecionada{selected.size > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="grid gap-2">
        {tabs.map((tab) => {
          const isSelected = selected.has(tab.title);
          return (
            <Card
              key={tab.sheetId}
              className={`cursor-pointer transition-colors hover:bg-muted ${
                isSelected ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => toggleTab(tab)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleTab(tab)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Table2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{tab.title}</p>
                  <p className="text-xs text-muted-foreground">Aba {tab.index + 1}</p>
                </div>
                {isSelected && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={selected.size === 0}>
          Confirmar Seleção
        </Button>
      </div>
    </div>
  );
}
