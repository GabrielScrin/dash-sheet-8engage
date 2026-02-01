import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardFooterProps {
  lastUpdated: Date | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function DashboardFooter({ lastUpdated, onRefresh, isRefreshing }: DashboardFooterProps) {
  const formatTimestamp = () => {
    if (!lastUpdated) return 'Dados não carregados';
    
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) {
      return 'Atualizado agora';
    }
    
    return `Atualizado ${formatDistanceToNow(lastUpdated, { 
      addSuffix: true, 
      locale: ptBR 
    })}`;
  };

  return (
    <footer className="mt-12 border-t pt-6">
      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <p className="text-sm text-muted-foreground">
          {formatTimestamp()} • Dados sincronizados com Google Sheets
        </p>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        )}
      </div>
    </footer>
  );
}
