import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Table2, BarChart3, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) {
      navigate('/app/projects');
    }
  }, [user, loading, navigate]);

  const features = [
    {
      icon: Table2,
      title: 'Conexão Direta',
      description: 'Conecte suas planilhas Google Sheets sem intermediários',
    },
    {
      icon: BarChart3,
      title: 'Dashboards Visuais',
      description: 'KPIs, tabelas, funis e métricas em tempo real',
    },
    {
      icon: Share2,
      title: 'Compartilhamento Fácil',
      description: 'Gere links de acesso para seus clientes',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <img src="/cr8-logo.svg" alt="CR8 Logo" className="h-6 w-6 object-contain" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Engage DashView</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Button onClick={() => navigate('/login')}>
              Entrar
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="container pt-32 pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Dashboards inteligentes para suas{' '}
              <span className="text-primary">planilhas</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Conecte suas planilhas Google e transforme dados em dashboards visuais e interativos. 
              Compartilhe com seus clientes em segundos.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Button size="lg" onClick={() => navigate('/login')} className="gap-2">
                Começar Agora
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline">
                Ver Demonstração
              </Button>
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-20 grid gap-8 sm:grid-cols-3"
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="rounded-lg border bg-card p-6 text-left shadow-sm"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
