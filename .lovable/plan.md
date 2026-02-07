

# Corrigir Metricas de Video e Landing Page View na meta-api

## Problemas Identificados

### 1. Metricas de video infladas/incorretas
O matcher `isVideo3sLike` inclui `thruplay` indevidamente:
```
t.includes('thruplay')  // ERRADO - thruplay nao e video 3s
t.includes('video_play') // ERRADO - muito amplo
```
Isso faz com que valores de thruplay sejam somados como "video 3s", inflando a metrica e quebrando hook_rate.

### 2. Landing Page View contando campanhas sem pagina
O matcher `isLandingViewLike` usa `t.includes('landing_page_view')` que captura action types como `offsite_conversion.fb_pixel_landing_page_view` (evento de pixel). Esse evento de pixel dispara em qualquer campanha com pixel instalado, mesmo sem landing page dedicada. Deve usar apenas o match exato `t === 'landing_page_view'`.

## Mudancas Tecnicas

### Arquivo: `supabase/functions/meta-api/index.ts`

**1. Corrigir `isVideo3sLike` (linha 385-390):**
```typescript
// De:
const isVideo3sLike = (t: string) =>
  t === 'video_view' ||
  t.includes('video_play') ||
  t.includes('thruplay') ||
  t.includes('video_view') ||
  t.includes('video_view_3s');

// Para:
const isVideo3sLike = (t: string) =>
  t === 'video_view' ||
  t === 'video_view_3s';
```

**2. Corrigir `isLandingViewLike` (linha 376-377):**
```typescript
// De:
const isLandingViewLike = (t: string) =>
  t === 'landing_page_view' || t.includes('landing_page_view');

// Para:
const isLandingViewLike = (t: string) =>
  t === 'landing_page_view';
```

**3. Corrigir fallback de video3s (linha 443):**
O fallback `videoPlay` tambem e muito amplo. Ajustar para usar video_play_actions apenas como ultimo recurso quando nenhum action type especifico existe.

## Sequencia de Execucao
1. Aplicar as 3 correcoes no `meta-api/index.ts`
2. Redeploy da Edge Function `meta-api`
3. Verificar que as metricas retornam valores corretos

## Resultado Esperado
- video3s: conta apenas `video_view` e `video_view_3s` (nao mais thruplay)
- hook_rate: calculado corretamente com video3s limpo
- landing_views: conta apenas o action type exato `landing_page_view`, sem pixel events
- Campanhas sem pagina de destino mostrarao 0 landing views

