# Payment Attribution (Fase 1)

## Objetivo
Cruzar dados de vendas das plataformas de pagamento com campanhas da Meta para calcular ROAS/ROI por campanha, conjunto e anúncio.

## O que foi implementado
- Migração com tabelas:
  - `public.payment_connections`
  - `public.attribution_sessions`
  - `public.payment_orders`
- Edge Function: `payment-attribution`
  - `action=upsert-session` (autenticado)
  - `action=ingest-webhook` (webhook com segredo)
  - `action=attribution-summary` (autenticado ou via `x-share-token`)
- Dashboard Meta integrado (Fase 1.1):
  - Usa `attribution-summary` para substituir vendas/receita quando disponível.
  - ROAS/ROI passam a refletir dados de pagamento.
  - Performance por criativo usa vendas/receita por `ad_id` quando existir atribuição.

## Segredos necessários (Supabase)
- `PAYMENT_WEBHOOK_SECRET`: segredo para validar webhooks de pagamento.

## Fluxo recomendado (MVP)
1. Landing salva sessão de atribuição:
   - `session_key`, `utm_*`, `campaign_id`, `adset_id`, `ad_id`, `fbclid`, `fbc`, `fbp`.
2. Checkout recebe `session_key` + `project_id` + `user_id` em metadata.
3. Webhook da plataforma chama:
   - `POST /functions/v1/payment-attribution?action=ingest-webhook&provider=hotmart`
   - Header: `x-webhook-secret: <PAYMENT_WEBHOOK_SECRET>`
4. Dashboard consulta:
   - `POST /functions/v1/payment-attribution?action=attribution-summary&projectId=<id>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

## Exemplo: salvar sessão de atribuição
`POST /functions/v1/payment-attribution?action=upsert-session`

```json
{
  "projectId": "PROJECT_UUID",
  "sessionKey": "sess_abc123",
  "utm_source": "meta",
  "utm_medium": "paid_social",
  "utm_campaign": "nome-campanha",
  "utm_content": "nome-anuncio",
  "campaign_id": "1202...",
  "adset_id": "1202...",
  "ad_id": "1202...",
  "fbclid": "..."
}
```

## Exemplo: payload mínimo no webhook (recomendado)
```json
{
  "order_id": "HP-123",
  "status": "approved",
  "gross_amount": 197.0,
  "net_amount": 162.0,
  "approved_at": "2026-02-11T16:00:00Z",
  "metadata": {
    "user_id": "USER_UUID",
    "project_id": "PROJECT_UUID",
    "session_key": "sess_abc123",
    "campaign_id": "1202...",
    "adset_id": "1202...",
    "ad_id": "1202..."
  }
}
```

## Cálculos esperados no dashboard
- `ROAS = receita / investimento`
- `ROI = (receita - investimento - custos) / investimento`

> Nesta fase, a base de atribuição já está pronta para receber webhooks e retornar agregações por campanha/adset/ad.
