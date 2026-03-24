import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  LayoutDashboard,
  ExternalLink,
  Settings,
  Trash2,
  MoreHorizontal,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Project {
  id: string;
  name: string;
  description: string | null;
  spreadsheet_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Erro inesperado.';
}

export default function Projects() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error: unknown) {
      toast({
        title: 'Erro ao carregar projetos',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, insira um nome para o dashboard.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: newProject.name.trim(),
          description: newProject.description.trim() || null,
          user_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Dashboard criado!',
        description: 'Agora configure a conexão com sua planilha.',
      });

      setIsCreateOpen(false);
      setNewProject({ name: '', description: '' });
      navigate(`/app/projects/${data.id}/config`);
    } catch (error: unknown) {
      toast({
        title: 'Erro ao criar dashboard',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);

      if (error) throw error;

      setProjects(projects.filter((project) => project.id !== projectId));
      toast({
        title: 'Dashboard excluído',
        description: 'O dashboard foi removido com sucesso.',
      });
    } catch (error: unknown) {
      toast({
        title: 'Erro ao excluir',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    const labels = {
      draft: 'Rascunho',
      published: 'Publicado',
      archived: 'Arquivado',
    };

    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status as keyof typeof styles] || styles.draft}`}
      >
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Meus Dashboards</h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie seus dashboards conectados ao Google Sheets
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Novo Dashboard
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar novo dashboard</DialogTitle>
                <DialogDescription>
                  Dê um nome ao seu dashboard. Você poderá conectar uma planilha na próxima etapa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do dashboard</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Relatório de Vendas Q1"
                    value={newProject.name}
                    onChange={(event) => setNewProject({ ...newProject, name: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Uma breve descrição do dashboard..."
                    value={newProject.description}
                    onChange={(event) => setNewProject({ ...newProject, description: event.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateProject} disabled={isCreating}>
                  {isCreating ? 'Criando...' : 'Criar e Configurar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <Card key={item} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 w-3/4 rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 w-full rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-16"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">Nenhum dashboard ainda</h3>
            <p className="mb-6 text-center text-muted-foreground">
              Crie seu primeiro dashboard e conecte
              <br />
              uma planilha Google para começar.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar primeiro dashboard
            </Button>
          </motion.div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className="group relative cursor-pointer overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg"
                    onClick={() => navigate(`/app/projects/${project.id}/config`)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="z-10 space-y-1">
                          <CardTitle className="text-lg">{project.name}</CardTitle>
                          {project.description && (
                            <CardDescription className="line-clamp-2">
                              {project.description}
                            </CardDescription>
                          )}
                        </div>
                        <div onClick={(event) => event.stopPropagation()} className="z-20">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/app/projects/${project.id}/config`}>
                                  <Settings className="mr-2 h-4 w-4" />
                                  Configurar
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/app/projects/${project.id}/preview`}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Visualizar
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteProject(project.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="z-10 space-y-3">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(project.status)}
                        {project.spreadsheet_name && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileSpreadsheet className="h-3 w-3" />
                            {project.spreadsheet_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Atualizado {format(new Date(project.updated_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
