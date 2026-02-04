
# Plano: Corrigir TypeScript e Redeploy meta-api

## Problema
Erros de TypeScript impedem o deploy da Edge Function `meta-api`:
```
TS7022: 'res' implicitly has type 'any' (linhas 136, 201)
TS7022: 'page' implicitly has type 'any' (linhas 137, 202)
```

## Solução
Adicionar tipagem explícita nas variáveis `res` e `page` nos blocos **campaigns** e **insights**, seguindo o mesmo padrão já aplicado no bloco **ad-accounts**.

## Mudanças Técnicas

### Arquivo: `supabase/functions/meta-api/index.ts`

**Bloco campaigns (linhas 136-137):**
```typescript
// De:
const res = await fetch(nextUrl);
const page = await res.json();

// Para:
const res: Response = await fetch(nextUrl);
const page: { data?: any[]; paging?: { next?: string }; error?: { message: string } } = await res.json();
```

**Bloco insights (linhas 201-202):**
```typescript
// De:
const res = await fetch(nextUrl);
const page = await res.json();

// Para:
const res: Response = await fetch(nextUrl);
const page: { data?: any[]; paging?: { next?: string }; error?: { message: string } } = await res.json();
```

## Após Correção
1. Build passará sem erros
2. Edge Function `meta-api` será redeployada automaticamente
3. `action=campaigns` funcionará corretamente
4. Lista completa de campanhas (ativas e inativas) estará disponível

## Resultado Esperado
- Sem erros de TypeScript
- Deploy automático da função
- Endpoint `action=campaigns` retornando todas as campanhas com campos `id`, `name`, `effective_status`, `status`
