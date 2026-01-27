import { useParams } from 'react-router-dom';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function PublicDashboard() {
  const { token } = useParams<{ token: string }>();

  // TODO: Validate token and fetch project data
  // For now, we'll render a placeholder

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <h1 className="font-semibold">Dashboard</h1>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <DashboardView projectId={token || ''} />
      </main>
    </div>
  );
}
