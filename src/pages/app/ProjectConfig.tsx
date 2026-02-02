import * as React from 'react';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, FileSpreadsheet, Columns, BarChart3, Share2, Eye, Database, Link2, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SheetSelector } from '@/components/sheets/SheetSelector';
import { SheetTabSelector } from '@/components/sheets/SheetTabSelector';
import { ColumnMapper } from '@/components/config/ColumnMapper';
import { KPIConfigurator } from '@/components/config/KPIConfigurator';
import { ShareManager } from '@/components/config/ShareManager';
import { AccessLogsPanel } from '@/components/dashboard/AccessLogsPanel';

interface Project {
  id: string;
  name: string;
  description: string | null;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  sheet_name: string | null;
  sheet_names: string[] | null;
  status: string;
  source_type: 'sheet' | 'meta_ads' | null;
  source_config: any;
}

const steps = [
  { id: 1, name: 'Fonte', icon: Database, description: 'Escolha a origem dos dados' },
  { id: 2, name: 'Conexão', icon: Link2, description: 'Conecte sua conta ou planilha' },
  { id: 3, name: 'Mapeamento', icon: Columns, description: 'Configure as colunas' },
  { id: 4, name: 'KPIs', icon: BarChart3, description: 'Visualização dos dados' },
  { id: 5, name: 'Publicar', icon: Share2, description: 'Compartilhe seu dashboard' },
];

