import { useState, useEffect } from 'react';
import { Loader2, GripVertical, Save, Hash, DollarSign, Percent, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useColumnMappings } from '@/hooks/useColumnMappings';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface KPIConfiguratorProps {
  projectId: string;
}

type FormatType = 'number' | 'currency' | 'percent' | 'text';

interface KPIConfig {
  id: string;
  source_column: string;
  display_name: string;
  format_type: FormatType;
  decimal_places: number;
  currency_symbol: string;
}

const FORMAT_ICONS: Record<FormatType, React.ReactNode> = {
  number: <Hash className="h-4 w-4" />,
  currency: <DollarSign className="h-4 w-4" />,
  percent: <Percent className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
};

export function KPIConfigurator({ projectId }: KPIConfiguratorProps) {
  const { toast } = useToast();
  const { mappings, isLoading, saveMappings } = useColumnMappings(projectId);
  const [kpis, setKpis] = useState<KPIConfig[]>([]);
  const [saving, setSaving] = useState(false);

  // Filter only big_number mappings
  const bigNumberMappings = mappings.filter(m => m.is_big_number);
  const funnelMappings = mappings.filter(m => m.is_funnel_step);

  useEffect(() => {
    if (bigNumberMappings.length > 0) {
      setKpis(bigNumberMappings.map(m => ({
        id: m.id,
        source_column: m.source_column,
        display_name: m.display_name || m.source_column,
        format_type: (m.format_options as any)?.format_type || 'number',
        decimal_places: (m.format_options as any)?.decimal_places || 0,
        currency_symbol: (m.format_options as any)?.currency_symbol || 'R$',
      })));
    }
  }, [mappings]);

  const updateKPI = (id: string, updates: Partial<KPIConfig>) => {
    setKpis(prev => prev.map(kpi => 
      kpi.id === id ? { ...kpi, ...updates } : kpi
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const kpi of kpis) {
        const { error } = await supabase
          .from('column_mappings')
          .update({
            display_name: kpi.display_name,
            format_options: {
              format_type: kpi.format_type,
              decimal_places: kpi.decimal_places,
              currency_symbol: kpi.currency_symbol,
            },
          })
          .eq('id', kpi.id);

        if (error) throw error;
      }

      toast({
        title: 'Configurações salvas!',
        description: 'Os KPIs foram atualizados.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Carregando configurações...</p>
      </div>
    );
  }

  if (bigNumberMappings.length === 0 && funnelMappings.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-muted-foreground">
          Primeiro, mapeie as colunas na etapa anterior para definir os KPIs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Big Numbers Configuration */}
      {kpis.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Big Numbers ({kpis.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 pr-4">
                {kpis.map((kpi) => (
                  <div key={kpi.id} className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">
                        Coluna: {kpi.source_column}
                      </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Nome de Exibição</Label>
                        <Input
                          value={kpi.display_name}
                          onChange={(e) => updateKPI(kpi.id, { display_name: e.target.value })}
                          placeholder="Nome no dashboard"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Formato</Label>
                        <Select
                          value={kpi.format_type}
                          onValueChange={(v) => updateKPI(kpi.id, { format_type: v as FormatType })}
                        >
                          <SelectTrigger>
                            <div className="flex items-center gap-2">
                              {FORMAT_ICONS[kpi.format_type]}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="number">
                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4" /> Número
                              </div>
                            </SelectItem>
                            <SelectItem value="currency">
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4" /> Moeda
                              </div>
                            </SelectItem>
                            <SelectItem value="percent">
                              <div className="flex items-center gap-2">
                                <Percent className="h-4 w-4" /> Porcentagem
                              </div>
                            </SelectItem>
                            <SelectItem value="text">
                              <div className="flex items-center gap-2">
                                <Type className="h-4 w-4" /> Texto
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {kpi.format_type === 'currency' && (
                        <div className="space-y-2">
                          <Label>Símbolo da Moeda</Label>
                          <Input
                            value={kpi.currency_symbol}
                            onChange={(e) => updateKPI(kpi.id, { currency_symbol: e.target.value })}
                            placeholder="R$"
                            className="w-24"
                          />
                        </div>
                      )}

                      {(kpi.format_type === 'number' || kpi.format_type === 'currency' || kpi.format_type === 'percent') && (
                        <div className="space-y-2">
                          <Label>Casas Decimais</Label>
                          <Select
                            value={String(kpi.decimal_places)}
                            onValueChange={(v) => updateKPI(kpi.id, { decimal_places: parseInt(v) })}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0</SelectItem>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Funnel Preview */}
      {funnelMappings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Etapas do Funil ({funnelMappings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {funnelMappings
                .sort((a, b) => (a.funnel_order || 0) - (b.funnel_order || 0))
                .map((step, index) => (
                  <div key={step.id} className="flex items-center">
                    <div className="rounded-lg border bg-muted/50 px-4 py-2 text-sm whitespace-nowrap">
                      {step.display_name || step.source_column}
                    </div>
                    {index < funnelMappings.length - 1 && (
                      <div className="mx-2 text-muted-foreground">→</div>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
