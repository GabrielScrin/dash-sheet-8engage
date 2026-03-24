export type MetricFormat = 'number' | 'currency' | 'percentage' | 'decimal' | 'link';

const BASE_METRIC_LABELS: Record<string, { label: string; format: MetricFormat }> = {
  sales: { label: 'Vendas', format: 'number' },
  investment: { label: 'Investimento', format: 'currency' },
  revenue: { label: 'Faturamento', format: 'currency' },
  roas: { label: 'ROAS', format: 'decimal' },
  roi: { label: 'ROI', format: 'percentage' },
  conversion: { label: 'Taxa de Conversao', format: 'percentage' },
  spend: { label: 'Gasto', format: 'currency' },
  impressions: { label: 'Impressoes', format: 'number' },
  reach: { label: 'Alcance', format: 'number' },
  clicks: { label: 'Cliques', format: 'number' },
  leads: { label: 'Leads', format: 'number' },
  messages: { label: 'Mensagens', format: 'number' },
  profile_visits: { label: 'Visitas ao Perfil', format: 'number' },
  instagram_follows: { label: 'Seguidores do Instagram', format: 'number' },
  result: { label: 'Resultado da Campanha', format: 'number' },
  purchases: { label: 'Compras', format: 'number' },
  purchase_value: { label: 'Valor de Compras', format: 'currency' },
  ctr: { label: 'CTR', format: 'percentage' },
  cpc: { label: 'CPC', format: 'currency' },
  cpm: { label: 'CPM', format: 'currency' },
  frequency: { label: 'Frequencia', format: 'decimal' },
  inline_link_clicks: { label: 'Cliques no Link', format: 'number' },
  post_engagement: { label: 'Engajamento com o Post', format: 'number' },
  landing_views: { label: 'Visualizacoes de Pagina', format: 'number' },
  checkout_views: { label: 'Inicio de Checkout', format: 'number' },
  video3s: { label: 'Views Video 3s', format: 'number' },
  video15s: { label: 'Views Video 15s', format: 'number' },
  thruplay: { label: 'Thruplay', format: 'number' },
  hook_rate: { label: 'Hook Rate', format: 'percentage' },
  hold_rate: { label: 'Hold Rate', format: 'percentage' },
  cpl: { label: 'CPL', format: 'currency' },
  cpa: { label: 'CPA', format: 'currency' },
  cost_per_profile_visit: { label: 'Custo por Visita ao Perfil', format: 'currency' },
  cost_per_message: { label: 'Custo por Mensagem', format: 'currency' },
  cost_per_lead: { label: 'Custo por Lead', format: 'currency' },
  cost_per_purchase: { label: 'Custo por Compra', format: 'currency' },
  cost_per_result: { label: 'Custo por Resultado', format: 'currency' },
  connect_rate: { label: 'Connect Rate', format: 'percentage' },
  cost_per_follower: { label: 'Custo por Seguidor', format: 'currency' },
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
  profile_visit: 'Visitas ao Perfil',
  instagram_profile_visit: 'Visitas ao Perfil (Instagram)',
  ig_profile_visit: 'Visitas ao Perfil (Instagram)',
  follow: 'Seguidores',
  instagram_follow: 'Seguidores do Instagram',
  ig_follow: 'Seguidores do Instagram',
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
  if (metricKey.startsWith('result_action:')) {
    return `Resultado - ${translateMetaActionType(metricKey.slice('result_action:'.length))}`;
  }

  if (metricKey.startsWith('action:')) {
    return translateMetaActionType(metricKey.slice('action:'.length));
  }

  if (metricKey.startsWith('action_value:')) {
    const actionType = metricKey.slice('action_value:'.length);
    return `Valor - ${translateMetaActionType(actionType)}`;
  }

  if (metricKey.startsWith('cost_per_action:')) {
    const actionType = metricKey.slice('cost_per_action:'.length);
    return `Custo por ${translateMetaActionType(actionType)}`;
  }

  if (metricKey.startsWith('rate_per_action:')) {
    const actionType = metricKey.slice('rate_per_action:'.length);
    return `Taxa de ${translateMetaActionType(actionType)}`;
  }

  return getBaseMetricMeta(metricKey).label;
};

