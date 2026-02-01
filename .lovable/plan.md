
# Análise de Conformidade PRD - O Que Falta Implementar

Após análise detalhada do código atual e comparação com o PRD fornecido, segue o status de implementação organizado por categoria.

---

## Resumo Executivo

| Categoria | Implementado | Parcial | Faltando |
|-----------|--------------|---------|----------|
| Autenticação | 2 | 0 | 1 |
| Integração Google | 3 | 0 | 1 |
| Dashboard Core | 6 | 2 | 2 |
| Compartilhamento | 4 | 0 | 0 |
| UX/Design | 4 | 1 | 2 |
| Performance/Segurança | 2 | 2 | 3 |

---

## IMPLEMENTADO (Funcional)

### Autenticação e Acesso
- Autenticação via Google OAuth2 com escopos corretos (`sheets.readonly`, `drive.metadata.readonly`)
- Níveis de acesso Admin (configura) e Cliente (visualiza via link)
- Geração de tokens JWT para links de compartilhamento (com senha opcional e expiração)
- Dashboard público (`/view/:token`) funcional

### Integração Google Sheets
- Integração nativa com Google Sheets API v4 via Edge Functions
- Listagem e seleção visual de planilhas
- Seleção de múltiplas abas (multi-tab)
- Leitura de dados via proxy seguro

### Dashboard Core
- Dois modos: "Perpétua" e "Distribuição de Conteúdos" (tabs)
- Big Numbers com animação CountUp e variação percentual
- Tabela de Comparação Semanal
- Tabela de Performance por Criativo
- Funil de Conversão com animação GSAP/SVG
- Filtros de Data (presets + custom range)
- Filtro de Criativo

### Configuração Admin
- Wizard de 5 passos (Planilha > Aba > Colunas > KPIs > Compartilhar)
- Mapeamento de colunas para categorias
- Configuração de formato (número/moeda/porcentagem)
- Gerenciamento de links de compartilhamento

### Design
- Tema claro e escuro
- Animações com Framer Motion (transições de tabs)
- Responsividade básica
- Paleta inspirada LookerStudio/Meta

---

## PARCIALMENTE IMPLEMENTADO

### 1. Persistência de Filtros na URL
**Status:** Filtros funcionam mas NÃO são persistidos na URL

**O que falta:**
- Query params para `dateFrom`, `dateTo`, `metric`, `creativeId`
- Leitura dos params na inicialização do dashboard
- Atualização automática da URL ao mudar filtros

### 2. Logs de Acesso e Auditoria
**Status:** Tabela `access_logs` existe mas NÃO está sendo populada

**O que falta:**
- Inserir registro em `access_logs` quando cliente visualiza dashboard
- Exibir logs para Admin (quem visualizou, quando, filtros usados)

### 3. Preview em Tempo Real do Mapeamento
**Status:** Existe preview básico da amostra de dados mas não mostra como ficará renderizado

**O que falta:**
- Pequeno painel mostrando BigNumbers/Funil com dados reais durante configuração
- Atualização dinâmica conforme mapeamentos são alterados

---

## NÃO IMPLEMENTADO

### Must Have (Críticos)

#### 1. Cache de Leitura (Redis)
**Impacto:** Performance e quotas do Google
**O que implementar:**
- Sistema de cache para respostas do Google Sheets
- TTL configurável (padrão 5 minutos)
- Invalidação manual pelo Admin

#### 2. Footer com Timestamp do Cache
**Impacto:** UX - Cliente saber quando dados foram atualizados
**O que implementar:**
- Exibir "Última atualização: X min atrás" no rodapé do dashboard

#### 3. Página de Configurações da Conta (`/app/settings`)
**Impacto:** Gestão de tokens e acesso
**O que implementar:**
- Revogar acesso ao Google
- Ver tokens ativos
- Gerenciar conta

---

### Should Have (Importantes)

#### 4. Export CSV/PDF
**Impacto:** Usuários querem baixar dados
**O que implementar:**
- Botão "Exportar" no dashboard
- Gerar CSV dos dados filtrados
- Gerar PDF snapshot do dashboard

#### 5. Ordenação e Filtragem Avançada nas Tabelas
**Impacto:** UX em tabelas grandes
**O que implementar:**
- Clique no header para ordenar
- Filtro por coluna
- Paginação real (atualmente não há)

