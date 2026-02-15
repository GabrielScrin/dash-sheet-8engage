import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Webhook, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface WebhookPanelProps {
  projectId: string;
}

export function WebhookPanel({ projectId }: WebhookPanelProps) {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [secretLast4, setSecretLast4] = useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState('');
  const [credentials, setCredentials] = useState({
    appKey: '',
    appSecret: '',
  });

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const baseUrl = `${supabaseUrl || 'https://ufksgrounhmfafdajbrr.supabase.co'}/functions/v1/payment-attribution`;
  const defaultWebhookUrl = `${baseUrl}?action=ingest-webhook&provider=hotmart&projectId=${encodeURIComponent(projectId)}`;
  const [webhookUrl, setWebhookUrl] = useState(defaultWebhookUrl);

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({ title: 'Copiado', description: `${fieldName} copiado para a área de transferência.` });
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const CopyButton = ({ text, fieldName }: { text: string; fieldName: string }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 shrink-0"
      onClick={() => copyToClipboard(text, fieldName)}
    >
      {copiedField === fieldName ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );

  const loadStatus = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke(
        `payment-attribution?action=connection-status&provider=hotmart&projectId=${encodeURIComponent(projectId)}`,
      );
      if (error) throw error;
      setConnected(Boolean(data?.connected));
      setSecretLast4(data?.secretLast4 || null);
      setWebhookUrl(data?.webhookUrl || defaultWebhookUrl);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar integração',
        description: error?.message || 'Não foi possível consultar a conexão.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const setupConnection = async (rotate = false) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke(
        `payment-attribution?action=${rotate ? 'connection-rotate-secret' : 'connection-init'}`,
        {
          body: {
            projectId,
            provider: 'hotmart',
            name: 'Hotmart',
            credentials: {
              app_key: credentials.appKey || undefined,
              app_secret: credentials.appSecret || undefined,
            },
          },
        },
      );
      if (error) throw error;

      const secret = String(data?.oneTimeSecret || '');
      setOneTimeSecret(secret);
      setConnected(true);
      setSecretLast4(secret ? secret.slice(-4) : null);
      setWebhookUrl(data?.webhookUrl || defaultWebhookUrl);

      toast({
        title: rotate ? 'Secret renovado' : 'Conexão criada',
        description: 'Copie o secret agora. Ele não será exibido novamente.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar conexão',
        description: error?.message || 'Falha inesperada',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const metadataSample = useMemo(
    () => ({
      metadata: {
        project_id: projectId,
        session_key: 'sess_abc123',
        campaign_id: '1202...',
        adset_id: '1202...',
        ad_id: '1202...',
      },
    }),
    [projectId],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-orange-100 p-2 dark:bg-orange-900/20">
              <Webhook className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-base">Webhook Hotmart (por dashboard)</CardTitle>
              <CardDescription>Conexão isolada por projeto com secret único.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Status da conexão</span>
              {connected ? <Badge variant="secondary">Conectado</Badge> : <Badge variant="outline">Não conectado</Badge>}
            </div>
            {connected && (
              <p className="mt-2 text-xs text-muted-foreground">
                Secret ativo termina em <strong>{secretLast4 || '----'}</strong>.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">App Key Hotmart (opcional)</label>
              <Input
                value={credentials.appKey}
                onChange={(e) => setCredentials((prev) => ({ ...prev, appKey: e.target.value }))}
                placeholder="Insira apenas ao criar/atualizar"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">App Secret Hotmart (opcional)</label>
              <Input
                type="password"
                value={credentials.appSecret}
                onChange={(e) => setCredentials((prev) => ({ ...prev, appSecret: e.target.value }))}
                placeholder="Insira apenas ao criar/atualizar"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setupConnection(false)} disabled={loading}>
              Criar conexão deste dashboard
            </Button>
            <Button variant="outline" onClick={() => setupConnection(true)} disabled={loading || !connected}>
              Gerar novo secret
            </Button>
          </div>

          {oneTimeSecret && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Secret (visível uma única vez)</label>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
                <code className="flex-1 text-xs break-all font-mono">{oneTimeSecret}</code>
                <CopyButton text={oneTimeSecret} fieldName="Secret" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">URL do Webhook</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <code className="flex-1 text-xs break-all font-mono">{webhookUrl}</code>
              <CopyButton text={webhookUrl} fieldName="URL do Webhook" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Header obrigatório</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <code className="flex-1 text-xs font-mono">x-webhook-secret: SEU_SECRET</code>
              <CopyButton text="x-webhook-secret" fieldName="Nome do Header" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Metadata obrigatório no payload</label>
            <div className="rounded-lg border bg-muted/50 p-3">
              <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify(metadataSample, null, 2)}</pre>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Como configurar na Hotmart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li>1. Vá em <strong>Ferramentas → Webhooks</strong> na Hotmart.</li>
            <li>2. Crie uma nova URL e use a URL deste dashboard.</li>
            <li>3. Envie eventos de venda/estorno/chargeback.</li>
            <li>4. Adicione o header <strong>x-webhook-secret</strong> com o secret gerado aqui.</li>
            <li>5. Inclua <strong>metadata.project_id</strong> para atribuir ao dashboard correto.</li>
          </ol>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/30 dark:bg-yellow-900/10">
        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-yellow-800 dark:text-yellow-300">Importante</p>
          <p className="text-yellow-700 dark:text-yellow-400 mt-1">
            Se o usuário não copiar o secret na criação/rotação, não existe leitura posterior.
            Deve gerar um novo secret.
          </p>
        </div>
      </div>
    </div>
  );
}
