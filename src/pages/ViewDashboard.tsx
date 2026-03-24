import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ValidationResult {
  valid: boolean;
  requiresPassword?: boolean;
  projectId?: string;
  tokenName?: string;
  error?: string;
  project?: Record<string, unknown>;
  mappings?: any[];
}

export default function ViewDashboard() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'password' | 'validated' | 'error'>('loading');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('Dashboard');
  const [projectData, setProjectData] = useState<Record<string, unknown> | null>(null);
  const [projectMappings, setProjectMappings] = useState<any[]>([]);

  const validateToken = async (passwordAttempt?: string) => {
    if (!token) {
      setStatus('error');
      setError('Token não fornecido.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const { data, error: fnError } = await supabase.functions.invoke<ValidationResult>(
        'validate-share-token',
        {
          body: { token: token.trim(), password: passwordAttempt },
        }
      );

      if (fnError) {
        const maybeBody = (fnError as any)?.context?.body;
        let parsedError = '';
        if (typeof maybeBody === 'string') {
          try {
            parsedError = JSON.parse(maybeBody)?.error || '';
          } catch {
            parsedError = '';
          }
        }
        setStatus('error');
        setError(parsedError || fnError.message || 'Erro ao validar link de compartilhamento.');
        return;
      }

      if (!data) {
        setStatus('error');
        setError('Resposta inválida do servidor.');
        return;
      }

      if (data.requiresPassword && !passwordAttempt) {
        setStatus('password');
        setTokenName(data.tokenName || 'Dashboard');
        return;
      }

      if (data.valid && data.projectId) {
        setProjectId(data.projectId);
        setTokenName(data.tokenName || 'Dashboard');
        setProjectData((data.project || null) as Record<string, unknown> | null);
        setProjectMappings(Array.isArray(data.mappings) ? data.mappings : []);
        setStatus('validated');
        return;
      }

      setStatus('error');
      setError(data.error || 'Token inválido.');
    } catch (err: any) {
      setStatus('error');
      setError(err?.message || 'Falha de conexão ao validar token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    validateToken();
  }, [token]);

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

  if (status === 'password') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>{tokenName}</CardTitle>
            <CardDescription>Este dashboard está protegido por senha.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (password.trim()) validateToken(password);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="share-password">Senha</Label>
                <div className="relative">
                  <Input
                    id="share-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite a senha"
                    autoFocus
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword((prev) => !prev)}
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

              <Button className="w-full" type="submit" disabled={isSubmitting || !password.trim()}>
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

  if (status === 'error' || !projectId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>{error || 'Não foi possível acessar este dashboard.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <h1 className="font-semibold">{tokenName}</h1>
          <ThemeToggle />
        </div>
      </header>
      <main className="container py-6">
        <DashboardView
          projectId={projectId}
          shareToken={token}
          initialProject={projectData || undefined}
          initialMappings={projectMappings}
        />
      </main>
    </div>
  );
}
