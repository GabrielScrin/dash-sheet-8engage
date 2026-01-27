import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BigNumberCard } from '@/components/dashboard/BigNumberCard';
import { WeeklyComparisonTable } from '@/components/dashboard/WeeklyComparisonTable';
import { CreativePerformanceTable } from '@/components/dashboard/CreativePerformanceTable';
import { FunnelVisualization } from '@/components/dashboard/FunnelVisualization';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';

interface DashboardViewProps {
  projectId: string;
  isPreview?: boolean;
}

// Mock data for demonstration
const mockBigNumbers = [
  { label: 'Vendas Totais', value: 1234, previousValue: 1100, format: 'number' as const },
  { label: 'Faturamento', value: 156789.50, previousValue: 142000, format: 'currency' as const },
  { label: 'Investimento', value: 45000, previousValue: 42000, format: 'currency' as const },
  { label: 'ROAS', value: 3.48, previousValue: 3.38, format: 'decimal' as const },
  { label: 'Taxa de Conversão', value: 4.2, previousValue: 3.9, format: 'percentage' as const },
  { label: 'CTR', value: 2.8, previousValue: 2.5, format: 'percentage' as const },
];

const mockWeeklyData = [
  { week: 'Sem 4 - Jan', sales: 312, investment: 11200, revenue: 39480, roas: 3.52, conversion: 4.1 },
  { week: 'Sem 3 - Jan', sales: 298, investment: 10800, revenue: 37150, roas: 3.44, conversion: 3.9 },
  { week: 'Sem 2 - Jan', sales: 325, investment: 11500, revenue: 41250, roas: 3.59, conversion: 4.3 },
  { week: 'Sem 1 - Jan', sales: 299, investment: 11500, revenue: 38909, roas: 3.38, conversion: 4.2 },
];

const mockCreativeData = [
  { id: '1', name: 'Video_Produto_A_V1', impressions: 125000, clicks: 3750, ctr: 3.0, landingViews: 3200, checkoutViews: 450, sales: 89 },
  { id: '2', name: 'Carrossel_Oferta_Black', impressions: 98000, clicks: 2940, ctr: 3.0, landingViews: 2500, checkoutViews: 380, sales: 76 },
  { id: '3', name: 'Static_Depoimento_01', impressions: 85000, clicks: 2125, ctr: 2.5, landingViews: 1800, checkoutViews: 290, sales: 58 },
  { id: '4', name: 'Video_UGC_Review', impressions: 72000, clicks: 2160, ctr: 3.0, landingViews: 1850, checkoutViews: 310, sales: 62 },
];

const mockFunnelData = [
  { label: 'Impressões', value: 380000 },
  { label: 'Cliques', value: 10975 },
  { label: 'Landing Page', value: 9350 },
  { label: 'Checkout', value: 1430 },
  { label: 'Vendas', value: 285 },
];

export function DashboardView({ projectId, isPreview = false }: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState('perpetua');
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);

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
              <section>
                <h3 className="mb-4 text-lg font-semibold">Indicadores Principais</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {mockBigNumbers.map((kpi, index) => (
                    <BigNumberCard
                      key={kpi.label}
                      {...kpi}
                      delay={index * 0.1}
                    />
                  ))}
                </div>
              </section>

              {/* Weekly Comparison */}
              <section>
                <h3 className="mb-4 text-lg font-semibold">Visão Semanal</h3>
                <WeeklyComparisonTable data={mockWeeklyData} />
              </section>

              {/* Creative Performance */}
              <section>
                <h3 className="mb-4 text-lg font-semibold">Performance por Criativo</h3>
                <CreativePerformanceTable 
                  data={mockCreativeData}
                  selectedCreative={selectedCreative}
                  onCreativeSelect={setSelectedCreative}
                />
              </section>

              {/* Funnel */}
              <section>
                <h3 className="mb-4 text-lg font-semibold">Funil de Conversão</h3>
                <FunnelVisualization data={mockFunnelData} />
              </section>
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
          Última atualização: Agora • Dados atualizados a cada 5 minutos
        </p>
      </footer>
    </div>
  );
}
