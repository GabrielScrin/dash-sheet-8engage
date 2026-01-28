

## Plano: Corrigir Integração Google Sheets

### Problema Identificado

O sistema não está conseguindo acessar as planilhas do Google porque:

1. **O `google_refresh_token` está vazio** no banco de dados para todos os usuários
2. **O Supabase Auth não expõe o `provider_refresh_token`** na sessão após o redirect OAuth por questões de segurança
3. A edge function depende desse refresh token que nunca é salvo

### Solução Proposta

Usar o **`provider_token`** (access token) que está disponível na sessão do Supabase, ao invés de tentar usar o refresh token.

---

### Mudanças Necessárias

**1. AuthContext.tsx**
- Adicionar método para obter o `provider_token` da sessão atual
- Expor um método `getGoogleAccessToken()` que retorna o token atual
- Salvar o `provider_token` quando disponível

**2. Componentes SheetSelector.tsx e SheetTabSelector.tsx**
- Passar o access token diretamente para a edge function
- Adicionar tratamento de erro quando token não disponível

**3. Edge Function google-sheets/index.ts**
- Aceitar o access token diretamente no request (opção A)
- OU usar o provider_token da sessão Supabase (opção B - preferida)
- Manter lógica de refresh como fallback

**4. Hook useSheetData.ts**
- Ajustar para passar token quando necessário

---

### Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────┐
│  1. Usuário faz login com Google                            │
│     → Supabase Auth retorna session com provider_token      │
├─────────────────────────────────────────────────────────────┤
│  2. AuthContext detecta provider_token na sessão            │
│     → Salva no profiles.google_refresh_token (se disponível)│
├─────────────────────────────────────────────────────────────┤
│  3. Usuário clica "Selecionar Planilha"                     │
│     → SheetSelector obtém provider_token da sessão          │
│     → Passa token para edge function via header             │
├─────────────────────────────────────────────────────────────┤
│  4. Edge function recebe token                              │
│     → Usa token direto OU busca do profiles                 │
│     → Chama Google Sheets API                               │
│     → Retorna lista de planilhas                            │
└─────────────────────────────────────────────────────────────┘
```

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/contexts/AuthContext.tsx` | Adicionar captura do `provider_token` e método para obtê-lo |
| `src/components/sheets/SheetSelector.tsx` | Passar provider_token via header customizado |
| `src/components/sheets/SheetTabSelector.tsx` | Passar provider_token via header |
| `src/hooks/useSheetData.ts` | Passar provider_token nas chamadas |
| `supabase/functions/google-sheets/index.ts` | Aceitar token via header `x-google-token`, usar direto sem refresh |

---

### Detalhes Técnicos

**AuthContext - Novo método:**
```typescript
// Adicionar ao contexto
const getGoogleAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.provider_token ?? null;
};
```

**Edge Function - Nova lógica:**
```typescript
// Verificar se token foi passado diretamente
const googleToken = req.headers.get("x-google-token");
if (googleToken) {
  // Usar token direto
  accessToken = googleToken;
} else {
  // Fallback: buscar do profiles e fazer refresh
  const refreshToken = profile.google_refresh_token;
  accessToken = await refreshAccessToken(refreshToken);
}
```

**SheetSelector - Chamada com token:**
```typescript
const { data: { session } } = await supabase.auth.getSession();
const providerToken = session?.provider_token;

const { data, error } = await supabase.functions.invoke('google-sheets', {
  body: { action: 'list-spreadsheets' },
  headers: providerToken ? { 'x-google-token': providerToken } : undefined,
});
```

---

### Tratamento de Erros

- Se o `provider_token` expirou (erro 401 do Google):
  - Mostrar mensagem pedindo para fazer logout e login novamente
  - Adicionar botão "Reconectar Google" que força novo fluxo OAuth

---

### Resultado Esperado

Após as correções:

1. ✅ Login com Google funciona normalmente
2. ✅ Seletor de planilhas abre e mostra planilhas do Drive
3. ✅ Seleção de aba funciona
4. ✅ Dados da planilha são carregados no dashboard
5. ✅ Se token expirar, mensagem clara pede re-autenticação

