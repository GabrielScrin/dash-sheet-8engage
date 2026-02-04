

# Plano: Corrigir Tipagem TypeScript e Redeploy meta-api

## Problema Identificado
O bloco `action === 'ad-thumbnails'` (linhas 190-191) possui variáveis `res` e `page` sem tipagem explícita, o que pode causar erros de build TypeScript e impedir o redeploy da Edge Function.

## Solução
Adicionar tipagem explícita nas variáveis do bloco `ad-thumbnails`, seguindo o mesmo padrão já aplicado nos outros blocos.

## Mudanças Técnicas

### Arquivo: `supabase/functions/meta-api/index.ts`

**Bloco ad-thumbnails (linhas 190-191):**
```typescript
// De:
const res = await fetch(graphUrl);
const page = await res.json();

// Para:
const res: Response = await fetch(graphUrl);
const page: Record<string, any> & { error?: { message: string } } = await res.json();
```

## Sequência de Execução
1. Aplicar correção de tipagem no bloco `ad-thumbnails`
2. Fazer redeploy da Edge Function `meta-api`
3. Verificar que todos os endpoints funcionam: `ad-accounts`, `campaigns`, `ad-thumbnails`, `insights`

## Resultado Esperado
- Build sem erros de TypeScript
- Edge Function `meta-api` redeployada com sucesso
- Endpoint `action=ad-thumbnails` funcional e retornando thumbnails dos anúncios