export const getMetaMetricFormat = (metricKey: string): MetricFormat => {
  if (metricKey.startsWith('result_action:')) return 'number';
  if (metricKey.startsWith('cost_per_action:')) return 'currency';
  if (metricKey.startsWith('rate_per_action:')) return 'percentage';
  if (metricKey.startsWith('action_value:')) return 'currency';
  if (metricKey.startsWith('action:')) return 'number';
  return getBaseMetricMeta(metricKey).format;
};

const safeNumber = (value: unknown) => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
};

const getActionCount = (row: Record<string, unknown>, actionType: string) => {
  const map = (row.actions_agg_map || row.actions_map || {}) as Record<string, unknown>;
  return safeNumber(map[actionType]);
};

const getActionCountByMatcher = (row: Record<string, unknown>, matcher: (actionType: string) => boolean) => {
  const map = (row.actions_agg_map || row.actions_map || {}) as Record<string, unknown>;
  return Object.entries(map).reduce((sum, [actionType, value]) => {
    if (!matcher(actionType.toLowerCase())) return sum;
    return sum + safeNumber(value);
  }, 0);
};

const getActionValue = (row: Record<string, unknown>, actionType: string) => {
  const map = (row.action_values_agg_map || row.action_values_map || {}) as Record<string, unknown>;
  return safeNumber(map[actionType]);
};

const getMetricAliasValue = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = safeNumber(row[key]);
    if (value !== 0) return value;
  }
  return safeNumber(row[keys[0]]);
};

