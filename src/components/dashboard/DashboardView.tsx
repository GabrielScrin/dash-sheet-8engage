import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BigNumberCard } from '@/components/dashboard/BigNumberCard';
import { WeeklyComparisonTable } from '@/components/dashboard/WeeklyComparisonTable';
import { CreativePerformanceTable } from '@/components/dashboard/CreativePerformanceTable';
import { FunnelVisualization } from '@/components/dashboard/FunnelVisualization';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { useSheetData } from '@/hooks/useSheetData';
import { useColumnMappings } from '@/hooks/useColumnMappings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { processDashboardData } from '@/lib/dashboard-utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DashboardViewProps {
  projectId: string;
  isPreview?: boolean;
  shareToken?: string;
}

export function DashboardView({ projectId, isPreview = false, shareToken }: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState('perpetua');
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
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

  // 3. Fetch Sheet Data
  // Note: For now we fetch from the first sheet name. 
  // In a full implementation, we would aggregate multiple sheets.
  const sheetName = project?.sheet_names?.[0] || project?.sheet_name || '';
  const { data: sheetData, isLoading: loadingData, error: dataError } = useSheetData({
    spreadsheetId: project?.spreadsheet_id || '',
    sheetName: sheetName,
    enabled: !!project?.spreadsheet_id && !!sheetName,
    shareToken: shareToken,
  });

  // 4. Process Data
  const processedData = useMemo(() => {
    if (!sheetData?.rows || !mappings) return null;
    return processDashboardData(sheetData.rows, mappings);
  }, [sheetData, mappings]);

  const isLoading = loadingProject || loadingMappings || loadingData;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Carregando dados do dashboard...</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="container py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar dados</AlertTitle>
          <AlertDescription>
            Não foi possível acessar a planilha do Google. Verifique a conexão ou as permissões.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!processedData) {
    return (
      <div className="container py-12 text-center">
        <h3 className="text-lg font-semibold mb-2">Configuração Incompleta</h3>
        <p className="text-muted-foreground">
          Mapeie as colunas da planilha para visualizar os dados aqui.
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
                    {processedData.bigNumbers.map((kpi, index) => (
                      <BigNumberCard
                        key={kpi.label}
                        {...kpi}
                        delay={index * 0.1}
                      />
                    ))}
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

              {processedData.bigNumbers.length === 0 && !dataError && (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <p className="text-muted-foreground">Nenhuma métrica configurada para esta aba.</p>
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
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="rounded-full bg-muted p-4 mb-4">
                <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Distribuição de Conteúdos</h3>
              <p className="text-muted-foreground max-w-md">
                Esta aba mostrará métricas específicas de distribuição de conteúdo quando configurada.
              </p>
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
