import * as React from 'react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BigNumberCard } from '@/components/dashboard/BigNumberCard';
import { WeeklyComparisonTable } from '@/components/dashboard/WeeklyComparisonTable';
import { CreativePerformanceTable } from '@/components/dashboard/CreativePerformanceTable';
import { FunnelVisualization } from '@/components/dashboard/FunnelVisualization';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { useColumnMappings } from '@/hooks/useColumnMappings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { processDashboardData } from '@/lib/dashboard-utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format, subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardViewProps {
  projectId: string;
  isPreview?: boolean;
  shareToken?: string;
}

export function DashboardView({ projectId, isPreview = false, shareToken }: DashboardViewProps) {
  const { signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState('perpetua');
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);
  const [googleReconnectRequired, setGoogleReconnectRequired] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // 1. Fetch Project Details
  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      // If we have a shareToken, we might need a public endpoint or bypass RLS
      // For now, let's assume the user has access or we use the supabase service role indirectly
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // 2. Fetch Column Mappings
  const { mappings, isLoading: loadingMappings } = useColumnMappings(projectId);

  const metaInsightsQuery = useQuery({
    queryKey: [
      'meta-insights',
      project?.source_config?.ad_account_id,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
    ],
    queryFn: async () => {
      const accountId = project?.source_config?.ad_account_id;
      if (!accountId) return [];

      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=insights&accountId=${encodeURIComponent(accountId)}&startDate=${startDate}&endDate=${endDate}`
      );
      if (error) throw error;

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!project?.source_config?.ad_account_id && !shareToken,
  });

  // 3. Fetch Sheet Data from all configured sheets
  const sheetNames: string[] = Array.isArray(project?.sheet_names)
    ? (project.sheet_names as string[])
    : (project?.sheet_name ? [project.sheet_name] : []);

  // We'll use a custom query to fetch all sheets in parallel
  const allSheetsQuery = useQuery({
    queryKey: ['all-sheets-data', project?.spreadsheet_id, sheetNames, shareToken],
    queryFn: async () => {
      const results = await Promise.all(
        sheetNames.map(async (name: string) => {
          try {
            const range = `'${name}'!A:Z`;
            const { data: sessionData } = await supabase.auth.getSession();
            const providerToken = sessionData.session?.provider_token;

            const invokeHeaders: Record<string, string> = {};
            if (providerToken) invokeHeaders['x-google-token'] = providerToken;
            if (shareToken) invokeHeaders['x-share-token'] = shareToken;

            console.log(`Fetching sheet: ${name}, Range: ${range}`);
            const { data, error } = await supabase.functions.invoke('google-sheets', {
              body: {
                action: 'read-data',
                spreadsheetId: project?.spreadsheet_id,
                range
              },
              headers: invokeHeaders,
            });

            if (error) {
              console.error(`Error fetching sheet ${name}:`, error);
              // Check for Google reconnect error
              const errorBody = error.message || '';
              if (errorBody.includes('GOOGLE_RECONNECT_REQUIRED')) {
                setGoogleReconnectRequired(true);
              }
              return [];
            }

            // Basic row transformation (similar to useSheetData)
            const rows = data.values || [];
            console.log(`Sheet ${name} returned ${rows.length} rows`);

            if (rows.length < 2) return [];
            const headers = rows[0] as string[];
            return rows.slice(1).map((row: any[]) => {
              const obj: Record<string, any> = {};
              headers.forEach((h, i) => { obj[h] = row[i] || ''; });
              return obj;
            });
          } catch (err: any) {
            console.error(`Unexpected error fetching sheet ${name}:`, err);
            // Check for Google reconnect error in catch
            if (err?.message?.includes('GOOGLE_RECONNECT_REQUIRED') || 
                err?.context?.body?.includes('GOOGLE_RECONNECT_REQUIRED')) {
              setGoogleReconnectRequired(true);
            }
            return [];
          }
        })
      );
      const flattened = results.flat();
      console.log(`Total rows aggregated: ${flattened.length}`);
      return flattened;
    },
    enabled: !!project?.spreadsheet_id && sheetNames.length > 0,
  });

  const sourceRows = (project?.source_type === 'meta_ads' ? (metaInsightsQuery.data || []) : (allSheetsQuery.data || [])) as any[];

  // 4. Apply Filters
  const filteredRows = useMemo(() => {
    if (!sourceRows.length) return [];

    return sourceRows.filter(row => {
      // Date Filter
      if (dateRange?.from) {
        // Try to find a date column
        const dateKey = Object.keys(row).find(k =>
          k.toLowerCase().includes('data') || k.toLowerCase().includes('date')
        );
        if (dateKey && row[dateKey]) {
          const rowDate = new Date(row[dateKey]);
          if (!isNaN(rowDate.getTime())) {
            // Normalize dates to start of day for inclusive comparison
            const from = new Date(dateRange.from!);
            from.setHours(0, 0, 0, 0);

            const to = dateRange.to ? new Date(dateRange.to) : new Date();
            to.setHours(23, 59, 59, 999);

            if (rowDate < from) return false;
            if (rowDate > to) return false;
          }
        }
      }

      // Creative Filter
      if (selectedCreative) {
        const creativeKey = Object.keys(row).find(k =>
          k.toLowerCase().includes('criativo') || k.toLowerCase().includes('creative')
        );
        if (creativeKey && row[creativeKey] !== selectedCreative) {
          return false;
        }
      }

      return true;
    });
  }, [sourceRows, dateRange, selectedCreative]);

  // 5. Process Data
  const effectiveMappings = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return mappings || [];

    // For Meta Ads we can render meaningful KPIs even if the user didn't configure mappings yet.
    return [
      {
        id: 'meta_spend',
        project_id: projectId,
        source_column: 'spend',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'Gasto',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'currency' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_impressions',
        project_id: projectId,
        source_column: 'impressions',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'Impressões',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'number' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_clicks',
        project_id: projectId,
        source_column: 'clicks',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'Cliques',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'number' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_ctr',
        project_id: projectId,
        source_column: 'ctr',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'CTR',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'percent' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_cpc',
        project_id: projectId,
        source_column: 'cpc',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'CPC',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'currency' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_cpl',
        project_id: projectId,
        source_column: 'cpl',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'CPL',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'currency' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_leads_funnel',
        project_id: projectId,
        source_column: 'leads',
        mapped_to: 'funnel',
        mapped_to_key: null,
        display_name: 'Leads',
        data_type: 'number',
        is_big_number: false,
        is_funnel_step: true,
        funnel_order: 1,
        format_options: { format_type: 'number' },
        created_at: new Date().toISOString(),
      },
    ] as any[];
  }, [mappings, project?.source_config?.ad_account_id, project?.source_type, projectId]);

  const processedData = useMemo(() => {
    return processDashboardData(filteredRows, effectiveMappings as any);
  }, [filteredRows, effectiveMappings]);

  const isLoading = loadingProject || loadingMappings || allSheetsQuery.isLoading || metaInsightsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Carregando dados do dashboard...</p>
      </div>
    );
  }

  const handleReconnectGoogle = async () => {
    setIsReconnecting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Reconnect failed:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  // Show reconnect prompt if Google token expired
  if (googleReconnectRequired && !shareToken) {
    return (
      <div className="container py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Reconexão Necessária</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-4">
              Sua conexão com o Google expirou. Reconecte sua conta para acessar os dados das planilhas.
            </p>
            <Button onClick={handleReconnectGoogle} disabled={isReconnecting}>
              {isReconnecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reconectar Conta Google
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (allSheetsQuery.error) {
    return (
      <div className="container py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar dados</AlertTitle>
          <AlertDescription>
            Não foi possível acessar as planilhas do Google. Verifique as permissões.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const setupWarnings = (() => {
    const warnings: { title: string; description: string }[] = [];

    if (!project) {
      warnings.push({
        title: 'Projeto não carregado',
        description: 'Não foi possível carregar as informações do projeto.',
      });
      return warnings;
    }

    if (project.source_type === 'meta_ads') {
      if (shareToken) {
        warnings.push({
          title: 'Meta Ads indisponível no link compartilhado',
          description: 'Por enquanto, o dashboard público não consegue buscar dados da Meta. Abra logado para visualizar.',
        });
      }
      if (!project.source_config?.ad_account_id) {
        warnings.push({
          title: 'Meta Ads não configurado',
          description: 'Conecte a Meta e selecione uma conta de anúncios para começar a puxar dados.',
        });
      } else if (!metaInsightsQuery.isLoading && (metaInsightsQuery.data || []).length === 0) {
        warnings.push({
          title: 'Sem dados da Meta no período',
          description: 'Tente ampliar o período ou verifique se a conta tem campanhas/entregas.',
        });
      }
      return warnings;
    }

    if (!project.spreadsheet_id) {
      warnings.push({
        title: 'Planilha não configurada',
        description: 'Selecione uma planilha do Google para começar a puxar dados.',
      });
    } else if (sheetNames.length === 0) {
      warnings.push({
        title: 'Abas não selecionadas',
        description: 'Selecione ao menos uma aba da planilha para ler os dados.',
      });
    }

    if (!mappings || mappings.length === 0) {
      warnings.push({
        title: 'Mapeamento de colunas pendente',
        description: 'Sem mapeamento, o dashboard continua visível, mas não sabe quais métricas exibir.',
      });
    }

    if (project.spreadsheet_id && sheetNames.length > 0 && sourceRows.length === 0 && !allSheetsQuery.isLoading) {
      warnings.push({
        title: 'Nenhum dado encontrado',
        description: `As abas selecionadas (${sheetNames.join(', ')}) estão vazias, inacessíveis ou em um formato não esperado.`,
      });
    }

    return warnings;
  })();

  return (
    <div className="container py-6">
      {setupWarnings.length > 0 && (
        <div className="mb-6 space-y-3">
          {setupWarnings.map((w) => (
            <Alert key={w.title}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{w.title}</AlertTitle>
              <AlertDescription>{w.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
      {/* Filters */}
      <DashboardFilters
        selectedCreative={selectedCreative}
        onCreativeChange={setSelectedCreative}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="perpetua">Perpétua</TabsTrigger>
          <TabsTrigger value="distribuicao">Distribuição de Conteúdos</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <TabsContent value="perpetua" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Big Numbers */}
              {processedData.bigNumbers.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Indicadores Principais</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {processedData.bigNumbers.map((kpi, index) => {
                      const { label, value, previousValue, format } = kpi;
                      return (
                        <BigNumberCard
                          key={label}
                          label={label}
                          value={value}
                          previousValue={previousValue}
                          format={format}
                          delay={index * 0.1}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Weekly Comparison */}
              {processedData.weeklyData.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Visão Semanal</h3>
                  <WeeklyComparisonTable data={processedData.weeklyData} />
                </section>
              )}

              {/* Creative Performance */}
              {processedData.creativeData.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Performance por Criativo</h3>
                  <CreativePerformanceTable
                    data={processedData.creativeData}
                    selectedCreative={selectedCreative}
                    onCreativeSelect={setSelectedCreative}
                  />
                </section>
              )}

              {/* Funnel */}
              {processedData.funnelData.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Funil de Conversão</h3>
                  <FunnelVisualization data={processedData.funnelData} />
                </section>
              )}

              {processedData.bigNumbers.length === 0 && !allSheetsQuery.error && (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    {filteredRows.length === 0
                      ? 'Nenhum dado encontrado para os filtros selecionados.'
                      : 'Nenhuma métrica configurada para esta aba.'}
                  </p>
                  {filteredRows.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDateRange(undefined);
                        setSelectedCreative(null);
                      }}
                    >
                      Limpar Filtros
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="distribuicao" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              <section>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <BigNumberCard
                    label="Alcance Total"
                    value={processedData.distributionData.totalReach}
                    format="number"
                  />
                  <BigNumberCard
                    label="Impressões"
                    value={processedData.distributionData.totalImpressions}
                    format="number"
                  />
                  <BigNumberCard
                    label="Engajamento Médio"
                    value={processedData.distributionData.avgEngagement}
                    format="percentage"
                  />
                  <BigNumberCard
                    label="Views de Vídeo"
                    value={processedData.distributionData.videoViews}
                    format="number"
                  />
                  <BigNumberCard
                    label="Novos Seguidores"
                    value={processedData.distributionData.followersGained}
                    format="number"
                  />
                </div>
              </section>

              {processedData.distributionData.platformBreakdown.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Breakdown por Plataforma</h3>
                  <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Plataforma</th>
                          <th className="px-4 py-3 text-right font-medium">Alcance</th>
                          <th className="px-4 py-3 text-right font-medium">Engajamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {processedData.distributionData.platformBreakdown.map((item) => (
                          <tr key={item.platform} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium capitalize">{item.platform}</td>
                            <td className="px-4 py-3 text-right">{item.reach.toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3 text-right">{(item.engagement * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>

      {/* Footer */}
      <footer className="mt-12 border-t pt-6">
        <p className="text-center text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleTimeString('pt-BR')} • Dados sincronizados com {project?.source_type === 'meta_ads' ? 'Meta Ads' : 'Google Sheets'}
        </p>
      </footer>
    </div>
  );
}
