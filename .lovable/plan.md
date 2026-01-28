

## Plano: Tornar Todos os Menus Funcionais

### Resumo dos Problemas

| Menu | Status Atual | Problema |
|------|--------------|----------|
| Menu 2 - Abas | Parcialmente funcional | Permite apenas 1 aba, precisa de seleção múltipla |
| Menu 3 - Colunas | Placeholder | Sem interface de mapeamento, apenas texto informativo |
| Menu 4 - KPIs | Placeholder | Sem configuração de Big Numbers e Funil |
| Menu 5 - Compartilhar | Placeholder | Sem geração de links de acesso |

---

### Fase 1: Seleção de Múltiplas Abas (Menu 2)

**Mudança no Banco de Dados**
- Alterar campo `sheet_name` (string) para `sheet_names` (array de strings) na tabela `projects`
- OU criar tabela relacionada `project_sheets` para armazenar múltiplas abas

**Mudanças no Frontend**

1. **Atualizar `SheetTabSelector.tsx`**
   - Adicionar checkboxes para seleção múltipla
   - Manter lista de abas selecionadas em estado local
   - Botão "Confirmar Seleção" ao final
   - Indicador visual de abas já selecionadas

2. **Atualizar `ProjectConfig.tsx`**
   - Modificar `handleTabSelect` para aceitar array de abas
   - Exibir badges com abas selecionadas

3. **Atualizar interface do `Project`**
   - Tipo do campo de abas para suportar múltiplos valores

---

### Fase 2: Mapeamento de Colunas (Menu 3)

**Criar componente `ColumnMapper.tsx`**

Funcionalidades:
- Carregar cabeçalhos das abas selecionadas usando `useSheetData`
- Lista de colunas disponíveis (arrastáveis)
- Slots de destino para diferentes métricas:
  - Big Numbers (até 12)
  - Campos do funil (até 8 etapas)
  - Dados de criativos (nome, thumbnail, link)
  - Dados semanais
- Drag and drop usando `@dnd-kit/core` (já instalado)
- Salvar mapeamentos na tabela `column_mappings`

**Estrutura visual:**
```
┌─────────────────────────────────────────────────────────┐
│  Colunas da Planilha          │  Mapeamentos           │
│ ┌─────────────────────┐       │ ┌──────────────────┐   │
│ │ 📊 Data             │       │ │ Big Numbers      │   │
│ │ 📊 Vendas           │ ───▶  │ │ • Vendas         │   │
│ │ 📊 Faturamento      │       │ │ • Faturamento    │   │
│ │ 📊 Impressões       │       │ └──────────────────┘   │
│ │ 📊 Cliques          │       │ ┌──────────────────┐   │
│ │ 📊 Nome Criativo    │       │ │ Funil            │   │
│ │ 📊 Thumbnail URL    │       │ │ 1. Impressões    │   │
│ │ 📊 Link             │       │ │ 2. Cliques       │   │
│ └─────────────────────┘       │ └──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

### Fase 3: Configuração de KPIs (Menu 4)

**Criar componente `KPIConfigurator.tsx`**

Funcionalidades:
- Exibir preview dos Big Numbers com dados reais
- Configurar formato de cada métrica (número, moeda, %, decimal)
- Definir nome de exibição customizado
- Ordenar KPIs via drag-and-drop
- Configurar etapas do funil (ordem e labels)
- Preview em tempo real do funil

**Tabela de configuração:**

| Métrica | Coluna Original | Formato | Nome Exibição |
|---------|-----------------|---------|---------------|
| Vendas | vendas_total | Número | Vendas Totais |
| Revenue | faturamento_br | Moeda (R$) | Faturamento |

---

### Fase 4: Compartilhamento (Menu 5)

**Criar componente `ShareManager.tsx`**

Funcionalidades:
- Gerar token único de acesso (usar tabela `share_tokens`)
- Opções de proteção:
  - Senha opcional
  - Data de expiração
  - Filtros permitidos
- Lista de links gerados
- Copiar link para clipboard
- Revogar acesso

**Interface:**
```
┌─────────────────────────────────────────────┐
│  Gerar Novo Link                            │
│  ┌───────────────────────────────────────┐  │
│  │ Nome: Link para Cliente X             │  │
│  │ Expiração: [ ] Nunca / [x] 30 dias    │  │
│  │ Senha: [ ] Sem senha / [x] ****       │  │
│  │ [Gerar Link]                          │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Links Ativos                               │
│  ┌───────────────────────────────────────┐  │
│  │ Cliente X - Expira em 15 dias  [Copiar]│ │
│  │ Interno - Permanente           [Revogar]│ │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

### Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/components/config/ColumnMapper.tsx` | Interface drag-and-drop para mapeamento |
| `src/components/config/KPIConfigurator.tsx` | Configuração de Big Numbers e Funil |
| `src/components/config/ShareManager.tsx` | Gerenciamento de links de compartilhamento |
| `src/components/config/ColumnItem.tsx` | Componente arrastável de coluna |
| `src/components/config/MappingSlot.tsx` | Slot de destino para mapeamento |
| `src/hooks/useColumnMappings.ts` | Hook para salvar/carregar mapeamentos |
| `src/hooks/useShareTokens.ts` | Hook para gerenciar tokens de acesso |

---

### Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/sheets/SheetTabSelector.tsx` | Adicionar seleção múltipla com checkboxes |
| `src/pages/app/ProjectConfig.tsx` | Integrar novos componentes nos steps 3, 4 e 5 |
| `src/hooks/useSheetData.ts` | Suportar múltiplas abas |

---

### Migração de Banco de Dados

Adicionar suporte para múltiplas abas:

```sql
-- Opção 1: Usar JSONB array
ALTER TABLE projects 
ADD COLUMN sheet_names JSONB DEFAULT '[]';

-- Migrar dados existentes
UPDATE projects 
SET sheet_names = jsonb_build_array(sheet_name)
WHERE sheet_name IS NOT NULL;
```

---

### Ordem de Implementação

1. **Migração do banco** - Adicionar campo `sheet_names`
2. **SheetTabSelector** - Implementar seleção múltipla
3. **ColumnMapper** - Criar interface de mapeamento com drag-and-drop
4. **KPIConfigurator** - Configuração de formatos e labels
5. **ShareManager** - Geração de links de acesso
6. **Integração** - Conectar tudo no ProjectConfig

---

### Resultado Esperado

Após implementação:

1. Menu 2 permite selecionar múltiplas abas da planilha
2. Menu 3 mostra colunas disponíveis e permite arrastar para slots de métricas
3. Menu 4 permite configurar formato, ordem e labels dos KPIs
4. Menu 5 permite gerar links de acesso com configurações de segurança
5. Dashboard exibe dados reais baseados nos mapeamentos configurados