export default function ProjectConfig() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [sheetSelectorOpen, setSheetSelectorOpen] = useState(false);
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);

  const fetchAdAccounts = async ({ silent }: { silent?: boolean } = {}) => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-api?action=ad-accounts');
      if (error) throw error;
      setMetaConnected(true);
      setAdAccounts(data?.accounts || []);
    } catch (e: any) {
      const message = e?.message || 'Erro ao listar contas de anÃºncios';
      setMetaConnected(false);
      setAdAccounts([]);
      if (!silent && !message.toLowerCase().includes('meta account not connected')) {
        toast({ title: 'Erro ao listar contas', description: message, variant: 'destructive' });
      }
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchProject();
    }
  }, [id]);

  useEffect(() => {
    if (currentStep === 2 && project?.source_type === 'meta_ads' && !project.source_config?.ad_account_id) {
      setMetaConnected(null);
      fetchAdAccounts({ silent: true });
    }
  }, [currentStep, project?.source_type, project?.source_config?.ad_account_id]);

  const fetchProject = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Parse sheet_names from JSONB and ensure all fields are present
      const projectData: Project = {
        id: data.id,
        name: data.name,
        description: data.description,
        spreadsheet_id: data.spreadsheet_id,
        spreadsheet_name: data.spreadsheet_name,
        sheet_name: data.sheet_name,
        sheet_names: Array.isArray(data.sheet_names) ? data.sheet_names as string[] : [],
        status: data.status || 'draft',
        source_type: (data.source_type as 'sheet' | 'meta_ads' | null) || null,
        source_config: data.source_config || {},
      };
      setProject(projectData);

      // Determine current step based on project state
      if (!projectData.source_type) {
        setCurrentStep(1);
      } else if (projectData.source_type === 'meta_ads') {
        setCurrentStep(projectData.source_config?.ad_account_id ? 3 : 2);
      } else {
        setCurrentStep(projectData.spreadsheet_id && projectData.sheet_name ? 3 : 2);
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar projeto',
        description: error.message,
        variant: 'destructive',
      });
      navigate('/app/projects');
    } finally {
      setLoading(false);
    }
  };

  const handleSpreadsheetSelect = async (spreadsheet: { id: string; name: string }) => {
    if (!project) return;

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          spreadsheet_id: spreadsheet.id,
          spreadsheet_name: spreadsheet.name,
          sheet_name: null, // Reset sheet name when changing spreadsheet
        })
        .eq('id', project.id);

      if (error) throw error;

      setProject({
        ...project,
        spreadsheet_id: spreadsheet.id,
        spreadsheet_name: spreadsheet.name,
        sheet_name: null,
      });
      setSheetSelectorOpen(false);
      setCurrentStep(2);

      toast({
        title: 'Planilha conectada!',
        description: `${spreadsheet.name} foi vinculada ao projeto.`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar planilha',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSourceSelect = async (type: 'sheet' | 'meta_ads') => {
    if (!project) return;
    try {
      const { error } = await supabase
        .from('projects')
        .update({ source_type: type })
        .eq('id', project.id);

      if (error) throw error;

      setProject({ ...project, source_type: type });
      setCurrentStep(2);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar fonte',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleTabsSelect = async (tabs: { sheetId: number; title: string }[]) => {
    if (!project) return;
    try {
      const sheetNames = tabs.map(t => t.title);
      const { error } = await supabase
        .from('projects')
        .update({
          sheet_name: sheetNames[0], // Keep backward compatibility
          sheet_names: sheetNames,
        })
        .eq('id', project.id);

      if (error) throw error;

      setProject({
        ...project,
        sheet_name: sheetNames[0],
        sheet_names: sheetNames,
      });
      setCurrentStep(3);

      toast({
        title: 'Abas selecionadas!',
        description: `${sheetNames.length} aba${sheetNames.length > 1 ? 's' : ''} configurada${sheetNames.length > 1 ? 's' : ''}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar abas',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-medium">De onde vêm seus dados?</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Card
                className={`cursor-pointer transition-all hover:border-primary ${project?.source_type === 'sheet' ? 'border-primary bg-primary/5' : ''}`}
                onClick={() => handleSourceSelect('sheet')}
              >
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="mb-4 rounded-full bg-green-100 p-3 dark:bg-green-900/20">
                    <FileSpreadsheet className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h4 className="font-semibold">Planilha Google</h4>
                  <p className="text-sm text-muted-foreground mt-2">
                    Conecte uma planilha do seu Google Drive. Ideal para dados manuais ou exportados.
                  </p>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all hover:border-primary ${project?.source_type === 'meta_ads' ? 'border-primary bg-primary/5' : ''}`}
                onClick={() => handleSourceSelect('meta_ads')}
              >
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="mb-4 rounded-full bg-blue-100 p-3 dark:bg-blue-900/20">
                    <Facebook className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="font-semibold">Meta Ads</h4>
                  <p className="text-sm text-muted-foreground mt-2">
                    Conexão nativa com Facebook e Instagram Ads. Dados atualizados automaticamente.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      case 2:
        if (project?.source_type === 'meta_ads') {
          return (
            <div className="space-y-6">
              {metaConnected === false ? (
                <div className="space-y-6">
                  <div className="rounded-lg border-2 border-dashed p-8 text-center">
                    <Facebook className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Conectar Meta Ads</h3>
                    <p className="text-muted-foreground mb-4">
                      Conecte sua conta do Facebook para listar suas contas de anúncios.
                    </p>
                    <Button
                      size="lg"
                      className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={async () => {
                        try {
                          const returnTo = `/app/projects/${project.id}/config`;
                          const { data: resData, error: resError } = await supabase.functions.invoke(
                            `meta-auth?action=authorize&return_to=${encodeURIComponent(returnTo)}`
                          );

                          if (resError) throw resError;
                          if (resData?.url) {
                            window.location.href = resData.url;
                          }
                        } catch (e: any) {
                          toast({ title: 'Erro na conexão', description: e.message, variant: 'destructive' });
                        }
                      }}
                    >
                      <Facebook className="h-5 w-5" />
                      Conectar Conta
                    </Button>
                  </div>
                </div>
              ) : metaConnected !== true ? (
                <div className="rounded-lg border p-6 text-center text-muted-foreground">
                  Verificando conexÃ£o com a Meta...
                </div>
              ) : (
                <div className="space-y-4">
                  {!project.source_config?.ad_account_id ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium">Selecione uma conta de anúncios</h3>
                        <Button variant="outline" onClick={() => fetchAdAccounts()}>
                          Atualizar Lista
                        </Button>
                      </div>

                      {loadingAccounts ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {adAccounts.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              Nenhuma conta encontrada. Clique em "Atualizar Lista" ou verifique suas permissões no Facebook.
                            </div>
                          )}
                          {adAccounts.map((acc) => (
                            <Card
                              key={acc.id}
                              className="cursor-pointer hover:border-primary transition-colors"
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from('projects')
                                    .update({
                                      source_config: { ...project.source_config, ad_account_id: acc.id, ad_account_name: acc.name }
                                    })
                                    .eq('id', project.id);

                                  if (error) throw error;
                                  setProject({ ...project, source_config: { ...project.source_config, ad_account_id: acc.id, ad_account_name: acc.name } });
                                  setCurrentStep(3); // Go to Mapping
                                } catch (e: any) {
                                  toast({ title: 'Erro ao selecionar conta', description: e.message, variant: 'destructive' });
                                }
                              }}
                            >
                              <CardContent className="p-4 flex justify-between items-center">
                                <div>
                                  <p className="font-medium">{acc.name}</p>
                                  <p className="text-xs text-muted-foreground">ID: {acc.id} • {acc.currency}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border p-4 bg-blue-50 border-blue-200 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-blue-800">Conta Conectada: {project.source_config.ad_account_name}</p>
                        <p className="text-sm text-blue-600">ID: {project.source_config.ad_account_id}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        try {
                          const nextConfig = { ...project.source_config, ad_account_id: null, ad_account_name: null };
                          const { error } = await supabase
                            .from('projects')
                            .update({ source_config: nextConfig })
                            .eq('id', project.id);

                          if (error) throw error;
                          setProject({ ...project, source_config: nextConfig });
                          fetchAdAccounts({ silent: true });
                        } catch (e: any) {
                          toast({ title: 'Erro ao alterar conta', description: e.message, variant: 'destructive' });
                        }
                      }}>Alterar</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        // Default to Sheet logic (existing)
        return (
          <div className="space-y-6">
            {!project?.spreadsheet_id ? (
              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Conectar Planilha Google</h3>
                <p className="text-muted-foreground mb-4">
                  Selecione uma planilha do seu Google Drive para conectar ao dashboard.
                </p>
                <Button size="lg" className="gap-2" onClick={() => setSheetSelectorOpen(true)}>
                  <FileSpreadsheet className="h-5 w-5" />
                  Selecionar Planilha
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="font-medium text-sm">{project.spreadsheet_name}</p>
                      <p className="text-xs text-muted-foreground">Planilha conectada</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSheetSelectorOpen(true)}>Alterar</Button>
                </div>

                {project.sheet_names && project.sheet_names.length > 0 && (
                  <div className="rounded-lg border p-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-2">Abas selecionadas:</p>
                    <div className="flex flex-wrap gap-2">
                      {project.sheet_names.map((name) => (
                        <Badge key={name} variant="secondary">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <SheetTabSelector
                  spreadsheetId={project.spreadsheet_id}
                  spreadsheetName={project.spreadsheet_name}
                  selectedTabs={project.sheet_names || []}
                  onSelect={handleTabsSelect}
                  onBack={() => setCurrentStep(1)}
                />
              </div>
            )}
          </div>
        );
      case 3:
        return project?.spreadsheet_id && project?.sheet_names && project.sheet_names.length > 0 ? (
          <ColumnMapper
            projectId={project.id}
            spreadsheetId={project.spreadsheet_id}
            sheetNames={project.sheet_names}
          />
        ) : (
          <div className="rounded-lg border p-6 text-center">
            <Columns className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Mapear Colunas</h3>
            <p className="text-muted-foreground">
              Primeiro, selecione as abas da planilha na etapa anterior.
            </p>
            <Button className="mt-4" onClick={() => setCurrentStep(2)}>
              Ir para Etapa 2
            </Button>
          </div>
        );
      case 4:
        return project?.id && project?.spreadsheet_id && project?.sheet_names ? (
          <KPIConfigurator
            projectId={project.id}
            spreadsheetId={project.spreadsheet_id}
            sheetNames={project.sheet_names}
          />
        ) : (
          <div className="rounded-lg border p-6 text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Configurar KPIs</h3>
            <p className="text-muted-foreground">
              Primeiro, mapeie as colunas na etapa anterior.
            </p>
            <Button className="mt-4" onClick={() => setCurrentStep(3)}>
              Ir para Etapa 3
            </Button>
          </div>
        );
      case 5:
        return project?.id ? (
          <div className="space-y-6">
            <ShareManager projectId={project.id} />
            <AccessLogsPanel projectId={project.id} />
          </div>
        ) : (
          <div className="rounded-lg border p-6 text-center">
            <Share2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Compartilhar Dashboard</h3>
            <p className="text-muted-foreground">
              Carregando...
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  const handlePublish = async () => {
    if (!project) return;
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'published' })
        .eq('id', project.id);

      if (error) throw error;

      toast({
        title: 'Dashboard Publicado!',
        description: 'Seu dashboard já pode ser compartilhado.',
      });
      navigate('/app/projects');
    } catch (error: any) {
      toast({
        title: 'Erro ao publicar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{project?.name}</h1>
          <p className="text-muted-foreground">
            Configure a conexão e visualização do dashboard
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Stepper Vertical */}
          <Card className="h-fit">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Etapas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <nav className="space-y-1 px-4 pb-4">
                {steps.map((step) => {
                  const isComplete = step.id < currentStep ||
                    (step.id === 1 && !!project?.spreadsheet_id) ||
                    (step.id === 2 && !!project?.sheet_name);
                  const isCurrent = step.id === currentStep;

                  return (
                    <button
                      key={step.id}
                      onClick={() => setCurrentStep(step.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : isComplete
                          ? 'text-foreground hover:bg-muted'
                          : 'text-muted-foreground hover:bg-muted'
                        }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${isCurrent
                        ? 'border-primary-foreground bg-primary-foreground text-primary'
                        : isComplete
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-current'
                        }`}>
                        {isComplete && !isCurrent ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <span className="text-sm font-medium">{step.id}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{step.name}</p>
                        <p className={`text-xs truncate ${isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          {step.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          {/* Step Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const StepIcon = steps[currentStep - 1].icon;
                    return <StepIcon className="h-6 w-6 text-primary" />;
                  })()}
                  <div>
                    <CardTitle>{steps[currentStep - 1].name}</CardTitle>
                    <CardDescription>{steps[currentStep - 1].description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderStepContent()}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
              >
                Anterior
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (id) {
                      navigate(`/app/projects/${id}/preview`);
                    }
                  }}
                  disabled={!id}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
                {currentStep < steps.length ? (
                  <Button
                    onClick={() => setCurrentStep(Math.min(steps.length, currentStep + 1))}
                    className="gap-2"
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={handlePublish} className="gap-2">
                    <Check className="h-4 w-4" />
                    Publicar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sheet Selector Modal */}
      <SheetSelector
        open={sheetSelectorOpen}
        onOpenChange={setSheetSelectorOpen}
        onSelect={handleSpreadsheetSelect}
      />
    </div>
  );
}