#### 6. Validação de Dados ao Mapear
**Impacto:** Evitar erros como mapear texto como BigNumber
**O que implementar:**
- Detecção automática de tipo (número, moeda, data, texto)
- Aviso visual se tipo incompatível
- Sugestão de formato baseado nos dados

---

### Could Have (Desejáveis)

#### 7. Página Embed (`/embed/:token`)
**Status:** Rota não existe
**O que implementar:**
- Versão minimal para iframe
- Sem header/footer
- Otimizada para embed

#### 8. Virtualização de Tabelas
**Impacto:** Performance com muitos dados
**O que implementar:**
- Usar react-window ou similar
- Renderizar apenas linhas visíveis

#### 9. Atalhos de Teclado
**Impacto:** Acessibilidade
**O que implementar:**
- Navegar entre tabs com keyboard
- Aplicar filtros
- Shortcuts documentados

---

## Prioridade de Implementação Recomendada

### Fase 1 - Críticos (1-2 dias)
1. **Persistência de Filtros na URL** - Essencial para links compartilháveis funcionarem corretamente
2. **Logs de Acesso** - Auditoria é requisito crítico
3. **Footer com Timestamp** - UX básica

### Fase 2 - Importantes (2-3 dias)
4. **Cache Redis** - Performance e quotas do Google
5. **Validação de Dados no Mapeamento** - Evitar erros de configuração
6. **Preview em Tempo Real** - Melhor UX de configuração

### Fase 3 - Melhorias (3-5 dias)
7. **Ordenação/Paginação de Tabelas**
8. **Export CSV/PDF**
9. **Página de Settings**
10. **Página Embed**

---

## Detalhes Técnicos por Funcionalidade

### Persistência de Filtros na URL

**Arquivos afetados:**
- `src/components/dashboard/DashboardFilters.tsx`
- `src/components/dashboard/DashboardView.tsx`
- `src/pages/ViewDashboard.tsx`

**Abordagem:**
```tsx
// Hook para sincronizar filtros com URL
import { useSearchParams } from 'react-router-dom';

function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const filters = {
    dateFrom: searchParams.get('dateFrom'),
    dateTo: searchParams.get('dateTo'),
    creative: searchParams.get('creative'),
  };
  
  const updateFilters = (newFilters) => {
    setSearchParams(newFilters);
  };
  
  return { filters, updateFilters };
}
```

### Logs de Acesso

**Arquivos afetados:**
- `supabase/functions/validate-share-token/index.ts`
- Nova página: `src/pages/app/ProjectLogs.tsx`

**Abordagem:**
- Inserir log na validação do token
- Capturar IP via headers
- Criar UI para Admin visualizar logs

### Cache Redis

**Nota:** Lovable Cloud não suporta Redis diretamente, mas podemos:
1. Usar cache em memória na Edge Function
2. Usar tabela `cache_entries` no Supabase com TTL
3. Implementar cache no cliente via React Query (já parcialmente feito com `staleTime`)

---

## Conformidade com Planilha Esperada

Para o dashboard funcionar corretamente, a planilha precisa ter colunas numéricas para:

### Big Numbers
Colunas com valores numéricos agregáveis:
- `Total Leads`, `Total Vendas`, `Faturamento`, `Investimento`, etc.

### Funil de Conversão
Colunas numéricas na ordem do funil:
- `Impressões` > `Cliques` > `Landing Page Views` > `Checkout Views` > `Vendas`

### Comparação Semanal
Dados por período com:
- Coluna de data/semana
- Colunas numéricas de métricas

### Performance por Criativo
- Coluna identificadora: `Criativo`, `Creative`, ou `Nome do Criativo`
- Colunas de métricas: `Cliques`, `Impressões`, `Vendas`, etc.

---

## Conclusão

O projeto está aproximadamente **70% implementado** em relação aos requisitos "Must Have" do PRD. As principais lacunas são:

1. **Persistência de filtros na URL** - Impede links compartilháveis completos
2. **Logs de auditoria** - Não está registrando acessos
3. **Cache** - Dependência direta do Google a cada request
4. **Validação de mapeamento** - Usuários podem mapear incorretamente

Deseja que eu implemente alguma dessas funcionalidades em específico?
