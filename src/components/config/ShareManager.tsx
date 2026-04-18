import { useState } from 'react';
import { Loader2, Link2, Copy, Trash2, Eye, EyeOff, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useShareTokens } from '@/hooks/useShareTokens';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, addDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShareManagerProps {
  projectId: string;
}

export function ShareManager({ projectId }: ShareManagerProps) {
  const { toast } = useToast();
  const { tokens, isLoading, createToken, revokeToken, deleteToken } = useShareTokens(projectId);
  
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);
  const [showPassword, setShowPassword] = useState(false);

  const handleCreateToken = async () => {
    const expiresAt = hasExpiry ? addDays(new Date(), expiryDays).toISOString() : null;
    
    await createToken.mutateAsync({
      project_id: projectId,
      name: name || 'Link de Acesso',
      password: hasPassword ? password : undefined,
      expires_at: expiresAt,
    });

    // Reset form
    setName('');
    setPassword('');
    setHasPassword(false);
    setHasExpiry(false);
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/view/${token}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link copiado!',
      description: 'O link foi copiado para a área de transferência.',
    });
  };

  const activeTokens = tokens.filter(t => t.is_active);
  const inactiveTokens = tokens.filter(t => !t.is_active);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Carregando links...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create New Link */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gerar Novo Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Link (opcional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Link para Cliente X"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Label>Proteger com senha</Label>
            </div>
            <Switch checked={hasPassword} onCheckedChange={setHasPassword} />
          </div>

          {hasPassword && (
            <div className="space-y-2">
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite a senha"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label>Definir expiração</Label>
            </div>
            <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} />
          </div>

          {hasExpiry && (
            <div className="space-y-2">
              <Label>Expira em (dias)</Label>
              <Input
                type="number"
                value={expiryDays}
                onChange={(e) => setExpiryDays(parseInt(e.target.value) || 30)}
                min={1}
                max={365}
                className="w-24"
              />
            </div>
          )}

          <Button
            onClick={handleCreateToken}
            disabled={createToken.isPending || (hasPassword && !password)}
            className="w-full gap-2"
          >
            {createToken.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Gerar Link
          </Button>
        </CardContent>
      </Card>

      {/* Active Links */}
      {activeTokens.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Links Ativos ({activeTokens.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeTokens.map((token) => {
              const isExpired = token.expires_at && isPast(new Date(token.expires_at));
              
              return (
                <div
                  key={token.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{token.name || 'Link de Acesso'}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {token.has_password && (
                        <Badge variant="outline" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          Protegido
                        </Badge>
                      )}
                      {token.expires_at && (
                        <Badge variant={isExpired ? 'destructive' : 'secondary'} className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {isExpired 
                            ? 'Expirado' 
                            : `Expira ${formatDistanceToNow(new Date(token.expires_at), { locale: ptBR, addSuffix: true })}`
                          }
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Criado {formatDistanceToNow(new Date(token.created_at), { locale: ptBR, addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyLink(token.token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => revokeToken.mutate(token.id)}
                      disabled={revokeToken.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Inactive Links */}
      {inactiveTokens.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">
              Links Revogados ({inactiveTokens.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inactiveTokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center gap-3 rounded-lg border p-3 opacity-60"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{token.name || 'Link de Acesso'}</p>
                  <span className="text-xs text-muted-foreground">Revogado</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteToken.mutate(token.id)}
                  disabled={deleteToken.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tokens.length === 0 && (
        <div className="rounded-lg border p-6 text-center">
          <Link2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum link criado</h3>
          <p className="text-muted-foreground">
            Gere links de acesso para compartilhar o dashboard com seus clientes.
          </p>
        </div>
      )}
    </div>
  );
}
