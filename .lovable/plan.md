
# Plano para Corrigir Conexão Meta Ads

## Problemas Identificados

### Problema 1: Escopo Inválido `read_insights`

**Erro do Facebook:**
```
Invalid Scopes: read_insights
```

**Causa:** O secret `META_SCOPES` contém o escopo `read_insights` que não é mais válido na API do Meta. Este escopo foi descontinuado e suas funcionalidades foram incorporadas ao escopo `ads_read`.

**Solução:** Atualizar o secret `META_SCOPES` para usar apenas escopos válidos:
- Valor atual: `ads_read,read_insights,business_management`
- Valor correto: `ads_read,business_management`

---

### Problema 2: Erros de TypeScript em `DashboardView.tsx`

**Erro:**
```
Property 'ad_account_id' does not exist on type 'Json'
```

**Causa:** O campo `source_config` na tabela `projects` é do tipo `Json` (genérico do Supabase), que pode ser string, number, boolean, array ou objeto. O TypeScript não consegue garantir que é um objeto com a propriedade `ad_account_id`.

**Solução:** Criar um helper para tipar corretamente o `source_config` e garantir acesso seguro às propriedades:

```typescript
interface MetaSourceConfig {
  ad_account_id?: string;
  [key: string]: unknown;
}

function getSourceConfig(config: unknown): MetaSourceConfig | null {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return config as MetaSourceConfig;
  }
  return null;
}

// Uso:
const sourceConfig = getSourceConfig(project?.source_config);
const adAccountId = sourceConfig?.ad_account_id;
```

---

## Resumo das Correções

| Item | Ação |
|------|------|
| Secret `META_SCOPES` | Atualizar para `ads_read,business_management` (remover `read_insights`) |
| `DashboardView.tsx` | Criar helper function para tipar `source_config` corretamente |

---

## Ordem de Implementação

1. **Primeiro:** Solicitar atualização do secret `META_SCOPES` via ferramenta
2. **Segundo:** Corrigir os erros de TypeScript em `DashboardView.tsx`
3. **Terceiro:** Testar o fluxo de conexão novamente

---

## Escopos Meta Ads Válidos (Referência)

Para Marketing API do Meta, os escopos recomendados são:

| Escopo | Descrição |
|--------|-----------|
| `ads_read` | Leitura de campanhas, ad sets, ads e insights (inclui métricas) |
| `ads_management` | Criação e edição de anúncios (não necessário para leitura) |
| `business_management` | Acesso a Business Manager e contas de anúncios |

O escopo `read_insights` era usado em versões antigas da API (pré-v3.0) e foi removido.
