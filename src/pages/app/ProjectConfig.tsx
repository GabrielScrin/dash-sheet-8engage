import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, FileSpreadsheet, Columns, BarChart3, Share2, Eye } from 'lucide-react';
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

interface Project {
  id: string;
  name: string;
  description: string | null;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  sheet_name: string | null;
  sheet_names: string[] | null;
  status: string;
}

const steps = [
  { id: 1, name: 'Planilha', icon: FileSpreadsheet, description: 'Selecione a planilha Google' },
  { id: 2, name: 'Aba', icon: FileSpreadsheet, description: 'Escolha a aba com os dados' },
  { id: 3, name: 'Colunas', icon: Columns, description: 'Mapeie as colunas para métricas' },
  { id: 4, name: 'KPIs', icon: BarChart3, description: 'Configure os indicadores' },
  { id: 5, name: 'Compartilhar', icon: Share2, description: 'Gere links de acesso' },
];

export default function ProjectConfig() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [sheetSelectorOpen, setSheetSelectorOpen] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProject();
    }
  }, [id]);

  const fetchProject = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      // Parse sheet_names from JSONB
      const projectData: Project = {
        ...data,
        sheet_names: Array.isArray(data.sheet_names) ? data.sheet_names as string[] : [],
      };
      setProject(projectData);
      
      // Determine current step based on project state
      if (!data.spreadsheet_id) {
        setCurrentStep(1);
      } else if (!data.sheet_name) {
        setCurrentStep(2);
      } else {
        setCurrentStep(3);
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
            {project?.spreadsheet_name ? (
              <div className="rounded-lg border p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                    <FileSpreadsheet className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{project.spreadsheet_name}</p>
                    <p className="text-sm text-muted-foreground">Planilha conectada</p>
                  </div>
                  <Button variant="outline" onClick={() => setSheetSelectorOpen(true)}>
                    Alterar
                  </Button>
                </div>
              </div>
            ) : (
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
                <p className="mt-4 text-xs text-muted-foreground">
                  O acesso é somente leitura. Nenhuma modificação será feita na sua planilha.
                </p>
              </div>
            )}
          </div>
        );
      case 2:
        return project?.spreadsheet_id && project?.spreadsheet_name ? (
          <div className="space-y-4">
            {project.sheet_names && project.sheet_names.length > 0 && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground mb-2">Abas selecionadas:</p>
                <div className="flex flex-wrap gap-2">
                  {project.sheet_names.map((name) => (
                    <Badge key={name} variant="secondary">{name}</Badge>
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
        ) : (
          <div className="rounded-lg border p-6 text-center">
            <p className="text-muted-foreground">
              Primeiro, selecione uma planilha na etapa anterior.
            </p>
            <Button className="mt-4" onClick={() => setCurrentStep(1)}>
              Ir para Etapa 1
            </Button>
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
        return project?.id ? (
          <KPIConfigurator projectId={project.id} />
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
          <ShareManager projectId={project.id} />
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
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        isCurrent 
                          ? 'bg-primary text-primary-foreground' 
                          : isComplete 
                            ? 'text-foreground hover:bg-muted' 
                            : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                        isCurrent 
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
                  onClick={() => navigate(`/app/projects/${id}/preview`)}
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
                  <Button className="gap-2">
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
