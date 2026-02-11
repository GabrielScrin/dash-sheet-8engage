

# Tarefas: Migration, Deploy e Secret + Correcao de Build Errors

## 1. Rodar a migration `20260211130000_add_payment_attribution_phase1.sql`
A migration ja existe no repositorio mas as tabelas (`payment_connections`, `attribution_sessions`, `payment_orders`) ainda nao existem no banco. Sera executada via ferramenta de migration.

## 2. Deploy da Edge Function `payment-attribution`
Deploiar a funcao ja existente em `supabase/functions/payment-attribution/index.ts`. Tambem atualizar `supabase/config.toml` para incluir a configuracao com `verify_jwt = false` (validacao manual no codigo).

## 3. Configurar secret `PAYMENT_WEBHOOK_SECRET`
Usar a ferramenta de secrets para solicitar ao usuario o valor do segredo.

## 4. Corrigir build errors em DashboardView.tsx

### Erro 1: `roi` nao definido (linha 2564)
A variavel `roi` e usada mas nunca declarada. Correcao:
```typescript
const roi = spend > 0 ? (purchaseValue - spend) / spend : 0;
```
Adicionar antes da linha 2557 (return).

### Erro 2: `previousValue` nao existe no tipo (linha 2777)
O destructuring usa `previousValue` mas o tipo dos arrays `metaBigNumbers` nao inclui essa propriedade. Correcao: usar optional chaining com fallback:
```typescript
const previousValue = 'previousValue' in kpi ? (kpi as any).previousValue : undefined;
```

## Sequencia de Execucao
1. Corrigir os 2 build errors em `DashboardView.tsx`
2. Rodar a migration do payment attribution
3. Adicionar config da edge function no `config.toml`
4. Deploy da edge function `payment-attribution`
5. Solicitar o secret `PAYMENT_WEBHOOK_SECRET`

