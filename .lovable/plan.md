## Problema atual

No projeto Meta Ads (`metatataaa`):

1. **Abas Descoberta e Consideração ficam vazias**: hoje elas filtram dados da Meta procurando os termos "descoberta"/"consideracao" no nome da campanha/conjunto/anúncio. Como as campanhas reais não têm esses nomes, o resultado é vazio.
2. **"Detalhe por Mídia → Google" mostra só os 4 big numbers** (gasto, impressões, cliques, conversões). A "Visão Semanal" e a "Performance por Criativo" logo abaixo continuam puxando da Meta.
3. **Falta diferenciar campanhas Search (Pesquisa) e YouTube (Video)** do Google Ads, que têm métricas e leituras totalmente diferentes.

## O que vou fazer

### 1. Edge function `google-ads-api`

- Em `fetchAdPerformanceRows`, incluir no SELECT:
  - `campaign.advertising_channel_type` (SEARCH, VIDEO, DISPLAY, DEMAND_GEN, PERFORMANCE_MAX, …)
  - `campaign.advertising_channel_sub_type`
  - `campaign.status`
- Devolver em cada `row` um campo novo `channelType` normalizado em 3 grupos:
  - `search` → SEARCH
  - `youtube` → VIDEO + DEMAND_GEN (descoberta no YouTube/Discovery)
  - `other` → restante
- Adicionar nova action `active-campaigns` que retorna a lista de campanhas ativas (`status = ENABLED`) com `id`, `name`, `channelType`, métricas agregadas (cost, impressions, clicks, conversions, video_views, ctr, cpc, cpv).

### 2. Frontend — Abas Descoberta e Consideração (projetos Meta Ads)

Redefinir o significado das abas quando `source_type = meta_ads`:

- **Descoberta** = campanhas Google Ads do tipo **YouTube** (VIDEO + DEMAND_GEN) — etapa de topo de funil.
  - Big numbers: Custo, Impressões, Usuários únicos, Frequência média, CPV médio, Visualizações TrueView, Vídeo 25/50/75/100%, CTR.
  - Tabela detalhada já existente em modo "vídeo".
- **Consideração** = campanhas Google Ads do tipo **Search** — etapa de consideração/decisão.
  - Big numbers: Custo, Impressões, Cliques, CTR, CPC médio, Conversões, Custo/Conv., Taxa de conversão.
  - Tabela detalhada em modo "search".
- A aba **Perpetua** continua exibindo a Meta como hoje.
- Remover o alerta antigo de "use nomes contendo descoberta/consideracao". Mostrar alerta novo só quando o Google Ads não estiver conectado ou não retornar campanhas daquele tipo.

### 3. Frontend — "Detalhe por Mídia" → Google

Quando o usuário seleciona a aba **Google** dentro de "Detalhe por Mídia":

- A seção **Visão Semanal/Diária/Mensal** passa a usar o timeseries do Google Ads (já temos `portal-overview`; reutilizar o `ad-performance` agregado por data) com colunas: Investimento, Impressões, Cliques, CTR, CPC, Conversões, Custo/Conv.
- A seção **Performance por Criativo** passa a usar `ad-performance` do Google Ads agrupado por anúncio, com colunas adaptadas ao tipo da campanha (Search → Cliques/CPC/Conv; YouTube → Views/CPV/Quartis).
- Quando o usuário volta para a aba **Meta**, mantém o comportamento atual.
- Adicionar um sub-toggle dentro do Google: **Todas | Pesquisa | YouTube** para filtrar essas duas seções.

### 4. Detalhes técnicos

- Tipos atualizados em `GoogleAdsCampaignDetailRow` para incluir `channelType` e `campaignStatus`.
- Reuso do `googleAdsCampaignDetailsQuery` (action `ad-performance`) — já roda para projetos Meta Ads.
- Sem mudanças de schema no banco — toda a inteligência fica na edge function e no frontend.
- Deploy automático da edge function `google-ads-api` ao final.

### 5. Verificação

- Após deploy, conferir via curl `google-ads-api?action=ad-performance` se `channelType` aparece nas linhas.
- Visualmente no preview: clicar Descoberta, Consideração e Detalhe por Mídia → Google e validar que cada visualização traz dados do Google (e específicos por tipo).
