
# Plano para Corrigir a Conexão Meta Ads

## Problemas Identificados

Existem **3 problemas principais** que precisam ser corrigidos:

---

### Problema 1: Edge Function `meta-auth` Não Está Implantada (404 no OPTIONS)

**Sintoma:** A requisição OPTIONS retorna 404, indicando que a Edge Function não existe no servidor Supabase.

**Causa:** A função existe no código, mas não foi implantada. A função precisa ser deployada para o Supabase.

**Solução:** Implantar a Edge Function `meta-auth`.

---

### Problema 2: Headers CORS Incompletos

**Sintoma:** `net::ERR_FAILED` após o 404.

**Causa:** Os headers CORS na Edge Function não incluem todos os headers que o Supabase client envia.

**Headers faltando no CORS:**
```
Access-Control-Allow-Headers: "authorization, x-client-info, apikey, content-type"
```

**Headers que o cliente envia (segundo o erro):**
```
x-supabase-client-platform
```

**Solução:** Atualizar os CORS headers nas Edge Functions `meta-auth` e `meta-api`:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

---

### Problema 3: Colunas `source_type` e `source_config` Não Existem no Banco de Dados

**Sintoma:** Erros de build TypeScript:
```
Type '...' is missing the following properties: source_type, source_config
```

**Causa:** O frontend (`ProjectConfig.tsx`) espera colunas `source_type` e `source_config` na tabela `projects`, mas elas não existem no schema atual (conforme `types.ts`).

**Solução:** Criar migração para adicionar as colunas à tabela `projects`:

```sql
ALTER TABLE public.projects
ADD COLUMN source_type TEXT DEFAULT 'sheet',
ADD COLUMN source_config JSONB DEFAULT '{}';
```

---

### Problema 4: Tabela `service_tokens` Não Existe

**Sintoma:** A Edge Function `meta-auth` tenta salvar tokens na tabela `service_tokens`, que não existe no schema.

**Solução:** Criar a tabela `service_tokens`:

```sql
CREATE TABLE public.service_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Habilitar RLS
ALTER TABLE public.service_tokens ENABLE ROW LEVEL SECURITY;

-- Apenas o proprietário pode ver seus tokens
CREATE POLICY "Users can read own tokens" ON public.service_tokens
  FOR SELECT USING (auth.uid() = user_id);
```

---

## Resumo das Mudanças

| Arquivo/Recurso | Mudança |
|-----------------|---------|
| `supabase/functions/meta-auth/index.ts` | Atualizar CORS headers |
| `supabase/functions/meta-api/index.ts` | Atualizar CORS headers |
| Migração SQL | Adicionar colunas `source_type` e `source_config` à tabela `projects` |
| Migração SQL | Criar tabela `service_tokens` com RLS |
| Deploy | Implantar Edge Functions `meta-auth` e `meta-api` |

---

## Fluxo Após Correção

```text
1. Usuário clica em "Conectar Meta Ads"
2. Frontend chama meta-auth?action=authorize
3. Edge Function retorna URL do Facebook OAuth
4. Usuário é redirecionado ao Facebook para autorizar
5. Facebook redireciona de volta com código
6. Frontend chama meta-auth?action=callback com o código
7. Edge Function troca código por access_token
8. Token é salvo na tabela service_tokens
9. Usuário pode listar contas de anúncios via meta-api
```

---

## Ordem de Implementação

1. **Primeiro:** Criar migração SQL para adicionar colunas e tabela
2. **Segundo:** Atualizar CORS headers nas Edge Functions
3. **Terceiro:** Implantar as Edge Functions
4. **Quarto:** Testar o fluxo completo

---

## Notas Técnicas

- Os secrets `META_CLIENT_ID` e `META_CLIENT_SECRET` já estão configurados
- A Edge Function usa `verify_jwt = true`, o que significa que precisa de autenticação Supabase
- O callback do OAuth Meta redireciona para a própria Edge Function, não para o frontend (pode precisar de ajuste para melhor UX)
