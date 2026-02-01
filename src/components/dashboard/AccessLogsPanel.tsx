import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, Globe, Monitor, Smartphone, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface AccessLog {
  id: string;
  accessed_at: string;
  viewer_ip: string | null;
  viewer_user_agent: string | null;
  filters_used: Record<string, unknown> | null;
  share_token_id: string | null;
}

interface AccessLogsPanelProps {
  projectId: string;
}

function parseUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: 'Desconhecido', browser: 'Desconhecido' };
  
  let device = 'Desktop';
  if (/mobile/i.test(ua)) device = 'Mobile';
  else if (/tablet|ipad/i.test(ua)) device = 'Tablet';
  
  let browser = 'Outro';
  if (/chrome/i.test(ua) && !/edge/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/edge/i.test(ua)) browser = 'Edge';
  
  return { device, browser };
}

function maskIp(ip: string | null): string {
  if (!ip) return 'IP oculto';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return ip.substring(0, 8) + '...';
}

export function AccessLogsPanel({ projectId }: AccessLogsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['access-logs', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('accessed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as AccessLog[];
    },
    enabled: isExpanded,
  });

  const displayedLogs = showAll ? logs : logs?.slice(0, 10);
  const totalViews = logs?.length || 0;
  const uniqueIps = new Set(logs?.map(l => l.viewer_ip).filter(Boolean)).size;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Logs de Acesso</CardTitle>
              <CardDescription>
                Quem visualizou este dashboard
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {!isExpanded && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{totalViews} visualizações</span>
              </div>
            )}
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Eye className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>Nenhum acesso registrado ainda</p>
              <p className="text-sm mt-1">
                Visualizações via link compartilhado aparecerão aqui
              </p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="mb-4 flex gap-4 text-sm">
                <Badge variant="secondary" className="gap-1">
                  <Eye className="h-3 w-3" />
                  {totalViews} visualizações
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Globe className="h-3 w-3" />
                  {uniqueIps} IPs únicos
                </Badge>
              </div>

              {/* Log List */}
              <div className="space-y-2">
                {displayedLogs?.map((log) => {
                  const { device, browser } = parseUserAgent(log.viewer_user_agent);
                  const DeviceIcon = device === 'Mobile' ? Smartphone : Monitor;
                  
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {format(new Date(log.accessed_at), "d 'de' MMM, HH:mm", { locale: ptBR })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {browser} • {device}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {maskIp(log.viewer_ip)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {logs && logs.length > 10 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAll(!showAll);
                  }}
                >
                  {showAll ? 'Mostrar menos' : `Ver todos (${logs.length})`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
