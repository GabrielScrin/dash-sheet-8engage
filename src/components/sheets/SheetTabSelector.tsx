import { useState, useEffect } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  selectedPerpetua?: string | null;
  selectedDistribuicao?: string | null;
  onSelect: (selection: { perpetua: string; distribuicao: string }) => void;
  onBack: () => void;
}

export function SheetTabSelector({
  spreadsheetId,
  spreadsheetName,
  selectedPerpetua = null,
  selectedDistribuicao = null,
  onSelect,
  onBack
}: SheetTabSelectorProps) {
  const { toast } = useToast();
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [perpetuaTab, setPerpetuaTab] = useState<string>(selectedPerpetua || '');
  const [distribuicaoTab, setDistribuicaoTab] = useState<string>(selectedDistribuicao || '');

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

  useEffect(() => {
    setPerpetuaTab(selectedPerpetua || '');
  }, [selectedPerpetua]);

  useEffect(() => {
    setDistribuicaoTab(selectedDistribuicao || '');
  }, [selectedDistribuicao]);

  const handleConfirm = () => {
    if (!perpetuaTab || !distribuicaoTab) {
      toast({
        title: 'Selecione as duas abas',
        description: 'Escolha uma aba para Perpétua e outra para Distribuição.',
        variant: 'destructive',
      });
      return;
    }

    onSelect({ perpetua: perpetuaTab, distribuicao: distribuicaoTab });
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
          Escolha qual aba alimenta cada visualização do dashboard:
        </p>
        <div className="text-xs text-muted-foreground">Perpétua + Distribuição</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Aba da visão Perpétua</p>
            <Select value={perpetuaTab} onValueChange={setPerpetuaTab}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a aba" />
              </SelectTrigger>
              <SelectContent>
                {tabs.map((tab) => (
                  <SelectItem key={`perp-${tab.sheetId}`} value={tab.title}>
                    {tab.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Aba da Distribuição</p>
            <Select value={distribuicaoTab} onValueChange={setDistribuicaoTab}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a aba" />
              </SelectTrigger>
              <SelectContent>
                {tabs.map((tab) => (
                  <SelectItem key={`dist-${tab.sheetId}`} value={tab.title}>
                    {tab.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={!perpetuaTab || !distribuicaoTab}>
          Confirmar Seleção
        </Button>
      </div>
    </div>
  );
}
