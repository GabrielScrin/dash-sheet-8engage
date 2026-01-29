import * as React from 'react';
import { useState, useEffect } from 'react';
import { Loader2, GripVertical, Save, Hash, DollarSign, Percent, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useColumnMappings } from '@/hooks/useColumnMappings';
import { useSheetData } from '@/hooks/useSheetData';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface KPIConfiguratorProps {
  projectId: string;
  spreadsheetId: string;
  sheetNames: string[];
}

type FormatType = 'number' | 'currency' | 'percent' | 'text';

interface KPIConfig {
  id: string;
  source_column: string;
  display_name: string;
  category: string;
  mapped_to_key: string | null;
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

const CATEGORY_LABELS: Record<string, string> = {
  big_number: 'Big Numbers',
  funnel: 'Etapas do Funil',
  creative: 'Dados de Criativos',
  weekly: 'Comparação Semanal',
  distribution: 'Distribuição de Conteúdo',
};

const CATEGORY_KEYS: Record<string, { label: string; value: string }[]> = {
  weekly: [
    { label: 'Vendas', value: 'sales' },
    { label: 'Investimento', value: 'investment' },
    { label: 'Faturamento', value: 'revenue' },
    { label: 'ROAS', value: 'roas' },
    { label: 'Conversão', value: 'conversion' },
  ],
  distribution: [
    { label: 'Alcance', value: 'reach' },
    { label: 'Impressões', value: 'impressions' },
    { label: 'Engajamento', value: 'engagement' },
    { label: 'Vídeo Views', value: 'video_views' },
    { label: 'Seguidores Ganhos', value: 'followers' },
  ],
  creative: [
    { label: 'Cliques', value: 'clicks' },
    { label: 'Impressões', value: 'impressions' },
    { label: 'Vendas', value: 'sales' },
    { label: 'Faturamento', value: 'revenue' },
  ],
};

export function KPIConfigurator({ projectId, spreadsheetId, sheetNames }: KPIConfiguratorProps) {
  const { toast } = useToast();
  const { mappings, isLoading } = useColumnMappings(projectId);
  const [kpis, setKpis] = useState<KPIConfig[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch sample row from first sheet for preview
  const { data: sheetData } = useSheetData({
    spreadsheetId,
    sheetName: sheetNames[0] || '',
    enabled: sheetNames.length > 0,
  });

  const sampleRow = sheetData?.rows?.[0] || {};

  useEffect(() => {
    if (mappings && mappings.length > 0) {
      console.log('Mapping KPI configs from:', mappings);
      setKpis(mappings.map(m => ({
        id: m.id,
        source_column: m.source_column,
        category: m.is_big_number ? 'big_number' : m.is_funnel_step ? 'funnel' : (m.mapped_to || 'big_number'),
        mapped_to_key: (m as any).mapped_to_key || null,
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
      console.log('Saving KPI configs:', kpis);
      for (const kpi of kpis) {
        const { error } = await supabase
          .from('column_mappings')
          .update({
            display_name: kpi.display_name,
            mapped_to_key: kpi.mapped_to_key,
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
        description: 'As configurações de KPIs e colunas foram atualizadas.',
      });
    } catch (error: any) {
      console.error('Error saving KPI configs:', error);
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

  if (kpis.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <p className="text-muted-foreground">
          Primeiro, mapeie as colunas na etapa anterior para definir os KPIs e métricas.
        </p>
      </div>
    );
  }

  const groupedKpis = kpis.reduce((acc, kpi) => {
    if (!acc[kpi.category]) acc[kpi.category] = [];
    acc[kpi.category].push(kpi);
    return acc;
  }, {} as Record<string, KPIConfig[]>);

  return (
    <div className="space-y-6">
      <ScrollArea className="h-[600px] pr-4">
        <div className="space-y-8">
          {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
            const categoryKpis = groupedKpis[category];
            if (!categoryKpis || categoryKpis.length === 0) return null;

            // Sort funnel steps by funnel_order if available
            if (category === 'funnel') {
              categoryKpis.sort((a, b) => {
                const aMapping = mappings?.find(m => m.id === a.id);
                const bMapping = mappings?.find(m => m.id === b.id);
                return (aMapping?.funnel_order || 0) - (bMapping?.funnel_order || 0);
              });
            }

            return (
              <section key={category} className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <h3 className="font-semibold">{label}</h3>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider">
                    {categoryKpis.length}
                  </Badge>
                </div>

                <div className="grid gap-4">
                  {categoryKpis.map((kpi) => (
                    <Card key={kpi.id}>
                      <CardContent className="pt-6">
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                          {/* Basic Info */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-tight">
                                Coluna original
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {sampleRow[kpi.source_column] !== undefined ? String(sampleRow[kpi.source_column]) : '-'}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Identificação (Dashboard)</Label>
                              <Input
                                value={kpi.display_name}
                                onChange={(e) => updateKPI(kpi.id, { display_name: e.target.value })}
                                placeholder="Nome para este campo"
                                className="h-9"
                              />
                            </div>
                          </div>

                          {/* Category Specific Config */}
                          <div className="space-y-2">
                            {CATEGORY_KEYS[category] ? (
                              <>
                                <Label className="text-xs">Mapear para Campo do Dashboard</Label>
                                <Select
                                  value={kpi.mapped_to_key || ''}
                                  onValueChange={(v) => updateKPI(kpi.id, { mapped_to_key: v })}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Selecione o campo alvo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CATEGORY_KEYS[category].map((key) => (
                                      <SelectItem key={key.value} value={key.value}>
                                        {key.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </>
                            ) : (
                              <>
                                <Label className="text-xs">Formato de Exibição</Label>
                                <Select
                                  value={kpi.format_type}
                                  onValueChange={(v) => updateKPI(kpi.id, { format_type: v as FormatType })}
                                >
                                  <SelectTrigger className="h-9">
                                    <div className="flex items-center gap-2">
                                      {FORMAT_ICONS[kpi.format_type]}
                                      <SelectValue />
                                    </div>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="number">Número</SelectItem>
                                    <SelectItem value="currency">Moeda</SelectItem>
                                    <SelectItem value="percent">Porcentagem</SelectItem>
                                    <SelectItem value="text">Texto</SelectItem>
                                  </SelectContent>
                                </Select>
                              </>
                            )}
                          </div>

                          {/* Formatting options if applicable */}
                          <div className="flex gap-4">
                            {(kpi.format_type === 'currency' || kpi.format_type === 'number' || kpi.format_type === 'percent') && (
                              <div className="space-y-2 flex-1">
                                <Label className="text-xs">Casas Decimais</Label>
                                <Select
                                  value={String(kpi.decimal_places)}
                                  onValueChange={(v) => updateKPI(kpi.id, { decimal_places: parseInt(v) })}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[0, 1, 2, 3].map(n => (
                                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {kpi.format_type === 'currency' && (
                              <div className="space-y-2 w-20">
                                <Label className="text-xs">Simbolo</Label>
                                <Input
                                  value={kpi.currency_symbol}
                                  onChange={(e) => updateKPI(kpi.id, { currency_symbol: e.target.value })}
                                  className="h-9"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </ScrollArea>

      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSave} disabled={saving} className="gap-2 px-8">
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
