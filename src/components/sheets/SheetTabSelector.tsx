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
  selectedConsideracao?: string | null;
  selectedCriativos?: string | null;
  selectedGoogleDescoberta?: string | null;
  selectedGoogleConsideracao?: string | null;
  onSelect: (selection: {
    perpetua: string;
    distribuicao: string;
    consideracao: string;
    criativos: string;
    googleDescoberta: string | null;
    googleConsideracao: string | null;
  }) => void;
  onBack: () => void;
}

export function SheetTabSelector({
  spreadsheetId,
  spreadsheetName,
  selectedPerpetua = null,
  selectedDistribuicao = null,
  selectedConsideracao = null,
  selectedCriativos = null,
  selectedGoogleDescoberta = null,
  selectedGoogleConsideracao = null,
  onSelect,
  onBack
}: SheetTabSelectorProps) {
  const { toast } = useToast();
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [perpetuaTab, setPerpetuaTab] = useState<string>(selectedPerpetua || '');
  const [distribuicaoTab, setDistribuicaoTab] = useState<string>(selectedDistribuicao || '');
  const [consideracaoTab, setConsideracaoTab] = useState<string>(selectedConsideracao || '');
  const [criativosTab, setCriativosTab] = useState<string>(selectedCriativos || '');
  const [googleDescobertaTab, setGoogleDescobertaTab] = useState<string>(selectedGoogleDescoberta || '');
  const [googleConsideracaoTab, setGoogleConsideracaoTab] = useState<string>(selectedGoogleConsideracao || '');

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
  }, [spreadsheetId, toast]);

  useEffect(() => {
    setPerpetuaTab(selectedPerpetua || '');
  }, [selectedPerpetua]);

  useEffect(() => {
    setDistribuicaoTab(selectedDistribuicao || '');
  }, [selectedDistribuicao]);

  useEffect(() => {
    setConsideracaoTab(selectedConsideracao || '');
  }, [selectedConsideracao]);

  useEffect(() => {
    setCriativosTab(selectedCriativos || '');
  }, [selectedCriativos]);

  useEffect(() => {
    setGoogleDescobertaTab(selectedGoogleDescoberta || '');
  }, [selectedGoogleDescoberta]);

  useEffect(() => {
    setGoogleConsideracaoTab(selectedGoogleConsideracao || '');
  }, [selectedGoogleConsideracao]);

  const handleConfirm = () => {
    if (!perpetuaTab || !distribuicaoTab || !consideracaoTab || !criativosTab) {
      toast({
        title: 'Selecione as quatro abas',
        description: 'Escolha uma aba para Perpetua, Descoberta, Consideracao e Criativos.',
        variant: 'destructive',
      });
      return;
    }

    const hasAnyGoogleTab = Boolean(googleDescobertaTab || googleConsideracaoTab);
    const hasAllGoogleTabs = Boolean(googleDescobertaTab && googleConsideracaoTab);

    if (hasAnyGoogleTab && !hasAllGoogleTabs) {
      toast({
        title: 'Complete as abas do Google',
        description: 'Selecione as duas abas do Google ou deixe ambas em branco.',
        variant: 'destructive',
      });
      return;
    }

    onSelect({
      perpetua: perpetuaTab,
      distribuicao: distribuicaoTab,
      consideracao: consideracaoTab,
      criativos: criativosTab,
      googleDescoberta: googleDescobertaTab || null,
      googleConsideracao: googleConsideracaoTab || null,
    });
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

      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-foreground">META</p>
              <p className="text-sm text-muted-foreground">
                Escolha qual aba alimenta cada visualizacao principal do dashboard.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">Perpetua + Descoberta + Consideracao + Criativos</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Aba da visao Perpetua</p>
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
                <p className="text-sm font-medium">Aba da Descoberta</p>
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

            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Aba da Consideracao</p>
                <Select value={consideracaoTab} onValueChange={setConsideracaoTab}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a aba" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.map((tab) => (
                      <SelectItem key={`cons-${tab.sheetId}`} value={tab.title}>
                        {tab.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Aba dos Criativos</p>
                <Select value={criativosTab} onValueChange={setCriativosTab}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a aba" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.map((tab) => (
                      <SelectItem key={`crea-${tab.sheetId}`} value={tab.title}>
                        {tab.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-foreground">GOOGLE</p>
              <p className="text-sm text-muted-foreground">
                Opcional: selecione as abas do Google Ads para habilitar a visualizacao Google no dashboard.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">Descoberta Google + Consideracao Google</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Aba da Descoberta Google</p>
                <Select value={googleDescobertaTab} onValueChange={setGoogleDescobertaTab}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a aba" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.map((tab) => (
                      <SelectItem key={`google-dist-${tab.sheetId}`} value={tab.title}>
                        {tab.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Aba da Consideracao Google</p>
                <Select value={googleConsideracaoTab} onValueChange={setGoogleConsideracaoTab}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a aba" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.map((tab) => (
                      <SelectItem key={`google-cons-${tab.sheetId}`} value={tab.title}>
                        {tab.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={!perpetuaTab || !distribuicaoTab || !consideracaoTab || !criativosTab}>
          Confirmar Selecao
        </Button>
      </div>
    </div>
  );
}
