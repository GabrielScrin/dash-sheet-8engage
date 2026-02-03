import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { BigNumberCard } from '@/components/dashboard/BigNumberCard';
import { WeeklyComparisonTable } from '@/components/dashboard/WeeklyComparisonTable';
import { CreativePerformanceTable } from '@/components/dashboard/CreativePerformanceTable';
import { FunnelVisualization } from '@/components/dashboard/FunnelVisualization';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { DashboardFooter } from '@/components/dashboard/DashboardFooter';
import { processDashboardData } from '@/lib/dashboard-utils';
import { subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFilterParams } from '@/hooks/useFilterParams';

interface ValidationResult {
  valid: boolean;
  requiresPassword?: boolean;
  projectId?: string;
  allowedFilters?: Record<string, unknown>;
  tokenName?: string;
  error?: string;
  project?: {
    id: string;
    name: string;
    spreadsheet_id: string;
    sheet_name: string;
    sheet_names: string[];
  };
  mappings?: any[];
}

export default function PublicDashboard() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<'loading' | 'password' | 'validated' | 'error'>('loading');
  const [validationData, setValidationData] = useState<ValidationResult | null>(null);
  const [tokenName, setTokenName] = useState<string>('Dashboard');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // URL-based filters
  const { filters, dateRange, setDateRange, setCreative, setTab } = useFilterParams('perpetua');

  // Local state for creative selection (synced with URL)
  const selectedCreative = filters.creative;
  const activeTab = filters.tab;

  // Initialize date range from URL or default
  const effectiveDateRange: DateRange | undefined = dateRange || {
    from: subDays(new Date(), 30),
    to: new Date(),
  };

  const validateToken = async (passwordAttempt?: string) => {
    if (!token) {
      setStatus('error');
      setError('Token não fornecido');
      return;
    }

    try {
      setIsSubmitting(true);

      const normalizedToken = token.trim();
      const { data, error: fnError } = await supabase.functions.invoke<ValidationResult>(
        'validate-share-token',
        {
          body: { token: normalizedToken, password: passwordAttempt }
        }
      );

      if (fnError) {
        console.error('Function error:', fnError);
        setStatus('error');
        const maybeContextBody = (fnError as any)?.context?.body;
        const detailed =
          typeof maybeContextBody === 'string'
            ? (() => {
                try {
                  return JSON.parse(maybeContextBody)?.error;
                } catch {
                  return null;
                }
              })()
            : null;

        setError(detailed || fnError.message || 'Erro ao validar token');
        return;
      }

      if (!data) {
        setStatus('error');
        setError('Resposta inválida do servidor');
        return;
      }

      if (data.requiresPassword && !passwordAttempt) {
        setStatus('password');
        setTokenName(data.tokenName || 'Dashboard');
        return;
      }

      if (data.valid && data.projectId) {
        setValidationData(data);
        setTokenName(data.tokenName || 'Dashboard');
        setStatus('validated');
        return;
      }

      // Handle specific errors
      setStatus('error');
      setError(data.error || 'Token inválido');

    } catch (err) {
      console.error('Validation error:', err);
      setStatus('error');
      setError('Erro de conexão');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    validateToken();
  }, [token]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      setError(null);
      validateToken(password);
    }
  };

  // Fetch sheet data using the share token
  const sheetNames: string[] = Array.isArray(validationData?.project?.sheet_names)
    ? validationData.project.sheet_names
    : (validationData?.project?.sheet_name ? [validationData.project.sheet_name] : []);

  const allSheetsQuery = useQuery({
    queryKey: ['public-sheets-data', validationData?.project?.spreadsheet_id, sheetNames, token],
    queryFn: async () => {
      if (!validationData?.project?.spreadsheet_id) return [];

      const results = await Promise.all(
        sheetNames.map(async (name: string) => {
          try {
            const range = `'${name}'!A:Z`;

            const { data, error } = await supabase.functions.invoke('google-sheets', {
              body: {
                action: 'read-data',
                spreadsheetId: validationData.project!.spreadsheet_id,
                range
              },
              headers: {
                'x-share-token': token!,
              },
            });

            if (error) {
              console.error(`Error fetching sheet ${name}:`, error);
              return [];
            }

            const rows = data.values || [];
            if (rows.length < 2) return [];
            
            const headers = rows[0] as string[];
            return rows.slice(1).map((row: any[]) => {
              const obj: Record<string, any> = {};
              headers.forEach((h, i) => { obj[h] = row[i] || ''; });
              return obj;
            });
          } catch (err) {
            console.error(`Unexpected error fetching sheet ${name}:`, err);
            return [];
          }
        })
      );
      
      // Update last updated timestamp
      setLastUpdated(new Date());
      
      return results.flat();
    },
    enabled: status === 'validated' && !!validationData?.project?.spreadsheet_id && sheetNames.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allRows = allSheetsQuery.data || [];

  // Handle date range changes
  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
  };

  // Handle creative selection
  const handleCreativeChange = (creative: string | null) => {
    setCreative(creative);
  };

  // Handle tab changes
  const handleTabChange = (tab: string) => {
    setTab(tab);
  };

  // Refresh data
  const handleRefresh = () => {
    queryClient.invalidateQueries({ 
      queryKey: ['public-sheets-data', validationData?.project?.spreadsheet_id] 
    });
  };

  // Apply Filters
  const filteredRows = useMemo(() => {
    if (!allRows.length) return [];

    return allRows.filter(row => {
      if (effectiveDateRange?.from) {
        const dateKey = Object.keys(row).find(k =>
          k.toLowerCase().includes('data') || k.toLowerCase().includes('date')
        );
        if (dateKey && row[dateKey]) {
          const rowDate = new Date(row[dateKey]);
          if (!isNaN(rowDate.getTime())) {
            const from = new Date(effectiveDateRange.from!);
            from.setHours(0, 0, 0, 0);
            const to = effectiveDateRange.to ? new Date(effectiveDateRange.to) : new Date();
            to.setHours(23, 59, 59, 999);
            if (rowDate < from) return false;
            if (rowDate > to) return false;
          }
        }
      }

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
  }, [allRows, effectiveDateRange, selectedCreative]);

  // Process Data
  const processedData = useMemo(() => {
    return processDashboardData(filteredRows, validationData?.mappings || []);
  }, [filteredRows, validationData?.mappings]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Validando acesso...</p>
        </div>
      </div>
    );
  }

  // Password required
  if (status === 'password') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>{tokenName}</CardTitle>
            <CardDescription>
              Este dashboard está protegido por senha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite a senha"
                    disabled={isSubmitting}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !password.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Acessar Dashboard'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              {error || 'Não foi possível acessar este dashboard'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Verifique se o link está correto ou entre em contato com o proprietário do dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Validated - show dashboard
  const isLoadingData = allSheetsQuery.isLoading;
  const isRefreshing = allSheetsQuery.isFetching && !allSheetsQuery.isLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <h1 className="font-semibold">{tokenName}</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container py-6">
        {isLoadingData ? (
          <div className="flex h-[60vh] flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Carregando dados do dashboard...</p>
          </div>
        ) : allRows.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum dado encontrado</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              As planilhas parecem estar vazias ou houve um erro ao carregar os dados.
            </p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <DashboardFilters
              selectedCreative={selectedCreative}
              onCreativeChange={handleCreativeChange}
              dateRange={effectiveDateRange}
              onDateRangeChange={handleDateRangeChange}
            />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
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
                              label={kpi.label}
                              value={kpi.value}
                              previousValue={kpi.previousValue}
                              format={kpi.format}
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
                          onCreativeSelect={handleCreativeChange}
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
          </>
        )}

        {/* Footer with timestamp */}
        <DashboardFooter 
          lastUpdated={lastUpdated}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      </main>
    </div>
  );
}
