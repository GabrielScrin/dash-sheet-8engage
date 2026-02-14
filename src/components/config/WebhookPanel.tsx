import { useState } from 'react';
import { Copy, Check, ExternalLink, Webhook, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface WebhookPanelProps {
  projectId: string;
}

export function WebhookPanel({ projectId }: WebhookPanelProps) {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const baseUrl = `https://ufksgrounhmfafdajbrr.supabase.co/functions/v1/payment-attribution`;
  const webhookUrl = `${baseUrl}?action=ingest-webhook&provider=hotmart`;

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({ title: 'Copiado!', description: `${fieldName} copiado para a área de transferência.` });
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
      {copiedField === fieldName ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Hotmart Webhook */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-orange-100 p-2 dark:bg-orange-900/20">
              <Webhook className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-base">Webhook Hotmart</CardTitle>
              <CardDescription>Receba vendas da Hotmart automaticamente no dashboard</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL do Webhook */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">URL do Webhook</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <code className="flex-1 text-xs break-all font-mono">{webhookUrl}</code>
              <CopyButton text={webhookUrl} fieldName="URL do Webhook" />
            </div>
          </div>

          {/* Header obrigatório */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Header obrigatório</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <code className="flex-1 text-xs font-mono">x-webhook-secret: SEU_SECRET_AQUI</code>
              <CopyButton text="x-webhook-secret" fieldName="Nome do Header" />
            </div>
            <p className="text-xs text-muted-foreground">
              O valor do header deve ser o mesmo configurado no secret <code className="bg-muted px-1 rounded">PAYMENT_WEBHOOK_SECRET</code>.
            </p>
          </div>

          {/* Content-Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Content-Type</label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <code className="flex-1 text-xs font-mono">application/json</code>
              <CopyButton text="Content-Type: application/json" fieldName="Content-Type" />
            </div>
          </div>

          {/* Metadata obrigatório */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Metadata obrigatório no payload</label>
            <div className="rounded-lg border bg-muted/50 p-3">
              <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify({
                metadata: {
                  user_id: "SEU_USER_ID",
                  project_id: projectId,
                  session_key: "sess_...",
                  campaign_id: "1202...",
                  adset_id: "1202...",
                  ad_id: "1202..."
                }
              }, null, 2)}</pre>
            </div>
            <p className="text-xs text-muted-foreground">
              O <code className="bg-muted px-1 rounded">project_id</code> já está preenchido com o ID deste projeto.
            </p>
          </div>

          {/* Exemplo de payload completo */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-primary hover:underline flex items-center gap-1">
              Ver payload completo de exemplo
            </summary>
            <div className="mt-2 rounded-lg border bg-muted/50 p-3 relative">
              <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify({
                order_id: "HP-123456",
                status: "approved",
                gross_amount: 197.0,
                net_amount: 162.0,
                approved_at: "2026-02-14T16:00:00Z",
                metadata: {
                  user_id: "USER_UUID",
                  project_id: projectId,
                  session_key: "sess_abc123",
                  campaign_id: "1202...",
                  adset_id: "1202...",
                  ad_id: "1202..."
                }
              }, null, 2)}</pre>
              <div className="absolute top-2 right-2">
                <CopyButton
                  text={JSON.stringify({
                    order_id: "HP-123456",
                    status: "approved",
                    gross_amount: 197.0,
                    net_amount: 162.0,
                    approved_at: "2026-02-14T16:00:00Z",
                    metadata: {
                      user_id: "USER_UUID",
                      project_id: projectId,
                      session_key: "sess_abc123"
                    }
                  }, null, 2)}
                  fieldName="Payload de exemplo"
                />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Instruções de configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Como configurar na Hotmart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 text-xs">1</Badge>
              <span>Acesse <strong>Ferramentas → Webhooks</strong> no painel da Hotmart</span>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 text-xs">2</Badge>
              <span>Clique em <strong>Configurar nova URL</strong></span>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 text-xs">3</Badge>
              <span>Cole a <strong>URL do Webhook</strong> acima</span>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 text-xs">4</Badge>
              <span>Selecione os eventos: <strong>PURCHASE_APPROVED</strong>, <strong>PURCHASE_REFUNDED</strong>, <strong>PURCHASE_CHARGEBACK</strong></span>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0 text-xs">5</Badge>
              <span>Adicione o header <strong>x-webhook-secret</strong> com o mesmo valor do seu secret</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Aviso */}
      <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/30 dark:bg-yellow-900/10">
        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-yellow-800 dark:text-yellow-300">Importante</p>
          <p className="text-yellow-700 dark:text-yellow-400 mt-1">
            O payload da Hotmart precisa incluir <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">user_id</code> e <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">project_id</code> no campo <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">metadata</code> para vincular as vendas ao projeto correto. Configure isso na sua landing page ou checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
