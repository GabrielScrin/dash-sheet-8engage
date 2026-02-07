export type MetricFormat = 'number' | 'currency' | 'percentage' | 'decimal';

const BASE_METRIC_LABELS: Record<string, { label: string; format: MetricFormat }> = {
  sales: { label: 'Vendas', format: 'number' },
  investment: { label: 'Investimento', format: 'currency' },
  revenue: { label: 'Faturamento', format: 'currency' },
  roas: { label: 'ROAS', format: 'decimal' },
  conversion: { label: 'Taxa de Conversao', format: 'percentage' },
  spend: { label: 'Gasto', format: 'currency' },
  impressions: { label: 'Impressoes', format: 'number' },
  reach: { label: 'Alcance', format: 'number' },
  clicks: { label: 'Cliques', format: 'number' },
  leads: { label: 'Leads', format: 'number' },
  messages: { label: 'Mensagens', format: 'number' },
  purchases: { label: 'Compras', format: 'number' },
  purchase_value: { label: 'Valor de Compras', format: 'currency' },
  ctr: { label: 'CTR', format: 'percentage' },
  cpc: { label: 'CPC', format: 'currency' },
  cpm: { label: 'CPM', format: 'currency' },
  frequency: { label: 'Frequencia', format: 'decimal' },
  inline_link_clicks: { label: 'Cliques no Link', format: 'number' },
  landing_views: { label: 'Visualizacoes de Pagina', format: 'number' },
  checkout_views: { label: 'Inicio de Checkout', format: 'number' },
  video3s: { label: 'Views Video 3s', format: 'number' },
  video15s: { label: 'Views Video 15s', format: 'number' },
  thruplay: { label: 'Thruplay', format: 'number' },
  hook_rate: { label: 'Hook Rate', format: 'percentage' },
  hold_rate: { label: 'Hold Rate', format: 'percentage' },
  cpl: { label: 'CPL', format: 'currency' },
  cpa: { label: 'CPA', format: 'currency' },
};

const ACTION_LABELS: Record<string, string> = {
  lead: 'Lead',
  purchase: 'Compra',
  add_to_cart: 'Adicionar ao Carrinho',
  initiate_checkout: 'Iniciar Checkout',
  view_content: 'Visualizacao de Conteudo',
  search: 'Busca',
  subscribe: 'Assinatura',
  complete_registration: 'Cadastro Completo',
  contact: 'Contato',
  landing_page_view: 'Visualizacao de Pagina',
  messaging_conversation_started_7d: 'Conversa Iniciada (7d)',
  messaging_conversation_started_30d: 'Conversa Iniciada (30d)',
  messaging_conversation_started: 'Conversa Iniciada',
  'onsite_conversion.messaging_conversation_started_7d': 'Conversa Iniciada (Site 7d)',
  'onsite_conversion.messaging_conversation_started_30d': 'Conversa Iniciada (Site 30d)',
  omni_initiated_checkout: 'Checkout Iniciado',
  omni_purchase: 'Compra (Omni)',
  omni_lead: 'Lead (Omni)',
  whatsapp: 'WhatsApp',
};

const humanize = (value: string) => {
  return value
    .replace(/^offsite_conversion\.fb_pixel_/, '')
    .replace(/^onsite_conversion\./, '')
    .replace(/^omni_/, '')
    .replace(/[._]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getBaseMetricMeta = (metricKey: string) => {
  return BASE_METRIC_LABELS[metricKey] || { label: humanize(metricKey), format: 'number' as MetricFormat };
};

export const translateMetaActionType = (actionType: string) => {
  const normalized = actionType.toLowerCase();
  return ACTION_LABELS[normalized] || humanize(actionType);
};

export const getMetaMetricLabel = (metricKey: string) => {
  if (metricKey.startsWith('action:')) {
    return translateMetaActionType(metricKey.slice('action:'.length));
  }

  if (metricKey.startsWith('action_value:')) {
    const actionType = metricKey.slice('action_value:'.length);
    return `Valor - ${translateMetaActionType(actionType)}`;
  }

  return getBaseMetricMeta(metricKey).label;
};

export const getMetaMetricFormat = (metricKey: string): MetricFormat => {
  if (metricKey.startsWith('action_value:')) return 'currency';
  if (metricKey.startsWith('action:')) return 'number';
  return getBaseMetricMeta(metricKey).format;
};
