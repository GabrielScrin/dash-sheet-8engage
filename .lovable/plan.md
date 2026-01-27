

## Plano: Integração Funcional com Google Sheets

### Diagnóstico dos Problemas

1. **Seleção de planilhas não funciona** - Falta uma edge function para chamar a Google Sheets API usando o access_token do usuário logado
2. **Provider token não capturado** - O AuthContext não está salvando o `provider_token` que o Google retorna após o login OAuth
3. **Tabela de criativos sem thumbnails** - O componente `CreativePerformanceTable` não tem suporte para exibir imagens de thumbnail nem links
4. **Dados mockados** - Todo o dashboard usa dados estáticos de demonstração

---

### Fase 1: Captura e Armazenamento do Token Google

**Atualizar AuthContext.tsx**
- Capturar `provider_token` e `provider_refresh_token` do callback OAuth
- Salvar na tabela `profiles.google_refresh_token` (já existe)
- Expor método para obter token atualizado

**Lógica de refresh de tokens**
- Criar edge function `google-auth` para renovar access_token usando refresh_token quando expirar

---

### Fase 2: Edge Function para Google Sheets API

**Criar `supabase/functions/google-sheets/index.ts`**

A edge function terá 3 endpoints:

| Ação | Descrição |
|------|-----------|
| `list-spreadsheets` | Lista planilhas do Drive do usuário |
| `get-sheets` | Lista abas de uma planilha específica |
| `read-data` | Lê dados de um range específico |

**Fluxo de dados:**
```
Frontend → Edge Function → Google Sheets API v4
         ↓
    Supabase (cache opcional)
```

**Headers e autenticação:**
- Recebe JWT do usuário autenticado
- Busca `google_refresh_token` do profile
- Gera novo access_token via OAuth refresh
- Chama Google Sheets API com Bearer token

---

### Fase 3: Interface de Seleção de Planilhas

**Criar `src/components/sheets/SheetSelector.tsx`**

Componentes:
- Modal/Dialog para listar planilhas
- Busca e filtro por nome
- Preview das primeiras linhas ao selecionar aba
- Indicador de loading e tratamento de erros

**Atualizar `ProjectConfig.tsx`**
- Conectar botão "Selecionar Planilha" ao SheetSelector
- Salvar `spreadsheet_id` e `spreadsheet_name` no projeto
- Avançar automaticamente para Step 2 (seleção de aba)

---

### Fase 4: Performance por Criativo com Thumbnails

**Atualizar interface `CreativeData`**

Adicionar campos opcionais:
```typescript
interface CreativeData {
  id: string;
  name: string;
  thumbnail?: string;  // URL da imagem
  link?: string;       // Link do criativo
  impressions: number;
  clicks: number;
  ctr: number;
  landingViews: number;
  checkoutViews: number;
  sales: number;
}
```

**Atualizar `CreativePerformanceTable.tsx`**
- Coluna com thumbnail clicável (abre link do criativo)
- Fallback para ícone caso não tenha imagem
- Tooltip com nome completo ao passar mouse
- Link externo abre em nova aba

---

### Fase 5: Conexão de Dados Reais

**Criar hook `useSheetData.ts`**
- Chama edge function para buscar dados da planilha
- Aplica mapeamento de colunas configurado
- Transforma dados para formato do dashboard
- Cache local com React Query (5 min TTL)

**Atualizar `DashboardView.tsx`**
- Substituir mock data por dados reais via hook
- Estados de loading e empty
- Mensagens de erro amigáveis

---

### Estrutura de Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/google-sheets/index.ts` | Criar |
| `src/contexts/AuthContext.tsx` | Modificar (capturar provider_token) |
| `src/components/sheets/SheetSelector.tsx` | Criar |
| `src/components/sheets/SheetPreview.tsx` | Criar |
| `src/pages/app/ProjectConfig.tsx` | Modificar (integrar selector) |
| `src/components/dashboard/CreativePerformanceTable.tsx` | Modificar (thumbnails) |
| `src/hooks/useSheetData.ts` | Criar |
| `src/components/dashboard/DashboardView.tsx` | Modificar (dados reais) |

---

### Secrets Necessários

Para a edge function funcionar, serão necessárias as credenciais do Google Cloud:

| Secret | Descrição |
|--------|-----------|
| `GOOGLE_CLIENT_ID` | Client ID do OAuth |
| `GOOGLE_CLIENT_SECRET` | Client Secret do OAuth |

---

### Resultado Esperado

Após implementação:

1. **Login funcional** - Usuário loga com Google e autoriza acesso às planilhas
2. **Listar planilhas** - Modal mostra todas as planilhas do Drive do usuário
3. **Selecionar aba** - Preview dos dados antes de confirmar
4. **Dashboard com dados reais** - Big numbers, tabelas e funil mostram dados da planilha
5. **Thumbnails de criativos** - Tabela exibe imagens e links dos criativos (se existirem na planilha)

