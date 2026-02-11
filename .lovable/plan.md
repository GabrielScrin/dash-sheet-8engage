
## Problema
Os erros de TypeScript ocorrem porque:
1. O tipo `SheetMetricFormat` (linha 117 de DashboardView.tsx) é definido como `'number' | 'currency' | 'percentage' | 'decimal'`, mas o código tenta atribuir `'link'` a ele na linha 1033.
2. As comparações nas linhas 2064 e 2066 comparam `option.format !== 'link'`, mas `option.format` tem tipos que não incluem `'link'` (MetricFormat e SheetMetricFormat).

## Causa Raiz
O formato `'link'` é usado para a coluna "Instagram Permalink URL" (coluna de links de criativos do sheet), mas não foi incluído na definição do tipo `SheetMetricFormat`.

## Solução

### Mudança 1: Expandir o tipo `SheetMetricFormat`
**Arquivo**: `src/components/dashboard/DashboardView.tsx` (linha 117)

De:
```typescript
type SheetMetricFormat = 'number' | 'currency' | 'percentage' | 'decimal';
```

Para:
```typescript
type SheetMetricFormat = 'number' | 'currency' | 'percentage' | 'decimal' | 'link';
```

Isso permite que o tipo aceite `'link'` como um valor válido, resolvendo o erro na linha 1033.

### Mudança 2: Garantir tipagem correta nas comparações
As linhas 2064 e 2066 comparam `option.format !== 'link'` para filtrar opções de métrica que não são links (já que links não devem aparecer em gráficos).

Com a mudança acima, estas comparações funcionarão corretamente porque:
- `metaWeeklyMetricOptions` terá elementos do tipo que inclui `'link'` 
- `sheetMetricOptions` será tipado como `{ format: SheetMetricFormat; ... }` (que agora inclui `'link'`)

## Sequência
1. Atualizar o tipo `SheetMetricFormat` para incluir `'link'`
2. Nenhuma outra mudança de código é necessária - as comparações funcionarão automaticamente

## Resultado Esperado
- Build TypeScript sem erros
- Coluna de links Instagram continua funcionando
- Filtro de gráficos continua excluindo links corretamente