export const getMetaMetricValue = (rowInput: Record<string, unknown>, metricKey: string): number => {
  const row = rowInput || {};
  const impressions = getMetricAliasValue(row, ['impressions']);
  const reach = getMetricAliasValue(row, ['reach']);
  const clicks = getMetricAliasValue(row, ['clicks']);
  const spend = getMetricAliasValue(row, ['spend', 'investment']);
  const leads = getMetricAliasValue(row, ['leads']);
  const messages = getMetricAliasValue(row, ['messages']);
  const profileVisits = getMetricAliasValue(row, ['profile_visits']);
  const instagramFollows = getMetricAliasValue(row, ['instagram_follows']);
  const purchases = getMetricAliasValue(row, ['purchases']);
  const purchaseValue = getMetricAliasValue(row, ['purchase_value', 'revenue']);
  const landingViews = getMetricAliasValue(row, ['landing_views', 'landingViews']);
  const checkoutViews = getMetricAliasValue(row, ['checkout_views', 'checkoutViews']);
  const thruplay = getMetricAliasValue(row, ['thruplay']);
  const video3s = getMetricAliasValue(row, ['video3s']);
  const video15s = getMetricAliasValue(row, ['video15s']);
  const sales = purchases > 0 ? purchases : leads;
  const results = purchases > 0 ? purchases : (leads > 0 ? leads : (messages > 0 ? messages : profileVisits));
  const postEngagement = getMetricAliasValue(row, ['post_engagement']) || getActionCountByMatcher(
    row,
    (actionType) => actionType.includes('post_engagement') || actionType.includes('post_reaction'),
  );
  const profileVisitsFallback = getActionCountByMatcher(
    row,
    (actionType) =>
      actionType.includes('profile_visit') ||
      actionType.includes('instagram_profile_visit') ||
      actionType.includes('ig_profile_visit') ||
      actionType.includes('onsite_conversion.profile') ||
      actionType.includes('profile_view') ||
      actionType.includes('visit_profile') ||
      (actionType.includes('profile') && actionType.includes('visit')),
  );
  const resolvedVideoViews = thruplay || video3s;

  if (metricKey.startsWith('result_action:')) {
    return getActionCount(row, metricKey.slice('result_action:'.length));
  }

  if (metricKey.startsWith('action:')) {
    return getActionCount(row, metricKey.slice('action:'.length));
  }

  if (metricKey.startsWith('action_value:')) {
    return getActionValue(row, metricKey.slice('action_value:'.length));
  }

  if (metricKey.startsWith('cost_per_action:')) {
    const actionCount = getActionCount(row, metricKey.slice('cost_per_action:'.length));
    return actionCount > 0 ? spend / actionCount : 0;
  }

  if (metricKey.startsWith('rate_per_action:')) {
    const actionCount = getActionCount(row, metricKey.slice('rate_per_action:'.length));
    return clicks > 0 ? (actionCount / clicks) * 100 : 0;
  }

  switch (metricKey) {
    case 'investment':
    case 'spend':
      return spend;
    case 'sales':
      return sales;
    case 'result':
      return results;
    case 'profile_visits':
      return profileVisits || profileVisitsFallback || landingViews || getMetricAliasValue(row, ['inline_link_clicks']);
    case 'instagram_follows':
      return instagramFollows;
    case 'revenue':
    case 'purchase_value':
      return purchaseValue;
    case 'conversion':
      return clicks > 0 ? (sales / clicks) * 100 : 0;
    case 'ctr':
      return impressions > 0 ? (clicks / impressions) * 100 : safeNumber(row.ctr);
    case 'cpc':
      return clicks > 0 ? spend / clicks : safeNumber(row.cpc);
    case 'cpm':
      return impressions > 0 ? (spend / impressions) * 1000 : safeNumber(row.cpm);
    case 'frequency':
      return reach > 0 ? impressions / reach : safeNumber(row.frequency);
    case 'roas':
      return spend > 0 ? purchaseValue / spend : safeNumber(row.roas);
    case 'roi':
      return spend > 0 ? ((purchaseValue - spend) / spend) * 100 : 0;
    case 'cpl':
      return leads > 0 ? spend / leads : safeNumber(row.cpl);
    case 'cpa':
      return purchases > 0 ? spend / purchases : safeNumber(row.cpa);
    case 'cost_per_profile_visit':
      return profileVisits > 0 ? spend / profileVisits : 0;
    case 'cost_per_message':
      return messages > 0 ? spend / messages : 0;
    case 'cost_per_lead':
      return leads > 0 ? spend / leads : 0;
    case 'cost_per_purchase':
      return purchases > 0 ? spend / purchases : 0;
    case 'cost_per_result':
      return results > 0 ? spend / results : 0;
    case 'connect_rate':
      return impressions > 0 ? (landingViews / impressions) * 100 : 0;
    case 'cost_per_follower':
      return instagramFollows > 0 ? spend / instagramFollows : 0;
    case 'post_engagement':
      return postEngagement;
    case 'video_views':
      return resolvedVideoViews;
    case 'hook_rate':
      return impressions > 0 ? (video3s / impressions) * 100 : safeNumber(row.hook_rate);
    case 'hold_rate':
      return impressions > 0 ? ((video15s || thruplay) / impressions) * 100 : safeNumber(row.hold_rate);
    case 'landing_views':
      return landingViews;
    case 'checkout_views':
      return checkoutViews;
    default:
      {
        const normalizedKey = metricKey
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        const hasDirectValue =
          Object.prototype.hasOwnProperty.call(row, metricKey) &&
          String((row as Record<string, unknown>)[metricKey] ?? '').trim().length > 0;
        if (hasDirectValue) {
          return safeNumber(row[metricKey]);
        }
        if (normalizedKey.includes('roas')) {
          return spend > 0 ? purchaseValue / spend : safeNumber(row.roas);
        }
      }
      return safeNumber(row[metricKey]);
  }
};
