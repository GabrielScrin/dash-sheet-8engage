

# Plano para Tornar o App Funcional

## Problemas Identificados

Após análise detalhada do código, identifiquei **6 problemas críticos** que estão impedindo o funcionamento correto do app:

---

### 1. Autenticação Google OAuth Incompleta

**Sintoma**: Login funciona, mas acesso às planilhas falha.

**Causa Raiz**: O fluxo de OAuth está configurado para solicitar `access_type: 'offline'` e salvar o `provider_refresh_token`, mas:
- O `provider_refresh_token` só é fornecido pelo Google na **primeira autorização** (quando `prompt: 'consent'` é usado)
- Se o usuário já autorizou antes, o Google não envia um novo refresh token
- O código depende do `provider_token` (access token de curta duração) que expira em ~1 hora

**Solução**: 
- Garantir que o refresh token seja sempre solicitado e armazenado
- Fallback para o refresh token quando o access token expira
- Adicionar trigger no banco para criar perfil automaticamente no signup

---

### 2. Perfil de Usuário Não Criado Automaticamente

**Sintoma**: Erro ao acessar planilhas após login.

**Causa Raiz**: O código tenta salvar `google_refresh_token` na tabela `profiles`, mas:
- Não existe trigger para criar automaticamente um registro em `profiles` quando um usuário se registra
- A função `handle_new_user()` mencionada nas migrations pode não estar funcionando corretamente

**Solução**:
- Criar/verificar trigger `on_auth_user_created` que insere em `profiles`
- Garantir que o código frontend faça upsert ao invés de apenas update

---

### 3. Preview do Dashboard Não Carrega Dados

**Sintoma**: DashboardView mostra "Configuração Incompleta" ou dados vazios.

**Causa Raiz**: 
- A query para buscar dados do Google Sheets depende de ter um `provider_token` válido OU um `shareToken`
- Se o token expirou e não há refresh token salvo, a requisição falha
- A Edge Function `google-sheets` retorna erro 400 com `GOOGLE_RECONNECT_REQUIRED`

**Solução**:
- Melhorar tratamento de erro no DashboardView para mostrar mensagem clara
- Adicionar botão "Reconectar Google" quando token expira
- Verificar se refresh token está sendo usado corretamente na Edge Function

---

### 4. Botão "Salvar Mapeamentos" - Possível Problema de RLS

**Sintoma**: Botão de salvar não funciona (sem feedback visual de erro).

**Causa Raiz**: Após análise das RLS policies, as políticas parecem corretas. O problema pode ser:
- O `projectId` não está sendo passado corretamente
- Erro silencioso na mutation do React Query
- Falta de feedback ao usuário quando ocorre erro

**Solução**:
- Adicionar logs de debug no `ColumnMapper.tsx`
- Verificar se o `handleSave` está capturando erros corretamente
- Adicionar toast de erro explícito na mutation

---

### 5. Links de Compartilhamento Não Funcionam

**Sintoma**: Rota `/view/:token` não carrega o dashboard.

**Causa Raiz**: A validação do token está implementada, mas:
- A Edge Function `validate-share-token` precisa de autenticação anon do Supabase (header `authorization`)
- A chamada no `ViewDashboard.tsx` não inclui este header automaticamente
- A RLS impede que projetos sejam lidos por usuários não autenticados

**Solução**:
- A Edge Function já usa `SUPABASE_SERVICE_ROLE_KEY` para acessar os dados
- Precisa criar uma policy ou view para permitir acesso público aos dados do projeto quando validado via share token
- Alternativa: fazer a Edge Function retornar todos os dados necessários do projeto

---

### 6. Rate Limiting Sem Redis Configurado

**Sintoma**: Edge Function pode falhar silenciosamente.

**Causa Raiz**: O código de rate limiting depende de variáveis `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` que não estão configuradas (não aparecem nos secrets).

**Solução**:
- O código já tem fallback (`redis ? ... : null`), então isso não deve causar erros
- Mas é bom verificar se não há null pointer exceptions

---

## Plano de Implementação

### Fase 1: Correções Críticas de Autenticação

1. **Criar trigger para auto-criar perfil**
   ```sql
   CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS trigger AS $$
   BEGIN
     INSERT INTO public.profiles (user_id, email, full_name, avatar_url)
     VALUES (
       NEW.id,
       NEW.email,
       COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
       NEW.raw_user_meta_data->>'avatar_url'
     )
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

2. **Atualizar AuthContext para fazer upsert do refresh token**
   - Modificar o `onAuthStateChange` para usar upsert ao invés de update

### Fase 2: Correções do Dashboard e Preview

3. **Melhorar tratamento de erros no DashboardView**
   - Detectar erro `GOOGLE_RECONNECT_REQUIRED`
   - Mostrar botão para reconectar conta Google

4. **Adicionar feedback visual no ColumnMapper**
   - Melhorar tratamento de erro no `handleSave`
   - Adicionar loading state mais visível

### Fase 3: Correções de Compartilhamento

5. **Criar política RLS para acesso via share token**
   - Criar view pública para dados de projeto
   - OU modificar Edge Function para retornar dados completos

6. **Modificar google-sheets Edge Function**
   - Quando receber `x-share-token`, buscar project owner e usar seu refresh token
   - Não exigir autenticação do viewer

### Fase 4: Melhorias de UX

7. **Adicionar estados de loading e erro mais claros**
   - Skeleton loaders consistentes
   - Mensagens de erro acionáveis

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/migrations/new.sql` | Trigger para criar perfil + upsert |
| `src/contexts/AuthContext.tsx` | Upsert de perfil ao login |
| `src/components/dashboard/DashboardView.tsx` | Tratamento de erro + botão reconectar |
| `src/components/config/ColumnMapper.tsx` | Melhor feedback de erro |
| `supabase/functions/google-sheets/index.ts` | Ajustar lógica de share token |
| `src/pages/ViewDashboard.tsx` | Passar dados de projeto da validação |

---

## Detalhes Técnicos

### Fluxo de Dados Atual (Problemático)

```text
Usuário -> Login Google -> access_token (1h) + refresh_token
                               |
                               v
               profiles.google_refresh_token (FALHA se não existe profile)
                               |
                               v
               DashboardView -> google-sheets Edge Function
                               |
                               v
               "GOOGLE_RECONNECT_REQUIRED" (refresh_token = null)
```

### Fluxo de Dados Corrigido

```text
Usuário -> Login Google -> access_token + refresh_token
                               |
                               v
            Trigger cria profile automaticamente
                               |
                               v
            AuthContext faz UPSERT do refresh_token
                               |
                               v
            DashboardView -> google-sheets -> refresh_token válido
                               |
                               v
            Dados carregados corretamente
```

