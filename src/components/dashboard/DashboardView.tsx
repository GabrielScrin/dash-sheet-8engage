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
import { subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useAuth } from '@/contexts/AuthContext';
import { FileSpreadsheet } from 'lucide-react';

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

  const allRows = allSheetsQuery.data || [];

  // 4. Apply Filters
  const filteredRows = useMemo(() => {
    if (!allRows.length) return [];

    return allRows.filter(row => {
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
  }, [allRows, dateRange, selectedCreative]);

  // 5. Process Data
  const processedData = useMemo(() => {
    return processDashboardData(filteredRows, mappings || []);
  }, [filteredRows, mappings]);

  const isLoading = loadingProject || loadingMappings || allSheetsQuery.isLoading;

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
            Não foi possível acessar as planilhas do Google. Verique as permissões.
          </AlertDescription>
        </Alert>
      </div>
    );
  }


  // Check if project has spreadsheet configured
  if (!project?.spreadsheet_id) {
    return (
      <div className="container py-12 text-center">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
          <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Planilha Não Configurada</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Você ainda não selecionou uma planilha do Google. Vá para a etapa "Planilha" para configurar.
        </p>
      </div>
    );
  }

  // Check if sheets are selected
  if (sheetNames.length === 0) {
    return (
      <div className="container py-12 text-center">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
          <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Abas Não Selecionadas</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Você ainda não selecionou as abas da planilha. Vá para a etapa "Aba" para configurar.
        </p>
      </div>
    );
  }

  if (!mappings || mappings.length === 0) {
    return (
      <div className="container py-12 text-center">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Configuração Incompleta</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Você ainda não mapeou as colunas da sua planilha. Vá para a etapa "Colunas" para configurar quais dados quer ver.
        </p>
      </div>
    );
  }

  if (allRows.length === 0 && !allSheetsQuery.isLoading) {
    return (
      <div className="container py-12 text-center">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Nenhum dado encontrado</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          As abas selecionadas ({sheetNames.join(', ')}) parecem estar vazias ou não contêm dados no formato esperado.
        </p>
      </div>
    );
  }

  return (
    <div className="container py-6">
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
          Última atualização: {new Date().toLocaleTimeString('pt-BR')} • Dados sincronizados com Google Sheets
        </p>
      </footer>
    </div>
  );
}
