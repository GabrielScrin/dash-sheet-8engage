import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ValidationResult {
  valid: boolean;
  requiresPassword?: boolean;
  projectId?: string;
  allowedFilters?: Record<string, unknown>;
  tokenName?: string;
  error?: string;
}

export default function PublicDashboard() {
  const { token } = useParams<{ token: string }>();

  const [status, setStatus] = useState<'loading' | 'password' | 'validated' | 'error'>('loading');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState<string>('Dashboard');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateToken = async (passwordAttempt?: string) => {
    if (!token) {
      setStatus('error');
      setError('Token não fornecido');
      return;
    }

    try {
      setIsSubmitting(true);

      const { data, error: fnError } = await supabase.functions.invoke<ValidationResult>(
        'validate-share-token',
        {
          body: { token, password: passwordAttempt }
        }
      );

      if (fnError) {
        console.error('Function error:', fnError);
        setStatus('error');
        setError('Erro ao validar token');
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
        setProjectId(data.projectId);
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
  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <h1 className="font-semibold">{tokenName}</h1>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <DashboardView
          projectId={projectId || ''}
          shareToken={token}
        />
      </main>
    </div>
  );
}
