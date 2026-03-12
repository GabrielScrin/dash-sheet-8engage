import * as React from 'react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BigNumberCard } from '@/components/dashboard/BigNumberCard';
import { WeeklyComparisonTable } from '@/components/dashboard/WeeklyComparisonTable';
import { CreativePerformanceTable } from '@/components/dashboard/CreativePerformanceTable';
import { FunnelVisualization } from '@/components/dashboard/FunnelVisualization';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { useColumnMappings } from '@/hooks/useColumnMappings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { processDashboardData } from '@/lib/dashboard-utils';
import { getMetaMetricFormat, getMetaMetricLabel, getMetaMetricValue } from '@/lib/meta-metric-labels';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { useAuth } from '@/contexts/AuthContext';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

// Helper to safely type source_config from Json
interface MetaSourceConfig {
  ad_account_id?: string;
  sheet_perpetua?: string | null;
  sheet_distribuicao?: string | null;
  sheet_consideracao?: string | null;
  [key: string]: unknown;
}

function getSourceConfig(config: unknown): MetaSourceConfig | null {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return config as MetaSourceConfig;
  }
  return null;
}

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const findColumnKey = (rows: Array<Record<string, unknown>>, candidates: string[]) => {
  if (!rows.length) return null;
  const normalizedCandidates = candidates.map(normalizeKey).filter(Boolean);
  const candidateSet = new Set(normalizedCandidates);
  const sampleKeys = Object.keys(rows[0] || {});

  // Prefer exact normalized matches first.
  for (const key of sampleKeys) {
    if (candidateSet.has(normalizeKey(key))) return key;
  }

  // Then allow robust partial match for headers like "Spend (Cost, Amount Spent)".
  for (const key of sampleKeys) {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) continue;
    if (normalizedCandidates.some((candidate) => normalizedKey.includes(candidate) || candidate.includes(normalizedKey))) {
      return key;
    }
  }
  return null;
};

const parseSheetNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[R$\s%]/g, '');
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, ''))
    : cleaned.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseSheetDateValue = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const br = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const iso = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const getInstagramThumbnailFromLink = (value: string | undefined) => {
  const link = String(value || '').trim();
  if (!link) return '';
  try {
    const url = new URL(link);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && (parts[0] === 'p' || parts[0] === 'reel' || parts[0] === 'tv')) {
      const shortcode = parts[1];
      return `https://www.instagram.com/${parts[0]}/${shortcode}/media/?size=t`;
    }
  } catch {
    // noop
  }
  return '';
};

const getPeriodKeysFromDateRange = (dateRange: DateRange | undefined, viewMode: 'day' | 'week' | 'month') => {
  if (!dateRange?.from) return [];

  const start = new Date(dateRange.from);
  const end = new Date(dateRange.to || new Date());
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;

  if (viewMode === 'day') {
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((day) => format(day, 'yyyy-MM-dd'));
  }

  if (viewMode === 'month') {
    return eachMonthOfInterval({
      start: startOfMonth(rangeStart),
      end: startOfMonth(rangeEnd),
    }).map((month) => format(month, 'yyyy-MM'));
  }

  return eachWeekOfInterval(
    {
      start: startOfWeek(rangeStart, { weekStartsOn: 0 }),
      end: startOfWeek(rangeEnd, { weekStartsOn: 0 }),
    },
    { weekStartsOn: 0 }
  ).map((week) => format(week, 'yyyy-MM-dd'));
};

type SheetMetricFormat = 'number' | 'currency' | 'percentage' | 'decimal' | 'link';
const SHEET_DERIVED_REVENUE_KEY = '__derived_revenue';
const SHEET_DERIVED_CPA_KEY = '__derived_cpa';
const SHEET_DERIVED_PURCHASES_KEY = '__derived_purchases';
const SHEET_DERIVED_PURCHASES_LAST_CLICK_KEY = '__derived_purchases_last_click';
const SHEET_DERIVED_CPA_LAST_CLICK_KEY = '__derived_cpa_last_click';
const SHEET_DERIVED_ROAS_LAST_CLICK_KEY = '__derived_roas_last_click';

const normalizeMetricName = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const capitalizePtBr = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (['de', 'da', 'do', 'das', 'dos', 'por', 'para', 'com', 'sem', 'em', 'no', 'na', 'nos', 'nas', 'e'].includes(lower)) {
        return lower;
      }
      if (['cpc', 'cpm', 'ctr', 'cpl', 'cpa', 'roas', 'roi', 'lp', 'id'].includes(lower)) {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');

const humanizeSheetMetricPtBr = (columnName: string) => {
  const normalized = normalizeMetricName(columnName);
  if (!normalized) return columnName;

  const base = normalized
    .replace(/\bcost per\b/g, 'custo por')
    .replace(/\bper\b/g, 'por')
    .replace(/\brate\b/g, 'taxa')
    .replace(/\bfrequency\b/g, 'frequencia')
    .replace(/\breach\b/g, 'alcance')
    .replace(/\bimpressions\b/g, 'impressoes')
    .replace(/\bclicks?\b/g, 'cliques')
    .replace(/\bleads?\b/g, 'leads')
    .replace(/\bmessages?\b/g, 'mensagens')
    .replace(/\bmessage conversations started\b/g, 'conversas iniciadas')
    .replace(/\bprofile visits?\b/g, 'visitas ao perfil')
    .replace(/\bpost engagement\b/g, 'engajamento com o post')
    .replace(/\binline link clicks?\b/g, 'cliques no link')
    .replace(/\blanding page views?\b/g, 'visualizacoes da pagina de destino')
    .replace(/\bview content\b/g, 'visualizacao de conteudo')
    .replace(/\bcheckout initiated\b/g, 'inicio de checkout')
    .replace(/\bpurchases?\b/g, 'compras')
    .replace(/\brevenue\b/g, 'faturamento')
    .replace(/\bspend\b/g, 'investimento')
    .replace(/\bresults?\b/g, 'resultado')
    .replace(/\bvideo views?\b/g, 'visualizacoes de video')
    .replace(/\bthruplay\b/g, 'thruplay')
    .replace(/\bhook rate\b/g, 'hook rate')
    .replace(/\bhold rate\b/g, 'hold rate');

  const withAccents = base
    .replace(/\bfrequencia\b/g, 'frequência')
    .replace(/\bimpressoes\b/g, 'impressões')
    .replace(/\bvisualizacoes\b/g, 'visualizações')
    .replace(/\bpagina\b/g, 'página')
    .replace(/\bconteudo\b/g, 'conteúdo')
    .replace(/\bconversao\b/g, 'conversão');

  return capitalizePtBr(withAccents);
};

const SHEET_METRIC_NAME_MAP: Array<{ pattern: RegExp; label: string; format: SheetMetricFormat }> = [
  { pattern: /\bfrequency\b|\bfrequencia\b/, label: 'Frequência', format: 'percentage' },
  { pattern: /\bcpc\b|cost per click|custo por clique/, label: 'CPC (Custo por Clique)', format: 'currency' },
  { pattern: /\bcpm\b|cost per mille|custo por mil/, label: 'CPM (Custo por Mil Impressões)', format: 'currency' },
  { pattern: /\bctr\b|click through rate|taxa de clique/, label: 'CTR (Taxa de Cliques)', format: 'percentage' },
  { pattern: /\broas real\b|\broas\b/, label: 'ROAS', format: 'decimal' },
  { pattern: /\broi\b/, label: 'ROI', format: 'percentage' },
  { pattern: /\bspend\b|\binvestment\b|\binvestimento\b|\bgasto\b/, label: 'Investimento', format: 'currency' },
  { pattern: /\brevenue\b|\bfaturamento\b|\bfaturameto\b|\bvalor vendido\b|\bsales value\b/, label: 'Faturamento', format: 'currency' },
  { pattern: /\bimpressions\b|\bimpressoes\b/, label: 'Impressões', format: 'number' },
  { pattern: /\breach\b|\balcance\b/, label: 'Alcance', format: 'number' },
  { pattern: /\bclicks\b|\bcliques\b/, label: 'Cliques', format: 'number' },
  { pattern: /\bmessages\b|\bmensagens\b/, label: 'Mensagens', format: 'number' },
  { pattern: /\bleads?\b/, label: 'Leads', format: 'number' },
  { pattern: /\bprofile visits?\b|\bvisitas ao perfil\b/, label: 'Visitas ao Perfil', format: 'number' },
  { pattern: /\bpost engagement\b|\bengajamento\b/, label: 'Engajamento com o Post', format: 'number' },
  { pattern: /cost per result|custo por resultado/, label: 'Custo por Resultado', format: 'currency' },
  { pattern: /cost per lead|custo por lead/, label: 'Custo por Lead', format: 'currency' },
  { pattern: /cost per message|custo por mensagem/, label: 'Custo por Mensagem', format: 'currency' },
  { pattern: /\bcpa\b|cost per purchase|custo por compra|custo pro compra|custo por venda/, label: 'Custo por Compra', format: 'currency' },
  { pattern: /cost per profile visit|custo por visita ao perfil/, label: 'Custo por Visita ao Perfil', format: 'currency' },
  { pattern: /\bresult\b|\bresultado\b/, label: 'Resultado da Campanha', format: 'number' },
  { pattern: /\broas real\b|\bwebsite purchase roas\b|\broas\b/, label: 'ROAS', format: 'decimal' },
  { pattern: /\bpurchase value\b|valor de compra|valor de compras/, label: 'Valor de Compras', format: 'currency' },
  { pattern: /\binline link clicks?\b|\baction link clicks?\b|cliques no link/, label: 'Cliques no Link', format: 'number' },
  { pattern: /\blanding page views?\b|\baction landing page view\b|lp views?|visualizacoes da pagina/, label: 'Visualizações da Página', format: 'number' },
  { pattern: /\baction omni initiated checkout\b|\binitiate checkout\b|\bcheckout\b|inicio de checkout/, label: 'Início de Checkout', format: 'number' },

  { pattern: /\baction 3s video views?\b|\bvideo 3s views?\b|\bvideo3s\b/, label: 'Visualizacoes de Video 3s', format: 'number' },
  { pattern: /\bvideo thruplay watched actions?\b|\bthruplay\b/, label: 'Thruplay', format: 'number' },
  { pattern: /\bvideo views?\b|visualizacoes de video/, label: 'Visualizacoes de Video', format: 'number' },
  { pattern: /\bhook rate\b|\bhook\b/, label: 'Hook Rate', format: 'percentage' },
  { pattern: /\bhold rate\b|\bhold\b/, label: 'Hold Rate', format: 'percentage' },
  { pattern: /\bconnect rate\b/, label: 'Connect Rate', format: 'percentage' },
  { pattern: /\baction omni purchase\b|\bpurchases?\b|\bvendas?\b/, label: 'Compras', format: 'number' },
  { pattern: /\bcustom action\b.*\b(compra|purchase)\b/, label: 'Compras', format: 'number' },
  { pattern: /\bcompras?\s+last\s+click\b|\bpurchases?\s+last\s+click\b|\blast\s+click\s+purchases?\b/, label: 'Compras Last Click', format: 'number' },
  { pattern: /\bcpa\s+last\s+click\b|cost per purchase last click|custo por compra last click/, label: 'CPA Last Click', format: 'currency' },
  { pattern: /\broas\s+last\s+click\b/, label: 'ROAS Last Click', format: 'decimal' },
  { pattern: /\bfollows?\b|seguidores?/, label: 'Seguidores', format: 'number' },
  { pattern: /\bview content\b|visualizacao de conteudo/, label: 'Visualização de Conteúdo', format: 'number' },
  { pattern: /\badd to cart\b|adicao ao carrinho/, label: 'Adições ao Carrinho', format: 'number' },
  { pattern: /\binitiate checkout\b|inicio de checkout/, label: 'Início de Checkout', format: 'number' },
  { pattern: /\blead form\b|cadastro/, label: 'Leads do Formulário', format: 'number' },
];

const looksLikeTextMetricName = (columnName: string) => {
  const name = normalizeMetricName(columnName);
  return /\b(name|nome|campaign|campanha|adset|ad set|adname|ad name|anuncio|criativo|creative|titulo|title|url|link|permalink|thumbnail|thumb|image|imagem)\b/.test(name);
};

const looksLikeUrl = (value: unknown) => /^https?:\/\//i.test(String(value ?? '').trim());

const pickFirstMatchingKey = (keys: string[], patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const found = keys.find((key) => pattern.test(normalizeMetricName(key)));
    if (found) return found;
  }
  return undefined;
};

const isCustomActionMetric = (key: string) => /\bcustom action\b/.test(normalizeMetricName(key));
const isCustomPurchaseActionMetric = (key: string) => {
  const normalized = normalizeMetricName(key);
  return /\bcustom action\b/.test(normalized) && /\b(compra|purchase)\b/.test(normalized);
};
const sumMetricValues = (rows: Array<Record<string, unknown>>, key: string) =>
  rows.reduce((sum, row) => sum + parseSheetNumber(row?.[key]), 0);

const inferSheetMetricMeta = (columnName: string, sampleValues: unknown[]): { label: string; format: SheetMetricFormat } => {
  const normalized = normalizeMetricName(columnName);
  const mapped = SHEET_METRIC_NAME_MAP.find((entry) => entry.pattern.test(normalized));
  if (mapped) return { label: mapped.label, format: mapped.format };

  const numericValues = sampleValues
    .map((value) => parseSheetNumber(value))
    .filter((value) => Number.isFinite(value) && value !== 0);

  const looksLikePercentByName = /\b(rate|taxa|percent|porcentagem)\b/.test(normalized);
  if (looksLikePercentByName) return { label: columnName, format: 'percentage' };

  const looksLikeCurrencyByName =
    /\b(cost|custo|spend|invest|investimento|gasto|revenue|faturamento|valor|amount|price|preco)\b/.test(normalized);
  if (looksLikeCurrencyByName) return { label: columnName, format: 'currency' };

  const hasDecimals = numericValues.some((value) => Math.abs(value % 1) > 0.0001);
  if (hasDecimals) return { label: humanizeSheetMetricPtBr(columnName), format: 'decimal' };

  return { label: humanizeSheetMetricPtBr(columnName), format: 'number' };
};

interface DashboardViewProps {
  projectId: string;
  isPreview?: boolean;
  shareToken?: string;
  initialProject?: any;
  initialMappings?: any[];
}

export function DashboardView({ projectId, isPreview = false, shareToken, initialProject, initialMappings }: DashboardViewProps) {
  const { signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState('perpetua');
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [weeklyMetricColumns, setWeeklyMetricColumns] = useState<string[]>(['result', 'impressions', 'reach', 'cpc', 'ctr']);
  const [creativeMetricColumns, setCreativeMetricColumns] = useState<string[]>(['post_engagement', 'hook_rate', 'hold_rate', 'cpc', 'cost_per_result']);
  const [metaChartMetricColumns, setMetaChartMetricColumns] = useState<string[]>(['investment', 'impressions', 'clicks', 'result']);
  const [sheetBigNumberColumns, setSheetBigNumberColumns] = useState<string[]>([]);
  const [sheetWeeklyMetricColumns, setSheetWeeklyMetricColumns] = useState<string[]>([]);
  const [sheetCreativeMetricColumns, setSheetCreativeMetricColumns] = useState<string[]>([]);
  const [sheetChartMetricColumns, setSheetChartMetricColumns] = useState<string[]>([]);
  const [distributionCreativeMetricColumns, setDistributionCreativeMetricColumns] = useState<string[]>([
    'investment',
    'impressions',
    'clicks',
    'ctr',
    'cpc',
  ]);
  const [funnelType, setFunnelType] = useState<'captacao' | 'mensagem' | 'conversao'>('captacao');
  const [distributionPhase, setDistributionPhase] = useState<'all' | 'descoberta' | 'consideracao'>('all');
  const [googleReconnectRequired, setGoogleReconnectRequired] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const invokeEdge = async (path: string, body?: Record<string, unknown>) => {
    const headers: Record<string, string> = {};
    if (shareToken) headers['x-share-token'] = shareToken;
    const { data, error } = await supabase.functions.invoke(path, { body, headers });
    if (error) throw error;
    return data;
  };
  const invokeMeta = async (path: string, body?: Record<string, unknown>) => invokeEdge(path, body);
  const invokePaymentAttribution = async (path: string, body?: Record<string, unknown>) => invokeEdge(path, body);

  // 1. Fetch Project Details
  const { data: projectData, isLoading: loadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      // If we have a shareToken, we might need a public endpoint or bypass RLS
      // For now, let's assume the user has access or we use the supabase service role indirectly
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && !initialProject,
  });
  const project = (initialProject ?? projectData) as any;

  // 2. Fetch Column Mappings
  const { mappings, isLoading: loadingMappings } = useColumnMappings(projectId);
  const resolvedMappings = (shareToken && initialMappings) ? initialMappings : mappings;

  const sourceConfig = getSourceConfig(project?.source_config);
  const adAccountId = sourceConfig?.ad_account_id;
  const weeklyColumnsStorageKey = `meta-weekly-columns:${projectId}`;
  const creativeColumnsStorageKey = `meta-creative-columns:${projectId}`;
  const metaChartColumnsStorageKey = `meta-chart-columns:${projectId}`;
  const sheetBigNumbersStorageKey = `sheet-big-numbers:${projectId}`;
  const sheetWeeklyStorageKey = `sheet-weekly-columns:${projectId}`;
  const sheetCreativeStorageKey = `sheet-creative-columns:${projectId}`;
  const sheetChartStorageKey = `sheet-chart-columns:${projectId}`;

  React.useEffect(() => {
    if (project?.source_type !== 'meta_ads') return;
    try {
      const raw = window.localStorage.getItem(weeklyColumnsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.map((value: unknown) => String(value)).filter(Boolean);
      if (normalized.length > 0) {
        setWeeklyMetricColumns((prev) => (prev.join('|') === normalized.join('|') ? prev : normalized));
      }
    } catch {
      // noop
    }
  }, [project?.source_type, weeklyColumnsStorageKey]);

  React.useEffect(() => {
    if (project?.source_type !== 'meta_ads') return;
    try {
      window.localStorage.setItem(weeklyColumnsStorageKey, JSON.stringify(weeklyMetricColumns));
    } catch {
      // noop
    }
  }, [project?.source_type, weeklyColumnsStorageKey, weeklyMetricColumns]);

  React.useEffect(() => {
    if (project?.source_type !== 'meta_ads') return;
    try {
      const raw = window.localStorage.getItem(creativeColumnsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.map((value: unknown) => String(value)).filter(Boolean);
      if (normalized.length > 0) {
        setCreativeMetricColumns((prev) => (prev.join('|') === normalized.join('|') ? prev : normalized));
      }
    } catch {
      // noop
    }
  }, [creativeColumnsStorageKey, project?.source_type]);

  React.useEffect(() => {
    if (project?.source_type !== 'meta_ads') return;
    try {
      window.localStorage.setItem(creativeColumnsStorageKey, JSON.stringify(creativeMetricColumns));
    } catch {
      // noop
    }
  }, [creativeColumnsStorageKey, creativeMetricColumns, project?.source_type]);

  React.useEffect(() => {
    if (project?.source_type !== 'meta_ads') return;
    try {
      const raw = window.localStorage.getItem(metaChartColumnsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.map((value: unknown) => String(value)).filter(Boolean);
      if (normalized.length > 0) {
        setMetaChartMetricColumns((prev) => (prev.join('|') === normalized.join('|') ? prev : normalized));
      }
    } catch {
      // noop
    }
  }, [metaChartColumnsStorageKey, project?.source_type]);

  React.useEffect(() => {
    if (project?.source_type !== 'meta_ads') return;
    try {
      window.localStorage.setItem(metaChartColumnsStorageKey, JSON.stringify(metaChartMetricColumns));
    } catch {
      // noop
    }
  }, [metaChartColumnsStorageKey, metaChartMetricColumns, project?.source_type]);

  React.useEffect(() => {
    if (project?.source_type === 'meta_ads') return;
    try {
      window.localStorage.setItem(sheetBigNumbersStorageKey, JSON.stringify(sheetBigNumberColumns));
      window.localStorage.setItem(sheetWeeklyStorageKey, JSON.stringify(sheetWeeklyMetricColumns));
      window.localStorage.setItem(sheetCreativeStorageKey, JSON.stringify(sheetCreativeMetricColumns));
      window.localStorage.setItem(sheetChartStorageKey, JSON.stringify(sheetChartMetricColumns));
    } catch {
      // noop
    }
  }, [
    project?.source_type,
    sheetBigNumberColumns,
    sheetBigNumbersStorageKey,
    sheetCreativeMetricColumns,
    sheetCreativeStorageKey,
    sheetChartMetricColumns,
    sheetChartStorageKey,
    sheetWeeklyMetricColumns,
    sheetWeeklyStorageKey,
  ]);

  const metaAccountInsightsQuery = useQuery({
    queryKey: [
      'meta-account-insights',
      adAccountId,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
    ],
    queryFn: async () => {
      if (!adAccountId) return [];

      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');

      const data = await invokeMeta(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=account`
      );

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const metaAccountTotalsQuery = useQuery({
    queryKey: [
      'meta-account-totals',
      adAccountId,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
    ],
    queryFn: async () => {
      if (!adAccountId) return [];

      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');

      const data = await invokeMeta(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=account&timeIncrement=all`
      );

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const metaInsightsQuery = useQuery({
    queryKey: [
      'meta-insights',
      adAccountId,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
    ],
    queryFn: async () => {
      if (!adAccountId) return [];

      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');

      const data = await invokeMeta(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=campaign`
      );

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const metaCampaignTotalsQuery = useQuery({
    queryKey: [
      'meta-campaign-totals',
      adAccountId,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
    ],
    queryFn: async () => {
      if (!adAccountId) return [];

      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');

      const data = await invokeMeta(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=campaign&timeIncrement=all`
      );

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const metaAdsQuery = useQuery({
    queryKey: [
      'meta-ads-insights',
      adAccountId,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
    ],
    queryFn: async () => {
      if (!adAccountId) return [];

      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');

      const data = await invokeMeta(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=ad`
      );

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const metaPlatformBreakdownQuery = useQuery({
    queryKey: [
      'meta-platform-breakdown',
      adAccountId,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
      selectedCampaignIds.slice().sort().join(','),
    ],
    queryFn: async () => {
      if (!adAccountId) return [];

      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');

      // Note: breakdowns are only used for the "Distribuição de Conteúdos" tab.
      // We query account-level breakdowns and optionally filter by campaign on the client (campaign-level breakdowns can explode).
      const data = await invokeMeta(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=account&timeIncrement=all&breakdowns=publisher_platform`
      );

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const metaCampaignsQuery = useQuery({
    queryKey: ['meta-campaigns', adAccountId],
    queryFn: async () => {
      if (!adAccountId) return [];

      let data: any;
      try {
        data = await invokeMeta(`meta-api?action=campaigns&accountId=${encodeURIComponent(adAccountId)}`);
      } catch (error: any) {
        const message = String((error as any)?.message || '');
        // Backwards compatibility: older deployed edge function versions don't support action=campaigns yet.
        if (message.toLowerCase().includes('invalid action')) return [];
        throw error;
      }

      return (data?.campaigns || []) as Array<{ id: string; name: string; effective_status?: string; status?: string }>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const metaMetricsCatalogQuery = useQuery({
    queryKey: ['meta-metrics-catalog', adAccountId],
    queryFn: async () => {
      if (!adAccountId) return { actions: [], action_values: [] };
      try {
        const data = await invokeMeta(
          `meta-api?action=metrics-catalog&accountId=${encodeURIComponent(adAccountId)}`
        );
        const catalog = data?.catalog || {};
        return {
          actions: Array.isArray(catalog.actions) ? catalog.actions : [],
          action_values: Array.isArray(catalog.action_values) ? catalog.action_values : [],
        } as { actions: string[]; action_values: string[] };
      } catch {
        return { actions: [], action_values: [] };
      }
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId,
  });

  const paymentAttributionSummaryQuery = useQuery({
    queryKey: [
      'payment-attribution-summary',
      projectId,
      dateRange?.from ? dateRange.from.toISOString() : null,
      dateRange?.to ? dateRange.to.toISOString() : null,
      selectedCampaignIds.slice().sort().join(','),
    ],
    queryFn: async () => {
      if (project?.source_type !== 'meta_ads' || !projectId) return null;
      const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(dateRange?.to || new Date(), 'yyyy-MM-dd');
      const campaignIdsParam = selectedCampaignIds.length > 0
        ? `&campaignIds=${encodeURIComponent(selectedCampaignIds.join(','))}`
        : '';
      try {
        return await invokePaymentAttribution(
          `payment-attribution?action=attribution-summary&projectId=${encodeURIComponent(projectId)}&startDate=${startDate}&endDate=${endDate}${campaignIdsParam}`
        );
      } catch {
        return null;
      }
    },
    enabled: project?.source_type === 'meta_ads' && !!projectId,
  });

  // 3. Fetch Sheet Data from all configured sheets
  const sheetPerpetuaName =
    String(sourceConfig?.sheet_perpetua || '') ||
    (Array.isArray(project?.sheet_names) ? String((project?.sheet_names as string[])[0] || '') : String(project?.sheet_name || ''));
  const sheetDistribuicaoName =
    String(sourceConfig?.sheet_distribuicao || '') ||
    (Array.isArray(project?.sheet_names) ? String((project?.sheet_names as string[])[1] || (project?.sheet_names as string[])[0] || '') : String(project?.sheet_name || ''));
  const sheetConsideracaoName =
    String(sourceConfig?.sheet_consideracao || '') ||
    (Array.isArray(project?.sheet_names)
      ? String((project?.sheet_names as string[])[2] || (project?.sheet_names as string[])[1] || (project?.sheet_names as string[])[0] || '')
      : String(project?.sheet_name || ''));

  const sheetNames: string[] = Array.from(new Set([sheetPerpetuaName, sheetDistribuicaoName, sheetConsideracaoName].filter(Boolean)));

  // We'll use a custom query to fetch all sheets in parallel
  const allSheetsQuery = useQuery({
    queryKey: ['all-sheets-data', project?.spreadsheet_id, sheetNames, shareToken],
    queryFn: async () => {
      const results = await Promise.all(
        sheetNames.map(async (name: string) => {
          try {
            const range = `'${name}'!A:ZZ`;
            const { data: sessionData } = await supabase.auth.getSession();
            const providerToken = sessionData.session?.provider_token;

            const invokeHeaders: Record<string, string> = {};
            if (providerToken) invokeHeaders['x-google-token'] = providerToken;
            if (shareToken) invokeHeaders['x-share-token'] = shareToken;

            console.log(`Fetching sheet: ${name}, Range: ${range}`);
            const { data, error } = await supabase.functions.invoke('google-sheets', {
              body: {
                action: 'read-data',
                spreadsheetId: project?.spreadsheet_id,
                range
              },
              headers: invokeHeaders,
            });

            if (error) {
              console.error(`Error fetching sheet ${name}:`, error);
              // Check for Google reconnect error
              const errorBody = error.message || '';
              if (errorBody.includes('GOOGLE_RECONNECT_REQUIRED')) {
                setGoogleReconnectRequired(true);
              }
              return [];
            }

            // Basic row transformation (similar to useSheetData)
            const rows = data.values || [];
            console.log(`Sheet ${name} returned ${rows.length} rows`);

            if (rows.length < 2) return [];
            const headers = rows[0] as string[];
            return rows.slice(1).map((row: any[]) => {
              const obj: Record<string, any> = {};
              headers.forEach((h, i) => { obj[h] = row[i] || ''; });
              return obj;
            });
          } catch (err: any) {
            console.error(`Unexpected error fetching sheet ${name}:`, err);
            // Check for Google reconnect error in catch
            if (err?.message?.includes('GOOGLE_RECONNECT_REQUIRED') || 
                err?.context?.body?.includes('GOOGLE_RECONNECT_REQUIRED')) {
              setGoogleReconnectRequired(true);
            }
            return [];
          }
        })
      );
      const bySheet = sheetNames.reduce((acc, name, index) => {
        acc[name] = results[index] || [];
        return acc;
      }, {} as Record<string, any[]>);

      const flattened = results.flat();
      console.log(`Total rows aggregated: ${flattened.length}`);
      return { bySheet, all: flattened };
    },
    enabled: !!project?.spreadsheet_id && sheetNames.length > 0,
  });

  const sheetRowsByName = (allSheetsQuery.data as any)?.bySheet || {};
  const sourceRows =
    (project?.source_type === 'meta_ads'
      ? (metaInsightsQuery.data || [])
      : (sheetRowsByName[sheetPerpetuaName] || (allSheetsQuery.data as any)?.all || [])) as any[];
  const discoverySourceRows =
    (project?.source_type === 'meta_ads'
      ? []
      : (sheetRowsByName[sheetDistribuicaoName] || sheetRowsByName[sheetPerpetuaName] || (allSheetsQuery.data as any)?.all || [])) as any[];
  const considerationSourceRows =
    (project?.source_type === 'meta_ads'
      ? []
      : (sheetRowsByName[sheetConsideracaoName] || sheetRowsByName[sheetDistribuicaoName] || sheetRowsByName[sheetPerpetuaName] || (allSheetsQuery.data as any)?.all || [])) as any[];
  const distributionSourceRows =
    (activeTab === 'consideracao' ? considerationSourceRows : discoverySourceRows) as any[];
  const metaAccountRows = (metaAccountInsightsQuery.data || []) as any[];

  const sheetDateColumnKey = useMemo(
    () => findColumnKey(sourceRows as Array<Record<string, unknown>>, ['date', 'data', 'day', 'dia']),
    [sourceRows],
  );
  const sheetAdNameColumnKey = useMemo(
    () => findColumnKey(sourceRows as Array<Record<string, unknown>>, ['adname', 'ad name', 'nome do anuncio', 'anuncio']),
    [sourceRows],
  );
  const sheetAdsetNameColumnKey = useMemo(
    () => findColumnKey(sourceRows as Array<Record<string, unknown>>, ['adset name', 'adset', 'nome do conjunto', 'conjunto']),
    [sourceRows],
  );
  const sheetCampaignColumnKey = useMemo(
    () => findColumnKey(sourceRows as Array<Record<string, unknown>>, ['campaign name', 'campaign', 'nome da campanha', 'campanha']),
    [sourceRows],
  );
  const sheetAdsetFilterColumnKey = useMemo(
    () =>
      findColumnKey(sourceRows as Array<Record<string, unknown>>, [
        'adset name',
        'adset',
        'nome do conjunto',
        'conjunto',
      ]),
    [sourceRows],
  );
  const sheetPermalinkColumnKey = useMemo(
    () =>
      findColumnKey(sourceRows as Array<Record<string, unknown>>, [
        'instagram permalink url',
        'instagram_permalink_url',
        'permalink',
        'post url',
        'url',
        'link',
      ]),
    [sourceRows],
  );
  const sheetThumbnailColumnKey = useMemo(
    () =>
      findColumnKey(sourceRows as Array<Record<string, unknown>>, [
        'thumbnail',
        'thumb',
        'image',
        'image url',
        'image_url',
        'creative thumbnail',
      ]),
    [sourceRows],
  );

  const distributionDateColumnKey = useMemo(
    () => findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, ['date', 'data', 'day', 'dia']),
    [distributionSourceRows],
  );
  const distributionCampaignColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'campaign name',
        'campaign',
        'nome da campanha',
        'campanha',
      ]),
    [distributionSourceRows],
  );
  const distributionAdsetFilterColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'adset name',
        'adset',
        'nome do conjunto',
        'conjunto',
      ]),
    [distributionSourceRows],
  );
  const distributionReachColumnKey = useMemo(
    () => findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, ['reach', 'alcance']),
    [distributionSourceRows],
  );
  const distributionImpressionsColumnKey = useMemo(
    () => findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, ['impressions', 'impressoes']),
    [distributionSourceRows],
  );
  const distributionFrequencyColumnKey = useMemo(
    () => findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, ['frequency', 'frequencia']),
    [distributionSourceRows],
  );
  const distributionEngagementColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'engagement',
        'post engagement',
        'engajamento',
        'taxa de engajamento',
      ]),
    [distributionSourceRows],
  );
  const distributionVideoViewsColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'video views',
        'video_view',
        'views',
        'visualizacoes de video',
        'visualizacoes',
        'thruplay',
      ]),
    [distributionSourceRows],
  );
  const distributionVideo3sColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'action 3s video views',
        'video 3s views',
        'video3s',
      ]),
    [distributionSourceRows],
  );
  const distributionThruplayColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'video thruplay watched actions',
        'thruplay',
        'video thruplay',
      ]),
    [distributionSourceRows],
  );
  const distributionFollowersColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'followers',
        'follows',
        'instagram follows',
        'seguidores',
      ]),
    [distributionSourceRows],
  );
  const distributionPlatformColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'platform',
        'plataforma',
        'publisher_platform',
      ]),
    [distributionSourceRows],
  );
  const distributionPermalinkColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'instagram permalink url',
        'instagram_permalink_url',
        'permalink',
        'post url',
        'url',
        'link',
      ]),
    [distributionSourceRows],
  );
  const distributionThumbnailColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'thumbnail',
        'thumb',
        'image',
        'image url',
        'image_url',
        'creative thumbnail',
      ]),
    [distributionSourceRows],
  );
  const distributionAdNameColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'ad name',
        'adname',
        'nome do anuncio',
        'anuncio',
        'creative name',
        'criativo',
      ]),
    [distributionSourceRows],
  );
  const distributionSpendColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'spend',
        'amount spent',
        'cost',
        'investimento',
        'valor investido',
      ]),
    [distributionSourceRows],
  );
  const distributionProfileVisitsColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'profile visits',
        'instagram profile visits',
        'action profile visit',
        'visitas ao perfil',
      ]),
    [distributionSourceRows],
  );
  const distributionCheckoutColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'action omni initiated checkout',
        'initiate checkout',
        'checkout',
        'inicio de checkout',
      ]),
    [distributionSourceRows],
  );
  const distributionPurchasesColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'action omni purchase',
        'website purchases',
        'purchase',
        'purchases',
        'vendas',
        'compras',
      ]),
    [distributionSourceRows],
  );
  const distributionRoasColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'roas real',
        'website purchase roas',
        'purchase roas',
        'roas',
      ]),
    [distributionSourceRows],
  );
  const distributionCpmColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'cpm',
        'cost per mille',
        'custo por mil',
      ]),
    [distributionSourceRows],
  );
  const distributionRevenueColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'revenue',
        'faturamento',
        'faturameto',
        'purchase value',
        'valor de compras',
        'valor de compra',
      ]),
    [distributionSourceRows],
  );
  const distributionCpaColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'cpa',
        'cost per purchase',
        'custo por compra',
        'custo pro compra',
        'custo por venda',
      ]),
    [distributionSourceRows],
  );
  const distributionLinkClicksColumnKey = useMemo(
    () =>
      findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, [
        'action link clicks',
        'inline link clicks',
        'link clicks',
        'clicks',
        'cliques',
      ]),
    [distributionSourceRows],
  );
  const distributionCpcColumnKey = useMemo(
    () => findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, ['cpc', 'cost per click', 'custo por clique']),
    [distributionSourceRows],
  );
  const distributionCtrColumnKey = useMemo(
    () => findColumnKey(distributionSourceRows as Array<Record<string, unknown>>, ['ctr', 'clickthrough rate', 'taxa de clique']),
    [distributionSourceRows],
  );
  const distributionSheetMetricOptions = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    const rows = distributionSourceRows as Array<Record<string, unknown>>;
    const keys = Object.keys(rows[0] || {});
    const excluded = new Set(
      [
        distributionDateColumnKey,
        distributionCampaignColumnKey,
        distributionAdsetFilterColumnKey,
        distributionAdNameColumnKey,
        distributionPlatformColumnKey,
        distributionPermalinkColumnKey,
        distributionThumbnailColumnKey,
      ]
        .filter(Boolean)
        .map(String),
    );
    const metricKeys = keys.filter((key) => {
      if (String(key ?? '').trim().length === 0) return false;
      if (excluded.has(key)) return false;
      if (looksLikeTextMetricName(key)) return false;
      const samples = rows
        .slice(0, 80)
        .map((row) => row?.[key])
        .filter((value) => String(value ?? '').trim().length > 0);
      if (samples.length > 0 && samples.some((value) => looksLikeUrl(value))) return false;
      return true;
    });
    return metricKeys.map((key) => {
      const sampleValues = rows.slice(0, 80).map((row) => row?.[key]);
      const meta = inferSheetMetricMeta(key, sampleValues);
      return {
        key,
        label: meta.label,
        format: meta.format,
      };
    });
  }, [
    distributionAdNameColumnKey,
    distributionAdsetFilterColumnKey,
    distributionCampaignColumnKey,
    distributionDateColumnKey,
    distributionPermalinkColumnKey,
    distributionPlatformColumnKey,
    distributionSourceRows,
    distributionThumbnailColumnKey,
    project?.source_type,
  ]);

  const sheetMetricOptions = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    const rows = sourceRows as Array<Record<string, unknown>>;
    const keys = Object.keys(rows[0] || {});
    const excluded = new Set([sheetDateColumnKey, sheetAdNameColumnKey, sheetCampaignColumnKey].filter(Boolean).map(String));
    const metricKeys = keys.filter((key) => {
      if (String(key ?? '').trim().length === 0) return false;
      if (excluded.has(key)) return false;
      if (looksLikeTextMetricName(key)) return false;
      const samples = rows.slice(0, 80).map((row) => row?.[key]).filter((value) => String(value ?? '').trim().length > 0);
      if (samples.length > 0 && samples.some((value) => looksLikeUrl(value))) return false;
      return true;
    });
    const options = metricKeys.map((key) => {
      const sampleValues = rows.slice(0, 80).map((row) => row?.[key]);
      const meta = inferSheetMetricMeta(key, sampleValues);
      return {
        key,
        label: meta.label,
        format: meta.format,
      };
    });
    const hasRevenue = options.some((metric) => /\b(revenue|faturamento|purchase value|valor de compra|valor de compras)\b/.test(normalizeMetricName(metric.key)));
    const hasCpa = options.some((metric) => /\b(cpa|cost per purchase|custo por compra|custo por venda)\b/.test(normalizeMetricName(metric.key)));
    const hasPurchases = options.some((metric) => {
      const normalized = normalizeMetricName(metric.key);
      return (
        (/\b(action omni purchase|omni purchase|website purchases?|purchase|purchases|vendas|compras)\b/.test(normalized) || isCustomPurchaseActionMetric(metric.key)) &&
        !/\blast click\b/.test(normalized) &&
        (!isCustomActionMetric(metric.key) || isCustomPurchaseActionMetric(metric.key))
      );
    });
    const hasPurchasesLastClick = options.some((metric) => /\b(compras?|purchases?)\s+last\s+click\b|\b(compras?|purchases?)_last_click\b/.test(normalizeMetricName(metric.key)));
    const hasCpaLastClick = options.some((metric) => /\bcpa\s+last\s+click\b|\bcpa_last_click\b/.test(normalizeMetricName(metric.key)));
    const hasRoasLastClick = options.some((metric) => /\broas\s+last\s+click\b|\broas_last_click\b/.test(normalizeMetricName(metric.key)));
    if (!hasPurchases) {
      options.push({ key: SHEET_DERIVED_PURCHASES_KEY, label: 'Compras', format: 'number' });
    }
    if (!hasRevenue) {
      options.push({ key: SHEET_DERIVED_REVENUE_KEY, label: 'Faturamento', format: 'currency' });
    }
    if (!hasCpa) {
      options.push({ key: SHEET_DERIVED_CPA_KEY, label: 'Custo por Compra', format: 'currency' });
    }
    if (!hasPurchasesLastClick) {
      options.push({ key: SHEET_DERIVED_PURCHASES_LAST_CLICK_KEY, label: 'Compras Last Click', format: 'number' });
    }
    if (!hasCpaLastClick) {
      options.push({ key: SHEET_DERIVED_CPA_LAST_CLICK_KEY, label: 'CPA Last Click', format: 'currency' });
    }
    if (!hasRoasLastClick) {
      options.push({ key: SHEET_DERIVED_ROAS_LAST_CLICK_KEY, label: 'ROAS Last Click', format: 'decimal' });
    }
    return options;
  }, [project?.source_type, sheetAdNameColumnKey, sheetCampaignColumnKey, sheetDateColumnKey, sourceRows]);

  const sheetInvestmentMetricKey = useMemo(() => {
    const keys = sheetMetricOptions.map((metric) => metric.key);
    return pickFirstMatchingKey(keys, [
      /\bamount spent\b/,
      /\bspend\b/,
      /\binvestment\b/,
      /\binvestimento\b/,
      /\bgasto\b/,
      /\bcost\b/,
    ]);
  }, [sheetMetricOptions]);
  const sheetRevenueMetricKey = useMemo(() => {
    const keys = sheetMetricOptions.map((metric) => metric.key);
    return pickFirstMatchingKey(keys, [
      /derived revenue/,
      /\bwebsite purchases conversion value\b/,
      /\bpurchase conversion value\b/,
      /\bconversion value\b/,
      /\bpurchase value\b/,
      /\brevenue\b/,
      /\bfaturamento\b/,
      /\bfaturameto\b/,
      /\bvalor vendido\b/,
      /\bvalor de compras\b/,
      /\bvalor compra\b/,
      /\btotal vendido\b/,
    ]);
  }, [sheetMetricOptions]);
  const sheetRoasMetricKey = useMemo(() => {
    const keys = sheetMetricOptions.map((metric) => metric.key);
    const nonLastClick = keys.find((key) => {
      const normalized = normalizeMetricName(key);
      return /\broas\b/.test(normalized) && !/\blast click\b/.test(normalized);
    });
    if (nonLastClick) return nonLastClick;
    return pickFirstMatchingKey(keys, [/\broas\b/]);
  }, [sheetMetricOptions]);
  const sheetCheckoutMetricKey = useMemo(
    () => pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [/\bomni initiated checkout\b/, /\binitiate checkout\b/, /\bcheckout\b/]),
    [sheetMetricOptions],
  );
  const sheetPurchasesMetricKey = useMemo(() => {
    const keys = sheetMetricOptions.map((metric) => metric.key);
    const rows = filteredRows as Array<Record<string, unknown>>;
    const purchaseCandidates = keys.filter((key) => {
      const normalized = normalizeMetricName(key);
      return (
        (/\b(action omni purchase|omni purchase|website purchases?|purchase|purchases|vendas|compras)\b/.test(normalized) || isCustomPurchaseActionMetric(key)) &&
        !/\blast click\b/.test(normalized) &&
        (!isCustomActionMetric(key) || isCustomPurchaseActionMetric(key))
      );
    });
    const customCandidates = purchaseCandidates.filter((key) => isCustomPurchaseActionMetric(key));
    const customWithData = customCandidates.find((key) => sumMetricValues(rows, key) > 0);
    if (customWithData) return customWithData;
    const genericWithData = purchaseCandidates.find((key) => sumMetricValues(rows, key) > 0);
    if (genericWithData) return genericWithData;
    if (customCandidates.length > 0) return customCandidates[0];
    if (purchaseCandidates.length > 0) return purchaseCandidates[0];
    const fallback = pickFirstMatchingKey(
      keys.filter((key) => !isCustomActionMetric(key) || isCustomPurchaseActionMetric(key)),
      [/\bcustom action\b.*\b(compra|purchase)\b/, /\bpurchases?\b/, /\bvendas\b/, /\bcompras\b/],
    );
    return fallback || SHEET_DERIVED_PURCHASES_KEY;
  }, [filteredRows, sheetMetricOptions]);
  const sheetReachMetricKey = useMemo(
    () => pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [/\breach\b/, /\balcance\b/]),
    [sheetMetricOptions],
  );
  const sheetImpressionsMetricKey = useMemo(
    () => pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [/\bimpressions\b/, /\bimpressoes\b/]),
    [sheetMetricOptions],
  );
  const sheetClicksMetricKey = useMemo(
    () =>
      pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [
        /\baction link clicks\b/,
        /\binline link clicks\b/,
        /\blink clicks?\b/,
        /\bclicks?\b/,
        /\bcliques?\b/,
      ]),
    [sheetMetricOptions],
  );
  const sheetFrequencyMetricKey = useMemo(
    () => pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [/\bfrequency\b/, /\bfrequencia\b/]),
    [sheetMetricOptions],
  );
  const sheetCpcMetricKey = useMemo(
    () => pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [/\bcpc\b/, /cost per click/, /custo por clique/]),
    [sheetMetricOptions],
  );
  const sheetCtrMetricKey = useMemo(
    () => pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [/\bctr\b/, /click through rate/, /taxa de clique/]),
    [sheetMetricOptions],
  );
  const sheetCpaMetricKey = useMemo(() => {
    const keys = sheetMetricOptions.map((metric) => metric.key);
    const nonLastClick = keys.find((key) => {
      const normalized = normalizeMetricName(key);
      return /\b(cpa|cost per purchase|custo por compra|custo pro compra|custo por venda)\b/.test(normalized) && !/\blast click\b/.test(normalized);
    });
    if (nonLastClick) return nonLastClick;
    return pickFirstMatchingKey(keys, [/derived cpa/, /\bcpa\b/, /cost per purchase/, /custo por compra/, /custo pro compra/, /custo por venda/]);
  }, [sheetMetricOptions]);
  const sheetPurchasesLastClickMetricKey = useMemo(
    () => {
      const found = pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [
        /\bcompras?\s+last\s+click\b/,
        /\bpurchases?\s+last\s+click\b/,
        /\blast\s+click\s+purchases?\b/,
        /\bcompras?_last_click\b/,
        /\bpurchases?_last_click\b/,
        /\blastclick\s+purchases?\b/,
      ]);
      return found || SHEET_DERIVED_PURCHASES_LAST_CLICK_KEY;
    },
    [sheetMetricOptions],
  );
  const sheetCpaLastClickMetricKey = useMemo(
    () => {
      const found = pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [
        /\bcpa\s+last\s+click\b/,
        /cost per purchase last click/,
        /custo por compra last click/,
        /\bcpa_last_click\b/,
        /\blastclick\s+cpa\b/,
      ]);
      return found || SHEET_DERIVED_CPA_LAST_CLICK_KEY;
    },
    [sheetMetricOptions],
  );
  const sheetRoasLastClickMetricKey = useMemo(
    () => {
      const found = pickFirstMatchingKey(sheetMetricOptions.map((metric) => metric.key), [
        /\broas\s+last\s+click\b/,
        /\broas_last_click\b/,
        /\blastclick\s+roas\b/,
      ]);
      return found || SHEET_DERIVED_ROAS_LAST_CLICK_KEY;
    },
    [sheetMetricOptions],
  );
  const sheetDefaultWeeklyColumns = useMemo(() => {
    const fallback = sheetMetricOptions.slice(0, 5).map((metric) => metric.key);
    const prioritized = [
      sheetPurchasesMetricKey,
      sheetInvestmentMetricKey,
      sheetRevenueMetricKey,
      sheetRoasMetricKey,
      sheetCpaMetricKey,
      sheetCheckoutMetricKey,
      sheetImpressionsMetricKey,
      sheetReachMetricKey,
    ].filter(Boolean) as string[];
    const unique = Array.from(new Set(prioritized));
    if (unique.length >= 5) return unique.slice(0, 5);
    return Array.from(new Set([...unique, ...fallback])).slice(0, 5);
  }, [
    sheetCpaMetricKey,
    sheetCheckoutMetricKey,
    sheetImpressionsMetricKey,
    sheetInvestmentMetricKey,
    sheetMetricOptions,
    sheetPurchasesMetricKey,
    sheetReachMetricKey,
    sheetRevenueMetricKey,
    sheetRoasMetricKey,
  ]);
  const sheetDefaultBigNumberColumns = useMemo(() => {
    const fallback = sheetMetricOptions.slice(0, 8).map((metric) => metric.key);
    const prioritized = [
      sheetPurchasesMetricKey,
      sheetCpaMetricKey,
      sheetInvestmentMetricKey,
      sheetRevenueMetricKey,
      sheetRoasMetricKey,
      sheetPurchasesLastClickMetricKey,
      sheetCpaLastClickMetricKey,
      sheetRoasLastClickMetricKey,
    ].filter(Boolean) as string[];
    const unique = Array.from(new Set(prioritized));
    if (unique.length >= 8) return unique.slice(0, 8);
    return Array.from(new Set([...unique, ...fallback])).slice(0, 8);
  }, [
    sheetCpaLastClickMetricKey,
    sheetCpaMetricKey,
    sheetInvestmentMetricKey,
    sheetMetricOptions,
    sheetPurchasesLastClickMetricKey,
    sheetPurchasesMetricKey,
    sheetRevenueMetricKey,
    sheetRoasLastClickMetricKey,
    sheetRoasMetricKey,
  ]);

  const sheetCreativeMetricOptions = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    const options = [...sheetMetricOptions];
    if (sheetPermalinkColumnKey) {
      options.push({
        key: sheetPermalinkColumnKey,
        label: 'Instagram Permalink URL',
        format: 'link' as const,
      });
    }
    return options;
  }, [project?.source_type, sheetMetricOptions, sheetPermalinkColumnKey]);

  React.useEffect(() => {
    if (project?.source_type === 'meta_ads') return;
    const available = sheetMetricOptions.map((option) => option.key);
    if (!available.length) return;

    const readStored = (key: string) => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [] as string[];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((v: unknown) => String(v)).filter(Boolean) : [];
      } catch {
        return [] as string[];
      }
    };

    const clampToAvailable = (values: string[], fallbackCount: number) => {
      const filtered = Array.from(new Set(values.filter((value) => available.includes(value))));
      const filler = available.filter((value) => !filtered.includes(value));
      const merged = [...filtered, ...filler].slice(0, fallbackCount);
      if (merged.length > 0) return merged;
      return available.slice(0, fallbackCount);
    };

    setSheetBigNumberColumns((prev) => {
      const stored = readStored(sheetBigNumbersStorageKey);
      const seed = isPreview
        ? sheetDefaultBigNumberColumns
        : (prev.length > 0 ? prev : (stored.length > 0 ? stored : sheetDefaultBigNumberColumns));
      const migrated = [...seed];
      const purchasesKey = sheetPurchasesMetricKey || SHEET_DERIVED_PURCHASES_KEY;
      const hasPurchases = purchasesKey && migrated.includes(purchasesKey);
      const legacyCustomCompraIndex = migrated.findIndex((key) => isCustomActionMetric(key) && /\bcompra\b/.test(normalizeMetricName(key)));
      if (!hasPurchases && purchasesKey && available.includes(purchasesKey) && legacyCustomCompraIndex >= 0) {
        migrated[legacyCustomCompraIndex] = purchasesKey;
      }
      return clampToAvailable(migrated, Math.max(8, migrated.length));
    });
    setSheetWeeklyMetricColumns((prev) => {
      const seed = prev.length > 0 ? prev : readStored(sheetWeeklyStorageKey);
      return clampToAvailable(seed, Math.max(5, seed.length));
    });
    setSheetCreativeMetricColumns((prev) => {
      const seed = prev.length > 0 ? prev : readStored(sheetCreativeStorageKey);
      return clampToAvailable(seed, Math.max(5, seed.length));
    });
    setSheetChartMetricColumns((prev) => {
      if (prev.length > 0) return clampToAvailable(prev, 4);
      return clampToAvailable(readStored(sheetChartStorageKey), 4);
    });
  }, [
    project?.source_type,
    sheetBigNumbersStorageKey,
    sheetDefaultBigNumberColumns,
    isPreview,
    sheetChartStorageKey,
    sheetCreativeStorageKey,
    sheetMetricOptions,
    sheetPurchasesMetricKey,
    sheetWeeklyStorageKey,
  ]);

  const metaCampaignOptions = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];

    const campaigns = (metaCampaignsQuery.data || []) as Array<{ id: string; name: string; effective_status?: string }>;
    if (campaigns.length === 0) {
      // Fallback: campaigns seen in insights for the selected period.
      const fromInsights = (metaCampaignTotalsQuery.data || []) as any[];
      const map = new Map<string, string>();
      for (const row of fromInsights) {
        if (row?.campaign_id && row?.campaign_name) {
          map.set(String(row.campaign_id), String(row.campaign_name));
        }
      }
      return Array.from(map.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    const activeFirst = [...campaigns].sort((a, b) => {
      const aActive = String(a.effective_status || '').toUpperCase() === 'ACTIVE' ? 0 : 1;
      const bActive = String(b.effective_status || '').toUpperCase() === 'ACTIVE' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    return activeFirst.map((c) => ({ id: String(c.id), name: String(c.name), effective_status: c.effective_status }));
  }, [metaCampaignTotalsQuery.data, metaCampaignsQuery.data, project?.source_type]);

  const sheetCampaignOptions = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    const values = new Set<string>();
    if (sheetCampaignColumnKey) {
      for (const row of sourceRows as Array<Record<string, unknown>>) {
        const value = String(row?.[sheetCampaignColumnKey] ?? '').trim();
        if (value) values.add(value);
      }
    }
    if (distributionCampaignColumnKey) {
      for (const row of distributionSourceRows as Array<Record<string, unknown>>) {
        const value = String(row?.[distributionCampaignColumnKey] ?? '').trim();
        if (value) values.add(value);
      }
    }
    if (sheetAdsetFilterColumnKey) {
      for (const row of sourceRows as Array<Record<string, unknown>>) {
        const value = String(row?.[sheetAdsetFilterColumnKey] ?? '').trim();
        if (value) values.add(value);
      }
    }
    if (distributionAdsetFilterColumnKey) {
      for (const row of distributionSourceRows as Array<Record<string, unknown>>) {
        const value = String(row?.[distributionAdsetFilterColumnKey] ?? '').trim();
        if (value) values.add(value);
      }
    }
    return Array.from(values)
      .map((name) => ({ id: name, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [
    distributionAdsetFilterColumnKey,
    distributionCampaignColumnKey,
    distributionSourceRows,
    project?.source_type,
    sheetAdsetFilterColumnKey,
    sheetCampaignColumnKey,
    sourceRows,
  ]);

  const campaignOptions = project?.source_type === 'meta_ads' ? metaCampaignOptions : sheetCampaignOptions;

  const metaWeeklyMetricOptions = useMemo(() => {
    const allowedKeys = [
      'impressions',
      'result',
      'reach',
      'messages',
      'purchases',
      'checkout_views',
      'roi',
      'hook_rate',
      'hold_rate',
      'profile_visits',
      'inline_link_clicks',
      'landing_views',
      'frequency',
      'thruplay',
      'cpc',
      'cpm',
      'ctr',
      'cost_per_profile_visit',
      'cost_per_message',
      'cost_per_lead',
      'cost_per_purchase',
      'cost_per_result',
      'connect_rate',
    ];

    return allowedKeys.map((key) => ({
      key,
      label: getMetaMetricLabel(key),
      format: getMetaMetricFormat(key),
    }));
  }, []);

  const rowsAfterCampaignFilter = useMemo(() => {
    if (project?.source_type !== 'meta_ads') {
      if (selectedCampaignIds.length === 0) return sourceRows;
      const selectedSet = new Set(selectedCampaignIds.map((id) => String(id)));
      return sourceRows.filter((row) => {
        const campaign = sheetCampaignColumnKey ? String(row?.[sheetCampaignColumnKey] ?? '').trim() : '';
        const adset = sheetAdsetFilterColumnKey ? String(row?.[sheetAdsetFilterColumnKey] ?? '').trim() : '';
        return (campaign && selectedSet.has(campaign)) || (adset && selectedSet.has(adset));
      });
    }
    if (selectedCampaignIds.length === 0) return metaAccountRows;
    const selectedSet = new Set(selectedCampaignIds.map((id) => String(id)));
    return sourceRows.filter((r) => selectedSet.has(String(r?.campaign_id || '')));
  }, [metaAccountRows, project?.source_type, selectedCampaignIds, sheetAdsetFilterColumnKey, sheetCampaignColumnKey, sourceRows]);

  const aggregatedMetaRows = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return rowsAfterCampaignFilter;

    // If no campaign selected, we already queried account-level rows (no aggregation needed).
    if (selectedCampaignIds.length === 0) {
      return [...rowsAfterCampaignFilter].sort((a, b) =>
        String(a?.date || a?.date_start || '').localeCompare(String(b?.date || b?.date_start || ''))
      );
    }

    const byDate = new Map<string, any>();
    for (const row of rowsAfterCampaignFilter) {
      const date = String(row?.date || row?.date_start || '');
      if (!date) continue;
      const current = byDate.get(date) || {
        date,
        impressions: 0,
        reach: 0,
        clicks: 0,
        inline_link_clicks: 0,
        spend: 0,
        leads: 0,
        messages: 0,
        profile_visits: 0,
        instagram_follows: 0,
        purchases: 0,
        purchase_value: 0,
        landing_views: 0,
        checkout_views: 0,
        video3s: 0,
        video15s: 0,
        thruplay: 0,
        actions_map: {} as Record<string, number>,
        action_values_map: {} as Record<string, number>,
      };
      current.impressions += Number(row?.impressions || 0);
      current.reach = Math.max(current.reach, Number(row?.reach || 0));
      current.clicks += Number(row?.clicks || 0);
      current.inline_link_clicks += Number(row?.inline_link_clicks || 0);
      current.spend += Number(row?.spend || 0);
      current.leads += Number(row?.leads || 0);
      current.messages += Number(row?.messages || 0);
      current.profile_visits += Number(row?.profile_visits || 0);
      current.instagram_follows += Number(row?.instagram_follows || 0);
      current.purchases += Number(row?.purchases || 0);
      current.purchase_value += Number(row?.purchase_value || 0);
      current.landing_views += Number(row?.landing_views || 0);
      current.checkout_views += Number(row?.checkout_views || 0);
      current.video3s += Number(row?.video3s || 0);
      current.video15s += Number(row?.video15s || 0);
      current.thruplay += Number(row?.thruplay || 0);
      const actionsMap = (row?.actions_map || {}) as Record<string, number>;
      for (const [actionType, value] of Object.entries(actionsMap)) {
        current.actions_map[actionType] = Number(current.actions_map[actionType] || 0) + Number(value || 0);
      }
      const actionValuesMap = (row?.action_values_map || {}) as Record<string, number>;
      for (const [actionType, value] of Object.entries(actionValuesMap)) {
        current.action_values_map[actionType] = Number(current.action_values_map[actionType] || 0) + Number(value || 0);
      }
      byDate.set(date, current);
    }

    return Array.from(byDate.values())
      .map((r) => {
        const impressions = Number(r?.impressions || 0);
        const reach = Number(r?.reach || 0);
        const clicks = Number(r?.clicks || 0);
        const spend = Number(r?.spend || 0);
        const leads = Number(r?.leads || 0);
        const purchases = Number(r?.purchases || 0);
        const purchaseValue = Number(r?.purchase_value || 0);
        const video3s = Number(r?.video3s || 0);
        const video15s = Number(r?.video15s || 0);
        const thruplay = Number(r?.thruplay || 0);

        return {
          ...r,
          frequency: reach > 0 ? impressions / reach : 0,
          roas: spend > 0 ? purchaseValue / spend : 0,
          // Recompute derived metrics for aggregated rows
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          cpl: leads > 0 ? spend / leads : 0,
          cpa: purchases > 0 ? spend / purchases : 0,
          hook_rate: impressions > 0 ? video3s / impressions : 0,
          hold_rate: impressions > 0 ? (video15s || thruplay) / impressions : 0,
          actions_map: r.actions_map || {},
          action_values_map: r.action_values_map || {},
        };
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [project?.source_type, rowsAfterCampaignFilter, selectedCampaignIds]);

  // 4. Apply Filters
  const filteredRows = useMemo(() => {
    if (!aggregatedMetaRows.length) return [];

    return aggregatedMetaRows.filter(row => {
      // Date Filter
      if (dateRange?.from) {
        const dateKey =
          project?.source_type === 'meta_ads'
            ? (Object.keys(row).find((k) => k.toLowerCase().includes('data') || k.toLowerCase().includes('date') || k === 'date' || k === 'date_start') || null)
            : (sheetDateColumnKey || Object.keys(row).find((k) => k.toLowerCase().includes('data') || k.toLowerCase().includes('date')) || null);
        if (dateKey && row[dateKey]) {
          const rowDate = parseSheetDateValue(row[dateKey]);
          if (rowDate) {
            const from = new Date(dateRange.from!);
            from.setHours(0, 0, 0, 0);
            const to = dateRange.to ? new Date(dateRange.to) : new Date();
            to.setHours(23, 59, 59, 999);
            if (rowDate < from) return false;
            if (rowDate > to) return false;
          } else if (project?.source_type !== 'meta_ads') {
            return false;
          }
        }
      }

      // Creative Filter
      if (selectedCreative) {
        const creativeKey =
          (project?.source_type !== 'meta_ads' ? (sheetAdNameColumnKey || sheetAdsetNameColumnKey) : null) ||
          Object.keys(row).find(k =>
            k.toLowerCase().includes('criativo') || k.toLowerCase().includes('creative') || k.toLowerCase().includes('adset')
          );
        if (creativeKey && row[creativeKey] !== selectedCreative) {
          return false;
        }
      }

      return true;
    });
  }, [aggregatedMetaRows, dateRange, project?.source_type, selectedCreative, sheetAdNameColumnKey, sheetAdsetNameColumnKey, sheetDateColumnKey]);

  // 5. Process Data
  const effectiveMappings = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return resolvedMappings || [];

    // For Meta Ads we can render meaningful KPIs even if the user didn't configure mappings yet.
    return [
      {
        id: 'meta_spend',
        project_id: projectId,
        source_column: 'spend',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'Gasto',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'currency' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_impressions',
        project_id: projectId,
        source_column: 'impressions',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'Impressões',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'number' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_clicks',
        project_id: projectId,
        source_column: 'clicks',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'Cliques',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'number' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_ctr',
        project_id: projectId,
        source_column: 'ctr',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'CTR',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'percent' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_cpc',
        project_id: projectId,
        source_column: 'cpc',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'CPC',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'currency' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_cpl',
        project_id: projectId,
        source_column: 'cpl',
        mapped_to: 'big_number',
        mapped_to_key: null,
        display_name: 'CPL',
        data_type: 'number',
        is_big_number: true,
        is_funnel_step: false,
        funnel_order: null,
        format_options: { format_type: 'currency' },
        created_at: new Date().toISOString(),
      },
      {
        id: 'meta_leads_funnel',
        project_id: projectId,
        source_column: 'leads',
        mapped_to: 'funnel',
        mapped_to_key: null,
        display_name: 'Leads',
        data_type: 'number',
        is_big_number: false,
        is_funnel_step: true,
        funnel_order: 1,
        format_options: { format_type: 'number' },
        created_at: new Date().toISOString(),
      },
    ] as any[];
  }, [resolvedMappings, adAccountId, project?.source_type, projectId]);

  const processedData = useMemo(() => {
    return processDashboardData(filteredRows, effectiveMappings as any);
  }, [filteredRows, effectiveMappings]);

  const filteredDistributionRows = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    const selectedSet = selectedCampaignIds.length > 0 ? new Set(selectedCampaignIds.map((id) => String(id))) : null;
    return (distributionSourceRows as Array<Record<string, unknown>>).filter((row) => {
      if (selectedSet) {
        const campaign = distributionCampaignColumnKey ? String(row?.[distributionCampaignColumnKey] ?? '').trim() : '';
        const adset = distributionAdsetFilterColumnKey ? String(row?.[distributionAdsetFilterColumnKey] ?? '').trim() : '';
        if (!(campaign && selectedSet.has(campaign)) && !(adset && selectedSet.has(adset))) return false;
      }

      if (distributionPhase !== 'all' && project?.source_type === 'meta_ads') {
        const campaign = distributionCampaignColumnKey ? String(row?.[distributionCampaignColumnKey] ?? '').toLowerCase() : '';
        const adset = distributionAdsetFilterColumnKey ? String(row?.[distributionAdsetFilterColumnKey] ?? '').toLowerCase() : '';
        const haystack = `${campaign} ${adset}`;
        if (!haystack.includes(distributionPhase)) return false;
      }

      if (dateRange?.from) {
        const key = distributionDateColumnKey || Object.keys(row).find((k) => k.toLowerCase().includes('data') || k.toLowerCase().includes('date'));
        if (key && row[key]) {
          const rowDate = parseSheetDateValue(row[key]);
          if (rowDate) {
            const from = new Date(dateRange.from);
            from.setHours(0, 0, 0, 0);
            const to = dateRange.to ? new Date(dateRange.to) : new Date();
            to.setHours(23, 59, 59, 999);
            if (rowDate < from || rowDate > to) return false;
          } else {
            return false;
          }
        }
      }

      return true;
    });
  }, [
    dateRange,
    distributionPhase,
    distributionAdsetFilterColumnKey,
    distributionCampaignColumnKey,
    distributionDateColumnKey,
    distributionSourceRows,
    project?.source_type,
    selectedCampaignIds,
  ]);

  const sheetDistributionData = useMemo(() => {
    if (project?.source_type === 'meta_ads') return null;

    const byPlatform = new Map<string, { reach: number; engagement: number; count: number }>();
    let totalReach = 0;
    let totalImpressions = 0;
    let totalVideoViews3s = 0;
    let totalThruplayViews = 0;
    let totalFollowers = 0;
    let totalEngagement = 0;
    let engagementCount = 0;
    let totalSpend = 0;
    let totalProfileVisits = 0;
    let totalLinkClicks = 0;
    let totalFrequencyFromField = 0;
    let frequencyFieldCount = 0;
    let totalCpcFromField = 0;
    let cpcFieldCount = 0;
    let totalCtrFromField = 0;
    let ctrFieldCount = 0;
    let permalinkCount = 0;
    let totalCheckouts = 0;
    let totalPurchases = 0;
    let totalRoas = 0;
    let roasCount = 0;
    let totalRevenueFromField = 0;
    let totalCpaFromField = 0;
    let cpaFieldCount = 0;
    let totalCpm = 0;
    let cpmCount = 0;
    const byCreative = new Map<string, { spend: number; revenue: number; reach: number; impressions: number; clicks: number; video3s: number; thruplay: number; profileVisits: number; purchases: number; checkouts: number; metrics: Record<string, number>; metricCounts: Record<string, number>; link?: string; thumbnail?: string }>();
    const averageMetricKeys = new Set(
      distributionSheetMetricOptions
        .filter((metric) => metric.format === 'percentage' || metric.format === 'decimal')
        .map((metric) => metric.key),
    );
    let totalRevenue = 0;

    for (const row of filteredDistributionRows as Array<Record<string, unknown>>) {
      const reach = parseSheetNumber(distributionReachColumnKey ? row?.[distributionReachColumnKey] : 0);
      const impressions = parseSheetNumber(distributionImpressionsColumnKey ? row?.[distributionImpressionsColumnKey] : 0);
      const engagement = parseSheetNumber(distributionEngagementColumnKey ? row?.[distributionEngagementColumnKey] : 0);
      const frequencyFromField = parseSheetNumber(distributionFrequencyColumnKey ? row?.[distributionFrequencyColumnKey] : 0);
      const cpcFromField = parseSheetNumber(distributionCpcColumnKey ? row?.[distributionCpcColumnKey] : 0);
      const ctrFromField = parseSheetNumber(distributionCtrColumnKey ? row?.[distributionCtrColumnKey] : 0);
      const video3s = parseSheetNumber(distributionVideo3sColumnKey ? row?.[distributionVideo3sColumnKey] : 0);
      const thruplay = parseSheetNumber(distributionThruplayColumnKey ? row?.[distributionThruplayColumnKey] : 0);
      const videoViews = video3s > 0 ? video3s : parseSheetNumber(distributionVideoViewsColumnKey ? row?.[distributionVideoViewsColumnKey] : 0);
      const followers = parseSheetNumber(distributionFollowersColumnKey ? row?.[distributionFollowersColumnKey] : 0);
      const spend = parseSheetNumber(distributionSpendColumnKey ? row?.[distributionSpendColumnKey] : 0);
      const profileVisits = parseSheetNumber(distributionProfileVisitsColumnKey ? row?.[distributionProfileVisitsColumnKey] : 0);
      const checkouts = parseSheetNumber(distributionCheckoutColumnKey ? row?.[distributionCheckoutColumnKey] : 0);
      const purchases = parseSheetNumber(distributionPurchasesColumnKey ? row?.[distributionPurchasesColumnKey] : 0);
      const roas = parseSheetNumber(distributionRoasColumnKey ? row?.[distributionRoasColumnKey] : 0);
      const revenueFromField = parseSheetNumber(distributionRevenueColumnKey ? row?.[distributionRevenueColumnKey] : 0);
      const cpaFromField = parseSheetNumber(distributionCpaColumnKey ? row?.[distributionCpaColumnKey] : 0);
      const revenueFromRow = roas > 0 ? roas * spend : 0;
      const cpm = parseSheetNumber(distributionCpmColumnKey ? row?.[distributionCpmColumnKey] : 0);
      const clicks = parseSheetNumber(distributionLinkClicksColumnKey ? row?.[distributionLinkClicksColumnKey] : 0);
      const creativeName = String(distributionAdNameColumnKey ? row?.[distributionAdNameColumnKey] : '').trim();
      const creativeLink = String(distributionPermalinkColumnKey ? row?.[distributionPermalinkColumnKey] ?? '' : '').trim();
      const creativeThumbnail = String(distributionThumbnailColumnKey ? row?.[distributionThumbnailColumnKey] ?? '' : '').trim();
      const platformRaw = distributionPlatformColumnKey ? row?.[distributionPlatformColumnKey] : null;
      const platform = String(platformRaw ?? 'Outros').trim() || 'Outros';

      totalReach += reach;
      totalImpressions += impressions;
      totalVideoViews3s += videoViews;
      totalThruplayViews += thruplay;
      totalFollowers += followers;
      totalSpend += spend;
      totalProfileVisits += profileVisits;
      totalLinkClicks += clicks;
      if (frequencyFromField > 0) {
        totalFrequencyFromField += frequencyFromField;
        frequencyFieldCount += 1;
      }
      if (cpcFromField > 0) {
        totalCpcFromField += cpcFromField;
        cpcFieldCount += 1;
      }
      if (ctrFromField > 0) {
        totalCtrFromField += ctrFromField;
        ctrFieldCount += 1;
      }
      if (creativeLink) permalinkCount += 1;
      totalCheckouts += checkouts;
      totalPurchases += purchases;
      if (revenueFromField > 0) {
        totalRevenueFromField += revenueFromField;
      }
      if (cpaFromField > 0) {
        totalCpaFromField += cpaFromField;
        cpaFieldCount += 1;
      }
      totalRevenue += revenueFromRow;
      if (roas > 0) {
        totalRoas += roas;
        roasCount += 1;
      }
      if (cpm > 0) {
        totalCpm += cpm;
        cpmCount += 1;
      }

      if (engagement > 0) {
        totalEngagement += engagement;
        engagementCount += 1;
      }

      const current = byPlatform.get(platform) || { reach: 0, engagement: 0, count: 0 };
      current.reach += reach;
      current.engagement += engagement;
      if (engagement > 0) current.count += 1;
      byPlatform.set(platform, current);

      if (creativeName) {
        const currentCreative = byCreative.get(creativeName) || { spend: 0, revenue: 0, reach: 0, impressions: 0, clicks: 0, video3s: 0, thruplay: 0, profileVisits: 0, purchases: 0, checkouts: 0, metrics: {}, metricCounts: {}, link: undefined, thumbnail: undefined };
        currentCreative.spend += spend;
        currentCreative.revenue += revenueFromRow;
        currentCreative.reach += reach;
        currentCreative.impressions += impressions;
        currentCreative.clicks += clicks;
        currentCreative.video3s += videoViews;
        currentCreative.thruplay += thruplay;
        currentCreative.profileVisits += profileVisits;
        currentCreative.purchases += purchases;
        currentCreative.checkouts += checkouts;
        for (const metric of distributionSheetMetricOptions) {
          const rawMetric = row?.[metric.key];
          const hasValue = String(rawMetric ?? '').trim().length > 0;
          if (!hasValue) continue;
          const metricValue = parseSheetNumber(rawMetric);
          currentCreative.metrics[metric.key] = Number(currentCreative.metrics[metric.key] || 0) + metricValue;
          if (averageMetricKeys.has(metric.key)) {
            currentCreative.metricCounts[metric.key] = Number(currentCreative.metricCounts[metric.key] || 0) + 1;
          }
        }
        if (creativeLink && !currentCreative.link) currentCreative.link = creativeLink;
        if (creativeThumbnail && !currentCreative.thumbnail) currentCreative.thumbnail = creativeThumbnail;
        byCreative.set(creativeName, currentCreative);
      }
    }

    const platformBreakdown = Array.from(byPlatform.entries()).map(([platform, stats]) => ({
      platform,
      reach: stats.reach,
      engagement: stats.count > 0 ? stats.engagement / stats.count : 0,
    }));

    return {
      totalReach,
      totalImpressions,
      frequency: totalReach > 0 ? totalImpressions / totalReach : (frequencyFieldCount > 0 ? totalFrequencyFromField / frequencyFieldCount : 0),
      totalLinkClicks,
      cpc: totalLinkClicks > 0 ? totalSpend / totalLinkClicks : (cpcFieldCount > 0 ? totalCpcFromField / cpcFieldCount : 0),
      ctr: totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : (ctrFieldCount > 0 ? totalCtrFromField / ctrFieldCount : 0),
      avgEngagement: engagementCount > 0 ? totalEngagement / engagementCount : 0,
      videoViews: totalVideoViews3s,
      videoViews3s: totalVideoViews3s,
      thruplayViews: totalThruplayViews,
      followersGained: totalFollowers,
      permalinkCount,
      spend: totalSpend,
      revenue: totalRevenueFromField > 0 ? totalRevenueFromField : totalRevenue,
      profileVisits: totalProfileVisits,
      checkouts: totalCheckouts,
      purchases: totalPurchases,
      roas:
        totalSpend > 0
          ? ((totalRevenueFromField > 0 ? totalRevenueFromField : totalRevenue) / totalSpend)
          : (roasCount > 0 ? totalRoas / roasCount : 0),
      cpa:
        totalPurchases > 0
          ? totalSpend / totalPurchases
          : (cpaFieldCount > 0 ? totalCpaFromField / cpaFieldCount : 0),
      cpm: cpmCount > 0 ? totalCpm / cpmCount : (totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0),
      costPerProfileVisit: totalProfileVisits > 0 ? totalSpend / totalProfileVisits : 0,
      costPerEngagement: totalEngagement > 0 ? totalSpend / totalEngagement : 0,
      activeCreatives: byCreative.size,
      topCreatives: Array.from(byCreative.entries())
        .map(([name, stats]) => {
          const dynamicMetrics = { ...stats.metrics };
          for (const metric of distributionSheetMetricOptions) {
            if (!averageMetricKeys.has(metric.key)) continue;
            const count = Number(stats.metricCounts[metric.key] || 0);
            if (count > 0) {
              dynamicMetrics[metric.key] = Number(stats.metrics[metric.key] || 0) / count;
            }
          }
          return {
          name,
          spend: stats.spend,
          revenue: stats.revenue,
          reach: stats.reach,
          impressions: stats.impressions,
          clicks: stats.clicks,
          video3s: stats.video3s,
          thruplay: stats.thruplay,
          profileVisits: stats.profileVisits,
          purchases: stats.purchases,
          checkouts: stats.checkouts,
          frequency: stats.reach > 0 ? stats.impressions / stats.reach : 0,
          ctr: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
          cpc: stats.clicks > 0 ? stats.spend / stats.clicks : 0,
          cpm: stats.impressions > 0 ? (stats.spend / stats.impressions) * 1000 : 0,
          roas: stats.spend > 0 ? stats.revenue / stats.spend : 0,
          cpa: stats.purchases > 0 ? stats.spend / stats.purchases : 0,
          metrics: dynamicMetrics,
          link: stats.link,
          thumbnail: stats.thumbnail,
          };
        })
        .sort((a, b) => b.profileVisits - a.profileVisits)
        .slice(0, 8),
      platformBreakdown,
    };
  }, [
    distributionAdNameColumnKey,
    distributionCheckoutColumnKey,
    distributionCpcColumnKey,
    distributionCpaColumnKey,
    distributionCpmColumnKey,
    distributionCtrColumnKey,
    distributionEngagementColumnKey,
    distributionFollowersColumnKey,
    distributionFrequencyColumnKey,
    distributionImpressionsColumnKey,
    distributionLinkClicksColumnKey,
    distributionProfileVisitsColumnKey,
    distributionPlatformColumnKey,
    distributionPermalinkColumnKey,
    distributionPurchasesColumnKey,
    distributionReachColumnKey,
    distributionRevenueColumnKey,
    distributionRoasColumnKey,
    distributionSheetMetricOptions,
    distributionSpendColumnKey,
    distributionThruplayColumnKey,
    distributionThumbnailColumnKey,
    distributionVideo3sColumnKey,
    distributionVideoViewsColumnKey,
    filteredDistributionRows,
    project?.source_type,
  ]);


  const sheetWeeklyData = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    if (!sheetDateColumnKey) return [];

    const byBucket = new Map<string, Record<string, unknown>>();
    for (const row of filteredRows as Array<Record<string, unknown>>) {
      const rawDate = row?.[sheetDateColumnKey];
      if (!rawDate) continue;
      const parsedDate = parseSheetDateValue(rawDate);
      if (!parsedDate) continue;

      let bucketKey = '';
      if (viewMode === 'day') {
        bucketKey = format(parsedDate, 'yyyy-MM-dd');
      } else if (viewMode === 'month') {
        bucketKey = format(startOfMonth(parsedDate), 'yyyy-MM');
      } else {
        bucketKey = format(startOfWeek(parsedDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');
      }

      const current = byBucket.get(bucketKey) || { periodKey: bucketKey };
      current.__row_count = parseSheetNumber(current.__row_count) + 1;
      const canRecomputeRoas = Boolean(sheetRoasMetricKey && sheetInvestmentMetricKey && sheetRevenueMetricKey);
      for (const metric of sheetMetricOptions) {
        if (canRecomputeRoas && sheetRoasMetricKey && metric.key === sheetRoasMetricKey) continue;
        const currentValue = parseSheetNumber(current[metric.key]);
        const nextValue =
          metric.key === SHEET_DERIVED_REVENUE_KEY
            ? (() => {
                const spend = sheetInvestmentMetricKey ? parseSheetNumber(row?.[sheetInvestmentMetricKey]) : 0;
                const rowRoas = sheetRoasMetricKey ? parseSheetNumber(row?.[sheetRoasMetricKey]) : 0;
                return spend > 0 && rowRoas > 0 ? spend * rowRoas : 0;
              })()
            : parseSheetNumber(row?.[metric.key]);
        current[metric.key] = currentValue + nextValue;
      }
      if (canRecomputeRoas && sheetRoasMetricKey && sheetInvestmentMetricKey && sheetRevenueMetricKey) {
        const invest = parseSheetNumber(current[sheetInvestmentMetricKey]);
        const revenue = parseSheetNumber(current[sheetRevenueMetricKey]);
        current[sheetRoasMetricKey] = invest > 0 ? revenue / invest : 0;
      }
      byBucket.set(bucketKey, current);
    }

    for (const values of byBucket.values()) {
      const rowCount = parseSheetNumber(values.__row_count);
      if (sheetFrequencyMetricKey) {
        if (sheetImpressionsMetricKey && sheetReachMetricKey) {
          const impressions = parseSheetNumber(values[sheetImpressionsMetricKey]);
          const reach = parseSheetNumber(values[sheetReachMetricKey]);
          values[sheetFrequencyMetricKey] = reach > 0 ? impressions / reach : 0;
        } else if (rowCount > 0) {
          values[sheetFrequencyMetricKey] = parseSheetNumber(values[sheetFrequencyMetricKey]) / rowCount;
        }
      }
      if (sheetCpcMetricKey) {
        if (sheetInvestmentMetricKey && sheetClicksMetricKey) {
          const spend = parseSheetNumber(values[sheetInvestmentMetricKey]);
          const clicks = parseSheetNumber(values[sheetClicksMetricKey]);
          values[sheetCpcMetricKey] = clicks > 0 ? spend / clicks : 0;
        } else if (rowCount > 0) {
          values[sheetCpcMetricKey] = parseSheetNumber(values[sheetCpcMetricKey]) / rowCount;
        }
      }
      if (sheetCpaMetricKey) {
        if (sheetCpaMetricKey === SHEET_DERIVED_CPA_KEY && sheetInvestmentMetricKey && sheetPurchasesMetricKey) {
          const spend = parseSheetNumber(values[sheetInvestmentMetricKey]);
          const purchases = parseSheetNumber(values[sheetPurchasesMetricKey]);
          values[sheetCpaMetricKey] = purchases > 0 ? spend / purchases : 0;
        } else if (rowCount > 0) {
          values[sheetCpaMetricKey] = parseSheetNumber(values[sheetCpaMetricKey]) / rowCount;
        }
      }
      if (sheetCtrMetricKey) {
        if (sheetClicksMetricKey && sheetImpressionsMetricKey) {
          const clicks = parseSheetNumber(values[sheetClicksMetricKey]);
          const impressions = parseSheetNumber(values[sheetImpressionsMetricKey]);
          values[sheetCtrMetricKey] = impressions > 0 ? (clicks / impressions) * 100 : 0;
        } else if (rowCount > 0) {
          values[sheetCtrMetricKey] = parseSheetNumber(values[sheetCtrMetricKey]) / rowCount;
        }
      }
      if (sheetRoasMetricKey && (!sheetInvestmentMetricKey || !sheetRevenueMetricKey) && rowCount > 0) {
        values[sheetRoasMetricKey] = parseSheetNumber(values[sheetRoasMetricKey]) / rowCount;
      }
    }

    const periodKeysFromFilter = getPeriodKeysFromDateRange(dateRange, viewMode);
    const orderedPeriodKeys =
      periodKeysFromFilter.length > 0 ? periodKeysFromFilter : Array.from(byBucket.keys()).sort((a, b) => a.localeCompare(b));

    return orderedPeriodKeys.map((periodKey, index) => {
      const values = byBucket.get(periodKey) || { periodKey };
        const cleanValues = { ...(values as Record<string, unknown>) };
        delete cleanValues.__row_count;
        const periodDate =
          viewMode === 'month'
            ? new Date(`${periodKey}-01T00:00:00`)
            : new Date(`${periodKey}T00:00:00`);
        const label =
          viewMode === 'day'
            ? format(periodDate, 'dd/MM')
            : viewMode === 'month'
              ? format(periodDate, 'MMM/yy', { locale: ptBR })
              : `Sem ${index + 1}`;
        return {
          week: label,
          periodKey,
          periodSort: periodDate.getTime(),
          ...cleanValues,
        };
      });
  }, [
    dateRange,
    filteredRows,
    project?.source_type,
    sheetCpaMetricKey,
    sheetCpcMetricKey,
    sheetClicksMetricKey,
    sheetCtrMetricKey,
    sheetDateColumnKey,
    sheetFrequencyMetricKey,
    sheetImpressionsMetricKey,
    sheetInvestmentMetricKey,
    sheetMetricOptions,
    sheetPurchasesMetricKey,
    sheetReachMetricKey,
    sheetRevenueMetricKey,
    sheetRoasMetricKey,
    viewMode,
  ]);

  const sheetCreativeData = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    if (!sheetAdNameColumnKey && !sheetAdsetNameColumnKey) return [];
    const creativeColumnKey = sheetAdNameColumnKey || sheetAdsetNameColumnKey;
    const byCreative = new Map<string, Record<string, unknown>>();
    for (const row of filteredRows as Array<Record<string, unknown>>) {
      const creativeName = String((creativeColumnKey && row?.[creativeColumnKey]) ?? '').trim();
      if (!creativeName) continue;
      const current = byCreative.get(creativeName) || {
        id: creativeName,
        name: creativeName,
        link: undefined,
        thumbnail: undefined,
      };
      current.__row_count = parseSheetNumber(current.__row_count) + 1;
      const creativeLink = sheetPermalinkColumnKey ? String(row?.[sheetPermalinkColumnKey] ?? '').trim() : '';
      const creativeThumb = sheetThumbnailColumnKey ? String(row?.[sheetThumbnailColumnKey] ?? '').trim() : '';
      if (creativeLink && !current.link) current.link = creativeLink;
      if (sheetPermalinkColumnKey && creativeLink) current[sheetPermalinkColumnKey] = creativeLink;
      if (creativeThumb && !current.thumbnail) current.thumbnail = creativeThumb;
      const canRecomputeRoas = Boolean(sheetRoasMetricKey && sheetInvestmentMetricKey && sheetRevenueMetricKey);
      for (const metric of sheetMetricOptions) {
        if (canRecomputeRoas && sheetRoasMetricKey && metric.key === sheetRoasMetricKey) continue;
        const currentValue = parseSheetNumber(current[metric.key]);
        const nextValue =
          metric.key === SHEET_DERIVED_REVENUE_KEY
            ? (() => {
                const spend = sheetInvestmentMetricKey ? parseSheetNumber(row?.[sheetInvestmentMetricKey]) : 0;
                const rowRoas = sheetRoasMetricKey ? parseSheetNumber(row?.[sheetRoasMetricKey]) : 0;
                return spend > 0 && rowRoas > 0 ? spend * rowRoas : 0;
              })()
            : parseSheetNumber(row?.[metric.key]);
        current[metric.key] = currentValue + nextValue;
      }
      if (canRecomputeRoas && sheetRoasMetricKey && sheetInvestmentMetricKey && sheetRevenueMetricKey) {
        const invest = parseSheetNumber(current[sheetInvestmentMetricKey]);
        const revenue = parseSheetNumber(current[sheetRevenueMetricKey]);
        current[sheetRoasMetricKey] = invest > 0 ? revenue / invest : 0;
      }
      byCreative.set(creativeName, current);
    }

    for (const values of byCreative.values()) {
      const rowCount = parseSheetNumber(values.__row_count);
      if (sheetFrequencyMetricKey) {
        if (sheetImpressionsMetricKey && sheetReachMetricKey) {
          const impressions = parseSheetNumber(values[sheetImpressionsMetricKey]);
          const reach = parseSheetNumber(values[sheetReachMetricKey]);
          values[sheetFrequencyMetricKey] = reach > 0 ? impressions / reach : 0;
        } else if (rowCount > 0) {
          values[sheetFrequencyMetricKey] = parseSheetNumber(values[sheetFrequencyMetricKey]) / rowCount;
        }
      }
      if (sheetCpcMetricKey) {
        if (sheetInvestmentMetricKey && sheetClicksMetricKey) {
          const spend = parseSheetNumber(values[sheetInvestmentMetricKey]);
          const clicks = parseSheetNumber(values[sheetClicksMetricKey]);
          values[sheetCpcMetricKey] = clicks > 0 ? spend / clicks : 0;
        } else if (rowCount > 0) {
          values[sheetCpcMetricKey] = parseSheetNumber(values[sheetCpcMetricKey]) / rowCount;
        }
      }
      if (sheetCpaMetricKey) {
        if (sheetCpaMetricKey === SHEET_DERIVED_CPA_KEY && sheetInvestmentMetricKey && sheetPurchasesMetricKey) {
          const spend = parseSheetNumber(values[sheetInvestmentMetricKey]);
          const purchases = parseSheetNumber(values[sheetPurchasesMetricKey]);
          values[sheetCpaMetricKey] = purchases > 0 ? spend / purchases : 0;
        } else if (rowCount > 0) {
          values[sheetCpaMetricKey] = parseSheetNumber(values[sheetCpaMetricKey]) / rowCount;
        }
      }
      if (sheetCtrMetricKey) {
        if (sheetClicksMetricKey && sheetImpressionsMetricKey) {
          const clicks = parseSheetNumber(values[sheetClicksMetricKey]);
          const impressions = parseSheetNumber(values[sheetImpressionsMetricKey]);
          values[sheetCtrMetricKey] = impressions > 0 ? (clicks / impressions) * 100 : 0;
        } else if (rowCount > 0) {
          values[sheetCtrMetricKey] = parseSheetNumber(values[sheetCtrMetricKey]) / rowCount;
        }
      }
      if (sheetRoasMetricKey && (!sheetInvestmentMetricKey || !sheetRevenueMetricKey) && rowCount > 0) {
        values[sheetRoasMetricKey] = parseSheetNumber(values[sheetRoasMetricKey]) / rowCount;
      }
    }

    return Array.from(byCreative.values())
      .map((item) => {
        const cleanItem = { ...item };
        delete cleanItem.__row_count;
        return cleanItem;
      })
      .slice(0, 200);
  }, [
    filteredRows,
    project?.source_type,
    sheetAdNameColumnKey,
    sheetAdsetNameColumnKey,
    sheetCpaMetricKey,
    sheetCpcMetricKey,
    sheetClicksMetricKey,
    sheetCtrMetricKey,
    sheetFrequencyMetricKey,
    sheetImpressionsMetricKey,
    sheetInvestmentMetricKey,
    sheetMetricOptions,
    sheetPermalinkColumnKey,
    sheetPurchasesMetricKey,
    sheetReachMetricKey,
    sheetRevenueMetricKey,
    sheetRoasMetricKey,
    sheetThumbnailColumnKey,
  ]);

  const sheetBigNumbers = useMemo(() => {
    if (project?.source_type === 'meta_ads') return [];
    const metricMap = new Map(sheetMetricOptions.map((metric) => [metric.key, metric]));
    const rows = filteredRows as Array<Record<string, unknown>>;
    const getAverageMetricValue = (metricKey: string) => {
      const { sum, count } = rows.reduce<{ sum: number; count: number }>(
        (acc, row) => {
          const raw = row?.[metricKey];
          const hasValue = String(raw ?? '').trim().length > 0;
          if (!hasValue) return acc;
          return {
            sum: acc.sum + parseSheetNumber(raw),
            count: acc.count + 1,
          };
        },
        { sum: 0, count: 0 },
      );
      return count > 0 ? sum / count : 0;
    };

    return sheetBigNumberColumns.slice(0, 8).map((metricKey, index) => {
      const metricMeta = metricMap.get(metricKey);
      const total =
        sheetRoasMetricKey &&
        metricKey === sheetRoasMetricKey
          ? (() => {
              if (sheetInvestmentMetricKey && sheetRevenueMetricKey) {
                const investment = (filteredRows as Array<Record<string, unknown>>).reduce(
                  (sum, row) => sum + parseSheetNumber(row?.[sheetInvestmentMetricKey]),
                  0,
                );
                const revenueFromColumn = (filteredRows as Array<Record<string, unknown>>).reduce(
                  (sum, row) => sum + parseSheetNumber(row?.[sheetRevenueMetricKey]),
                  0,
                );
                const revenueFromRoasRows = (filteredRows as Array<Record<string, unknown>>).reduce((sum, row) => {
                  const spend = parseSheetNumber(row?.[sheetInvestmentMetricKey]);
                  const rowRoas = parseSheetNumber(row?.[sheetRoasMetricKey]);
                  return sum + (spend > 0 && rowRoas > 0 ? spend * rowRoas : 0);
                }, 0);
                const revenue = revenueFromColumn > 0 ? revenueFromColumn : revenueFromRoasRows;
                if (investment > 0 && revenue > 0) return revenue / investment;
              }
              return getAverageMetricValue(metricKey);
            })()
          : sheetRevenueMetricKey && metricKey === sheetRevenueMetricKey
            ? (() => {
                if (metricKey === SHEET_DERIVED_REVENUE_KEY && sheetInvestmentMetricKey && sheetRoasMetricKey) {
                  return rows.reduce((sum, row) => {
                    const spend = parseSheetNumber(row?.[sheetInvestmentMetricKey]);
                    const rowRoas = parseSheetNumber(row?.[sheetRoasMetricKey]);
                    return sum + (spend > 0 && rowRoas > 0 ? spend * rowRoas : 0);
                  }, 0);
                }
                return rows.reduce((sum, row) => sum + parseSheetNumber(row?.[metricKey]), 0);
              })()
          : sheetFrequencyMetricKey && metricKey === sheetFrequencyMetricKey
            ? (() => {
                if (sheetImpressionsMetricKey && sheetReachMetricKey) {
                  const impressions = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetImpressionsMetricKey]), 0);
                  const reach = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetReachMetricKey]), 0);
                  return reach > 0 ? impressions / reach : 0;
                }
                return getAverageMetricValue(metricKey);
              })()
            : sheetCpcMetricKey && metricKey === sheetCpcMetricKey
              ? (() => {
                  if (sheetInvestmentMetricKey && sheetClicksMetricKey) {
                    const spend = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetInvestmentMetricKey]), 0);
                    const clicks = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetClicksMetricKey]), 0);
                    return clicks > 0 ? spend / clicks : 0;
                  }
                  return getAverageMetricValue(metricKey);
                })()
              : sheetCpaMetricKey && metricKey === sheetCpaMetricKey
                ? (() => {
                    if (sheetCpaMetricKey === SHEET_DERIVED_CPA_KEY && sheetInvestmentMetricKey && sheetPurchasesMetricKey) {
                      const spend = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetInvestmentMetricKey]), 0);
                      const purchases = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetPurchasesMetricKey]), 0);
                      return purchases > 0 ? spend / purchases : 0;
                    }
                    return getAverageMetricValue(metricKey);
                  })()
              : sheetCpaLastClickMetricKey && metricKey === sheetCpaLastClickMetricKey
                ? (() => {
                    if (sheetInvestmentMetricKey && sheetPurchasesLastClickMetricKey) {
                      const spend = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetInvestmentMetricKey]), 0);
                      const purchasesLastClick = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetPurchasesLastClickMetricKey]), 0);
                      return purchasesLastClick > 0 ? spend / purchasesLastClick : 0;
                    }
                    return getAverageMetricValue(metricKey);
                  })()
              : sheetRoasLastClickMetricKey && metricKey === sheetRoasLastClickMetricKey
                ? (() => {
                    if (sheetInvestmentMetricKey) {
                      const spend = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetInvestmentMetricKey]), 0);
                      const weightedRoas = rows.reduce((sum, row) => {
                        const rowSpend = parseSheetNumber(row?.[sheetInvestmentMetricKey]);
                        const rowRoas = parseSheetNumber(row?.[sheetRoasLastClickMetricKey]);
                        return sum + (rowSpend > 0 ? rowSpend * rowRoas : 0);
                      }, 0);
                      return spend > 0 ? weightedRoas / spend : 0;
                    }
                    return getAverageMetricValue(metricKey);
                  })()
              : sheetPurchasesLastClickMetricKey && metricKey === sheetPurchasesLastClickMetricKey
                ? rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetPurchasesLastClickMetricKey]), 0)
              : sheetCtrMetricKey && metricKey === sheetCtrMetricKey
                ? (() => {
                    if (sheetClicksMetricKey && sheetImpressionsMetricKey) {
                      const clicks = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetClicksMetricKey]), 0);
                      const impressions = rows.reduce((sum, row) => sum + parseSheetNumber(row?.[sheetImpressionsMetricKey]), 0);
                      return impressions > 0 ? (clicks / impressions) * 100 : 0;
                    }
                    return getAverageMetricValue(metricKey);
                  })()
          : (filteredRows as Array<Record<string, unknown>>).reduce(
              (sum, row) => sum + parseSheetNumber(row?.[metricKey]),
              0,
            );
      return {
        key: metricKey || `metric_${index}`,
        label: metricMeta?.label || `Métrica ${index + 1}`,
        value: total,
        format: (metricMeta?.format || 'number') as 'number' | 'currency' | 'percentage' | 'decimal',
      };
    });
  }, [
    filteredRows,
    project?.source_type,
    sheetBigNumberColumns,
    sheetCpaMetricKey,
    sheetCpaLastClickMetricKey,
    sheetCpcMetricKey,
    sheetClicksMetricKey,
    sheetCtrMetricKey,
    sheetFrequencyMetricKey,
    sheetImpressionsMetricKey,
    sheetInvestmentMetricKey,
    sheetMetricOptions,
    sheetPurchasesLastClickMetricKey,
    sheetPurchasesMetricKey,
    sheetReachMetricKey,
    sheetRevenueMetricKey,
    sheetRoasLastClickMetricKey,
    sheetRoasMetricKey,
  ]);

  const metaWeeklyData = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];

    const byBucket = new Map<
      string,
      {
        bucket: string;
        spend: number;
        clicks: number;
        leads: number;
        purchases: number;
        purchase_value: number;
        impressions: number;
        reach: number;
        messages: number;
        profile_visits: number;
        instagram_follows: number;
        landing_views: number;
        checkout_views: number;
        video_views: number;
        actions_agg_map: Record<string, number>;
        action_values_agg_map: Record<string, number>;
      }
    >();

    for (const row of filteredRows as any[]) {
      const dateStr = String(row?.date || row?.date_start || '');
      const date = dateStr ? new Date(dateStr) : null;
      if (!date || isNaN(date.getTime())) continue;

      let key = '';
      if (viewMode === 'day') {
        const day = new Date(date);
        day.setHours(0, 0, 0, 0);
        key = format(day, 'yyyy-MM-dd');
      } else if (viewMode === 'month') {
        const month = startOfMonth(date);
        key = format(month, 'yyyy-MM');
      } else {
        const weekStart = startOfWeek(date, { weekStartsOn: 0 });
        key = format(weekStart, 'yyyy-MM-dd');
      }

      const current = byBucket.get(key) || {
        bucket: key,
        spend: 0,
        clicks: 0,
        leads: 0,
        purchases: 0,
        purchase_value: 0,
        impressions: 0,
        reach: 0,
        messages: 0,
        profile_visits: 0,
        instagram_follows: 0,
        landing_views: 0,
        checkout_views: 0,
        video_views: 0,
        actions_agg_map: {},
        action_values_agg_map: {},
      };
      current.spend += Number(row?.spend || 0);
      current.clicks += Number(row?.clicks || 0);
      current.leads += Number(row?.leads || 0);
      current.purchases += Number(row?.purchases || 0);
      current.purchase_value += Number(row?.purchase_value || 0);
      current.impressions += Number(row?.impressions || 0);
      current.reach += Number(row?.reach || 0);
      current.messages += Number(row?.messages || 0);
      current.profile_visits += Number(row?.profile_visits || 0);
      current.instagram_follows += Number(row?.instagram_follows || 0);
      current.landing_views += Number(row?.landing_views || 0);
      current.checkout_views += Number(row?.checkout_views || 0);
      current.video_views += Number(row?.thruplay || row?.video3s || 0);
      const actionsMap = (row?.actions_map || {}) as Record<string, number>;
      for (const [actionType, value] of Object.entries(actionsMap)) {
        current.actions_agg_map[actionType] = Number(current.actions_agg_map[actionType] || 0) + Number(value || 0);
      }
      const actionValuesMap = (row?.action_values_map || {}) as Record<string, number>;
      for (const [actionType, value] of Object.entries(actionValuesMap)) {
        current.action_values_agg_map[actionType] = Number(current.action_values_agg_map[actionType] || 0) + Number(value || 0);
      }
      byBucket.set(key, current);
    }

    const periodKeysFromFilter = getPeriodKeysFromDateRange(dateRange, viewMode);
    const orderedPeriodKeys =
      periodKeysFromFilter.length > 0 ? periodKeysFromFilter : Array.from(byBucket.keys()).sort((a, b) => a.localeCompare(b));

    const buckets = orderedPeriodKeys.map((bucketKey) => {
      const bucket = byBucket.get(bucketKey);
      if (bucket) return bucket;
      return {
        bucket: bucketKey,
        spend: 0,
        clicks: 0,
        leads: 0,
        purchases: 0,
        purchase_value: 0,
        impressions: 0,
        reach: 0,
        messages: 0,
        profile_visits: 0,
        instagram_follows: 0,
        landing_views: 0,
        checkout_views: 0,
        video_views: 0,
        actions_agg_map: {},
        action_values_agg_map: {},
      };
    });

    return buckets.map((b, i) => {
      const sales = b.purchases > 0 ? b.purchases : b.leads;
      const investment = b.spend;
      const revenue = b.purchase_value;
      const roas = investment > 0 ? revenue / investment : 0;
      const conversion = b.clicks > 0 ? (sales / b.clicks) * 100 : 0;
      const ctr = b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0;
      const cpc = b.clicks > 0 ? b.spend / b.clicks : 0;
      const cpm = b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0;
      const frequency = b.reach > 0 ? b.impressions / b.reach : 0;
      const periodDate =
        viewMode === 'month'
          ? new Date(`${b.bucket}-01T00:00:00`)
          : new Date(`${b.bucket}T00:00:00`);

      const label =
        viewMode === 'day'
          ? format(periodDate, "dd/MM")
          : viewMode === 'month'
            ? format(periodDate, "MMM/yy", { locale: ptBR })
            : `Sem ${i + 1}`;

      return {
        week: label,
        periodKey: b.bucket,
        periodSort: periodDate.getTime(),
        sales,
        investment,
        revenue,
        roas,
        conversion,
        impressions: b.impressions,
        reach: b.reach,
        clicks: b.clicks,
        leads: b.leads,
        messages: b.messages,
        profile_visits: b.profile_visits,
        instagram_follows: b.instagram_follows,
        purchases: b.purchases,
        ctr,
        cpc,
        cpm,
        frequency,
        landing_views: b.landing_views,
        checkout_views: b.checkout_views,
        video_views: b.video_views,
        actions_agg_map: b.actions_agg_map,
        action_values_agg_map: b.action_values_agg_map,
      };
    });
  }, [dateRange, filteredRows, project?.source_type, viewMode]);

  const paymentByAdId = useMemo(() => {
    const ads = (paymentAttributionSummaryQuery.data as any)?.ads || [];
    const map = new Map<string, { orders: number; netRevenue: number }>();
    for (const row of ads) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      map.set(id, {
        orders: Number(row?.orders || 0),
        netRevenue: Number(row?.netRevenue || 0),
      });
    }
    return map;
  }, [paymentAttributionSummaryQuery.data]);

  const metaCreativeData = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];
    const rows = metaAdsQuery.data || [];
    if (!rows.length) return [];

    const byAd = new Map<string, any>();
    for (const row of rows as any[]) {
      if (selectedCampaignIds.length > 0 && !selectedCampaignIds.includes(String(row?.campaign_id || ''))) continue;
      const id = String(row?.ad_id || row?.ad_name || '');
      if (!id) continue;
      const current = byAd.get(id) || {
        id,
        name: String(row?.ad_name || 'Anuncio'),
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        inline_link_clicks: 0,
        ctr: 0,
        landingViews: 0,
        checkoutViews: 0,
        landing_views: 0,
        checkout_views: 0,
        messages: 0,
        profile_visits: 0,
        instagram_follows: 0,
        purchases: 0,
        purchase_value: 0,
        video3s: 0,
        video15s: 0,
        thruplay: 0,
        roas: 0,
        cpc: 0,
        cpm: 0,
        frequency: 0,
        cpl: 0,
        cpa: 0,
        hook_rate: 0,
        hold_rate: 0,
        actions_map: {} as Record<string, number>,
        action_values_map: {} as Record<string, number>,
        sales: 0,
      };
      current.spend += Number(row?.spend || 0);
      current.impressions += Number(row?.impressions || 0);
      current.reach = Math.max(current.reach, Number(row?.reach || 0));
      current.clicks += Number(row?.clicks || 0);
      current.inline_link_clicks += Number(row?.inline_link_clicks || 0);
      current.landingViews += Number(row?.landing_views || 0);
      current.checkoutViews += Number(row?.checkout_views || 0);
      current.landing_views += Number(row?.landing_views || 0);
      current.checkout_views += Number(row?.checkout_views || 0);
      current.messages += Number(row?.messages || 0);
      current.profile_visits += Number(row?.profile_visits || 0);
      current.instagram_follows += Number(row?.instagram_follows || 0);
      current.purchases += Number(row?.purchases || 0);
      current.purchase_value += Number(row?.purchase_value || 0);
      current.video3s += Number(row?.video3s || 0);
      current.video15s += Number(row?.video15s || 0);
      current.thruplay += Number(row?.thruplay || 0);
      const actionsMap = (row?.actions_map || {}) as Record<string, number>;
      for (const [actionType, value] of Object.entries(actionsMap)) {
        current.actions_map[actionType] = Number(current.actions_map[actionType] || 0) + Number(value || 0);
      }
      const actionValuesMap = (row?.action_values_map || {}) as Record<string, number>;
      for (const [actionType, value] of Object.entries(actionValuesMap)) {
        current.action_values_map[actionType] = Number(current.action_values_map[actionType] || 0) + Number(value || 0);
      }
      current.sales += Number((row?.purchases && Number(row.purchases) > 0 ? row.purchases : row?.leads) || 0);
      byAd.set(id, current);
    }

    return Array.from(byAd.values())
      .map((a) => {
        const impressions = Number(a?.impressions || 0);
        const clicks = Number(a?.clicks || 0);
        const spend = Number(a?.spend || 0);
        const reach = Number(a?.reach || 0);
        const fallbackSales = Number(a?.sales || 0);
        const fallbackPurchases = Number(a?.purchases || 0);
        const fallbackPurchaseValue = Number(a?.purchase_value || 0);
        const paymentAgg = paymentByAdId.get(String(a?.id || ''));
        const purchases = paymentAgg && paymentAgg.orders > 0 ? paymentAgg.orders : fallbackPurchases;
        const purchaseValue = paymentAgg && paymentAgg.netRevenue > 0 ? paymentAgg.netRevenue : fallbackPurchaseValue;
        const sales = purchases > 0 ? purchases : fallbackSales;
        const video3s = Number(a?.video3s || 0);
        const video15s = Number(a?.video15s || 0);
        const thruplay = Number(a?.thruplay || 0);
        return {
          ...a,
          investment: spend,
          revenue: purchaseValue,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          frequency: reach > 0 ? impressions / reach : 0,
          roas: spend > 0 ? purchaseValue / spend : 0,
          cpl: sales > 0 ? spend / sales : 0,
          cpa: purchases > 0 ? spend / purchases : 0,
          hook_rate: impressions > 0 ? video3s / impressions : 0,
          hold_rate: impressions > 0 ? (video15s || thruplay) / impressions : 0,
        };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 50);
  }, [metaAdsQuery.data, paymentByAdId, project?.source_type, selectedCampaignIds]);

  const chartMetricOptions = useMemo(() => {
    if (project?.source_type === 'meta_ads') {
      return metaWeeklyMetricOptions.filter((option) => option.format !== 'link');
    }
    return sheetMetricOptions.filter((option) => option.format !== 'link');
  }, [metaWeeklyMetricOptions, project?.source_type, sheetMetricOptions]);

  const chartMetricColumns =
    project?.source_type === 'meta_ads' ? metaChartMetricColumns : sheetChartMetricColumns;
  const setChartMetricColumns =
    project?.source_type === 'meta_ads' ? setMetaChartMetricColumns : setSheetChartMetricColumns;

  const chartSeriesColumns = useMemo(() => {
    const available = chartMetricOptions.map((option) => option.key);
    if (available.length === 0) return [];
    const preferredDefaults =
      project?.source_type === 'meta_ads'
        ? ['investment', 'impressions', 'clicks', 'result']
        : available.slice(0, 4);
    const source = chartMetricColumns.length > 0 ? chartMetricColumns : preferredDefaults;
    const normalized = source
      .map((key, index) => (available.includes(key) ? key : preferredDefaults[index] || available[index] || available[0]))
      .filter(Boolean)
      .slice(0, 4);
    while (normalized.length < Math.min(4, available.length)) {
      normalized.push(available[normalized.length]);
    }
    return normalized;
  }, [chartMetricColumns, chartMetricOptions, project?.source_type]);

  React.useEffect(() => {
    if (chartSeriesColumns.length === 0) return;
    setChartMetricColumns((prev) => {
      if (prev.join('|') === chartSeriesColumns.join('|')) return prev;
      return chartSeriesColumns;
    });
  }, [chartSeriesColumns, setChartMetricColumns]);

  const trendRows = useMemo(() => {
    const baseRows = (project?.source_type === 'meta_ads' ? metaWeeklyData : sheetWeeklyData) as Array<Record<string, unknown>>;
    if (!baseRows.length || chartSeriesColumns.length === 0) return [];
    return baseRows.map((row) => {
      const seriesValues = chartSeriesColumns.reduce<Record<string, number>>((acc, metricKey) => {
        acc[metricKey] = getMetaMetricValue(row, metricKey);
        return acc;
      }, {});
      return {
        period: String(row.week ?? row.periodKey ?? ''),
        ...seriesValues,
      };
    });
  }, [chartSeriesColumns, metaWeeklyData, project?.source_type, sheetWeeklyData]);

  const trendChartConfig = useMemo(() => {
    return chartSeriesColumns.reduce<Record<string, { label: string; color: string }>>((acc, metricKey, index) => {
      const option = chartMetricOptions.find((metric) => metric.key === metricKey);
      acc[metricKey] = {
        label: option?.label || metricKey,
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      };
      return acc;
    }, {});
  }, [chartMetricOptions, chartSeriesColumns]);

  const creativeAdIds = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];
    return (metaCreativeData || []).map((c: any) => String(c?.id || '')).filter(Boolean);
  }, [metaCreativeData, project?.source_type]);

  const metaAdThumbnailsQuery = useQuery({
    queryKey: ['meta-ad-thumbnails', adAccountId, creativeAdIds],
    queryFn: async () => {
      if (!creativeAdIds.length) return {};
      const data = await invokeMeta('meta-api?action=ad-thumbnails', { adIds: creativeAdIds });
      return (data?.thumbnails || {}) as Record<string, { thumbnail: string | null; image: string | null }>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && creativeAdIds.length > 0,
  });

  const metaCreativeDataWithThumbs = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];
    const thumbs = metaAdThumbnailsQuery.data || {};
    return (metaCreativeData || []).map((row: any) => {
      const id = String(row?.id || '');
      const t = thumbs[id];
      const thumbUrl = t?.thumbnail || t?.image || undefined;
      return {
        ...row,
        thumbnail: thumbUrl,
        link: thumbUrl,
      };
    });
  }, [metaAdThumbnailsQuery.data, metaCreativeData, project?.source_type]);

  const distributionTopCreatives = useMemo(() => {
    if (project?.source_type === 'meta_ads') {
      return (metaCreativeDataWithThumbs || [])
        .slice(0, 8)
        .map((row: any) => ({
          ...row,
          name: String(row?.name || 'Criativo'),
          spend: getMetaMetricValue(row, 'investment'),
          impressions: getMetaMetricValue(row, 'impressions'),
          clicks: getMetaMetricValue(row, 'clicks'),
          profileVisits: getMetaMetricValue(row, 'profile_visits'),
          purchases: getMetaMetricValue(row, 'purchases'),
          checkouts: getMetaMetricValue(row, 'checkout_views'),
          ctr: getMetaMetricValue(row, 'ctr'),
          cpc: getMetaMetricValue(row, 'cpc'),
          cpm: getMetaMetricValue(row, 'cpm'),
          roas: getMetaMetricValue(row, 'roas'),
          link: String(row?.link || ''),
          thumbnail: String(row?.thumbnail || ''),
        }));
    }
    return (sheetDistributionData?.topCreatives || []) as Array<{
      name: string;
      spend: number;
      revenue?: number;
      reach?: number;
      impressions: number;
      clicks: number;
      video3s?: number;
      thruplay?: number;
      profileVisits: number;
      purchases: number;
      checkouts: number;
      frequency?: number;
      ctr: number;
      cpc?: number;
      cpm?: number;
      roas?: number;
      cpa?: number;
      metrics?: Record<string, number>;
      link?: string;
      thumbnail?: string;
    }>;
  }, [metaCreativeDataWithThumbs, project?.source_type, sheetDistributionData?.topCreatives]);

  const distributionCreativeMetricOptions = useMemo(() => {
    if (project?.source_type === 'meta_ads') {
      return metaWeeklyMetricOptions.filter((option) => option.format !== 'link');
    }
    const computed = [
      { key: 'investment', label: 'Investimento', format: 'currency' as const },
      { key: 'reach', label: 'Alcance', format: 'number' as const },
      { key: 'impressions', label: 'Impressoes', format: 'number' as const },
      { key: 'frequency', label: 'Frequencia', format: 'percentage' as const },
      { key: 'clicks', label: 'Cliques', format: 'number' as const },
      { key: 'video3s', label: 'Visualizacoes 3s', format: 'number' as const },
      { key: 'thruplay', label: 'Thruplay', format: 'number' as const },
      { key: 'profile_visits', label: 'Visitas Perfil', format: 'number' as const },
      { key: 'ctr', label: 'CTR', format: 'percentage' as const },
      { key: 'cpc', label: 'CPC', format: 'currency' as const },
      { key: 'revenue', label: 'Faturamento', format: 'currency' as const },
      { key: 'cpa', label: 'Custo por Compra', format: 'currency' as const },
      { key: 'roas', label: 'ROAS', format: 'decimal' as const },
    ];
    const dynamic = distributionSheetMetricOptions.filter((metric) => {
      const normalized = normalizeMetricName(metric.key);
      if (!normalized) return false;
      if (/\b(roas real|website purchase roas|purchase roas|roas)\b/.test(normalized)) return false;
      if (/\b(cpa|cost per purchase|custo por compra|custo por venda)\b/.test(normalized)) return false;
      if (/\b(revenue|faturamento|purchase value|valor de compra|valor de compras)\b/.test(normalized)) return false;
      if (/\b(cpc|cost per click|custo por clique)\b/.test(normalized)) return false;
      if (/\b(ctr|click through rate|clickthrough rate|taxa de clique)\b/.test(normalized)) return false;
      if (/\b(frequency|frequencia)\b/.test(normalized)) return false;
      if (/\b(spend|amount spent|investimento|investment|cost)\b/.test(normalized)) return false;
      if (/\b(reach|alcance)\b/.test(normalized)) return false;
      if (/\b(impressions|impressoes)\b/.test(normalized)) return false;
      if (/\b(action link clicks|inline link clicks|link clicks|clicks|cliques)\b/.test(normalized)) return false;
      return true;
    });
    return [...computed, ...dynamic];
  }, [distributionSheetMetricOptions, metaWeeklyMetricOptions, project?.source_type]);

  const distributionCreativeColumns = useMemo(() => {
    const available = new Set(distributionCreativeMetricOptions.map((option) => option.key));
    const normalized = distributionCreativeMetricColumns
      .map((key) => String(key))
      .filter((key) => available.has(key))
      .slice(0, 5);
    const defaults = ['investment', 'impressions', 'clicks', 'ctr', 'cpc'].filter((key) => available.has(key));
    const merged = [...normalized];
    for (const fallbackKey of defaults) {
      if (merged.length >= 5) break;
      merged.push(fallbackKey);
    }
    return merged.slice(0, 5);
  }, [distributionCreativeMetricColumns, distributionCreativeMetricOptions]);

  const setDistributionCreativeColumnAtIndex = (index: number, value: string) => {
    setDistributionCreativeMetricColumns((prev) => {
      const defaults = ['investment', 'impressions', 'clicks', 'ctr', 'cpc'];
      const next = [...prev];
      while (next.length < 5) {
        next.push(defaults[next.length] || defaults[0]);
      }
      next[index] = value;
      return next.slice(0, 5);
    });
  };

  const formatDistributionMetricValue = (value: number, formatType: 'number' | 'currency' | 'percentage' | 'decimal') => {
    switch (formatType) {
      case 'currency':
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'decimal':
        return value.toFixed(2);
      default:
        return Math.round(value).toLocaleString('pt-BR');
    }
  };

  const metaFunnelData = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];
    const totals = (filteredRows as any[]).reduce(
      (acc, r) => {
        acc.impressions += Number(r?.impressions || 0);
        acc.clicks += Number(r?.clicks || 0);
        acc.leads += Number(r?.leads || 0);
        acc.purchases += Number(r?.purchases || 0);
        acc.landingViews += Number(r?.landing_views || 0);
        acc.checkoutViews += Number(r?.checkout_views || 0);
        return acc;
      },
      { impressions: 0, clicks: 0, leads: 0, purchases: 0, landingViews: 0, checkoutViews: 0 }
    );

    const steps: { label: string; value: number }[] = [
      { label: 'Impressões', value: totals.impressions },
      { label: 'Cliques', value: totals.clicks },
    ];
    if (totals.landingViews > 0) steps.push({ label: 'LP Views', value: totals.landingViews });
    if (totals.checkoutViews > 0) steps.push({ label: 'Checkout', value: totals.checkoutViews });
    if (totals.leads > 0) steps.push({ label: 'Leads', value: totals.leads });
    if (totals.purchases > 0) steps.push({ label: 'Compras', value: totals.purchases });
    return steps;
  }, [filteredRows, project?.source_type]);

  const metaTotalsRow = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return null;

    const aggregateMetaTotals = (
      rows: any[],
      extra: Record<string, unknown> = {},
      paymentSummary?: { orders?: number; netRevenue?: number },
    ) => {
      const totals = rows.reduce(
        (acc, r) => {
          acc.spend += Number(r?.spend || 0);
          acc.impressions += Number(r?.impressions || 0);
          acc.clicks += Number(r?.clicks || 0);
          acc.inline_link_clicks += Number(r?.inline_link_clicks || 0);
          acc.leads += Number(r?.leads || 0);
          acc.messages += Number(r?.messages || 0);
          acc.purchases += Number(r?.purchases || 0);
          acc.purchase_value += Number(r?.purchase_value || 0);
          acc.landing_views += Number(r?.landing_views || 0);
          acc.checkout_views += Number(r?.checkout_views || 0);
          acc.video3s += Number(r?.video3s || 0);
          acc.video15s += Number(r?.video15s || 0);
          acc.thruplay += Number(r?.thruplay || 0);
          acc.reach = Math.max(acc.reach, Number(r?.reach || 0));
          return acc;
        },
        {
          spend: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          inline_link_clicks: 0,
          leads: 0,
          messages: 0,
          profile_visits: 0,
          instagram_follows: 0,
          purchases: 0,
          purchase_value: 0,
          landing_views: 0,
          checkout_views: 0,
          video3s: 0,
          video15s: 0,
          thruplay: 0,
        }
      );

      const spend = totals.spend;
      const impressions = totals.impressions;
      const reach = totals.reach;
      const clicks = totals.clicks;
      const leads = totals.leads;
      const purchases = totals.purchases;
      const purchaseValue = totals.purchase_value;
      const video3s = totals.video3s;
      const video15s = totals.video15s;
      const thruplay = totals.thruplay;
      const paymentOrders = Number(paymentSummary?.orders || 0);
      const paymentRevenue = Number(paymentSummary?.netRevenue || 0);
      const effectivePurchases = paymentOrders > 0 ? paymentOrders : purchases;
      const effectivePurchaseValue = paymentRevenue > 0 ? paymentRevenue : purchaseValue;

      return {
        ...totals,
        purchases: effectivePurchases,
        purchase_value: effectivePurchaseValue,
        frequency: reach > 0 ? impressions / reach : 0,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpl: leads > 0 ? spend / leads : 0,
        cpa: effectivePurchases > 0 ? spend / effectivePurchases : 0,
        roas: spend > 0 ? effectivePurchaseValue / spend : 0,
        hook_rate: impressions > 0 ? video3s / impressions : 0,
        hold_rate: impressions > 0 ? (video15s || thruplay) / impressions : 0,
        ...extra,
      };
    };

    const paymentSummary = (paymentAttributionSummaryQuery.data as any)?.summary || undefined;

    if (selectedCampaignIds.length > 0) {
      const campaignTotals = (metaCampaignTotalsQuery.data || []) as any[];
      const selectedSet = new Set(selectedCampaignIds.map((id) => String(id)));
      const filtered = campaignTotals.filter((r) => selectedSet.has(String(r?.campaign_id || '')));
      const selectedNames = (metaCampaignsQuery.data || [])
        .filter((c: any) => selectedSet.has(String(c?.id || '')))
        .map((c: any) => String(c?.name || ''))
        .filter(Boolean);
      const campaignName = selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames.length} campanhas`;
      if (!filtered.length) return null;
      return aggregateMetaTotals(
        filtered,
        { campaign_id: selectedCampaignIds.join(','), campaign_name: campaignName },
        paymentSummary,
      );
    }

    const accountTotals = (metaAccountTotalsQuery.data || []) as any[];
    if (!accountTotals.length) return null;
    return aggregateMetaTotals(accountTotals, {}, paymentSummary);
  }, [
    metaAccountTotalsQuery.data,
    metaCampaignTotalsQuery.data,
    metaCampaignsQuery.data,
    paymentAttributionSummaryQuery.data,
    project?.source_type,
    selectedCampaignIds,
  ]);

  const metaFunnelSteps = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];
    const r: any = metaTotalsRow;
    if (!r) return [];

    const impressions = Number(r?.impressions || 0);
    const reach = Number(r?.reach || 0) || (Number(r?.frequency || 0) > 0 ? Math.round(impressions / Number(r.frequency)) : 0);
    const clicks = Number(r?.clicks || 0);
    const lp = Number(r?.landing_views || 0);
    const leads = Number(r?.leads || 0);
    const rawMessages = Number(r?.messages || 0);
    // Backwards-compatible fallback: older deployments might count messaging inside "leads".
    const messages = rawMessages > 0 ? rawMessages : (leads > 0 ? leads : 0);
    const checkout = Number(r?.checkout_views || 0);
    const purchases = Number(r?.purchases || 0);
    const revenue = Number(r?.purchase_value || 0);
    const spend = Number(r?.spend || 0);

    const rate = (num: number, den: number) => (den > 0 ? num / den : 0);

    if (funnelType === 'mensagem') {
      return [
        { label: 'Impressões', value: impressions },
        { label: 'Alcance', value: reach, badges: [{ label: 'Reach rate', kind: 'percentage', value: rate(reach, impressions) }] },
        { label: 'Cliques', value: clicks, badges: [{ label: 'CTR', kind: 'percentage', value: rate(clicks, impressions) }] },
        { label: 'Mensagens', value: messages, badges: [{ label: 'Taxa de mensagem', kind: 'percentage', value: rate(messages, clicks) }] },
      ];
    }

    if (funnelType === 'conversao') {
      return [
        { label: 'Impressões', value: impressions },
        { label: 'Alcance', value: reach, badges: [{ label: 'Reach rate', kind: 'percentage', value: rate(reach, impressions) }] },
        { label: 'Cliques', value: clicks, badges: [{ label: 'CTR', kind: 'percentage', value: rate(clicks, impressions) }] },
        { label: 'Visualizações da página', value: lp, badges: [{ label: 'Connect rate', kind: 'percentage', value: rate(lp, clicks) }] },
        { label: 'Início de checkout', value: checkout, badges: [{ label: 'Checkout rate', kind: 'percentage', value: rate(checkout, lp) }] },
        { label: 'Vendas', value: purchases, badges: [{ label: 'Taxa de compra', kind: 'percentage', value: rate(purchases, checkout) }] },
        {
          label: 'Total vendido',
          value: revenue,
          format: 'currency',
          barValue: purchases > 0 ? purchases : 1,
          badges: [
            { label: 'ROAS', kind: 'decimal', value: spend > 0 ? revenue / spend : 0 },
            { label: 'ROI', kind: 'percentage', value: spend > 0 ? (revenue - spend) / spend : 0 },
          ],
        },
      ];
    }

    // captação (default)
    const leadsWithFallback = leads > 0 ? leads : rawMessages;
    return [
      { label: 'Impressões', value: impressions },
      { label: 'Alcance', value: reach, badges: [{ label: 'Reach rate', kind: 'percentage', value: rate(reach, impressions) }] },
      { label: 'Cliques', value: clicks, badges: [{ label: 'CTR', kind: 'percentage', value: rate(clicks, impressions) }] },
      { label: 'Visualizações da página', value: lp, badges: [{ label: 'Connect rate', kind: 'percentage', value: rate(lp, clicks) }] },
      { label: 'Leads', value: leadsWithFallback, badges: [{ label: 'Taxa de conversão', kind: 'percentage', value: rate(leadsWithFallback, lp) }] },
    ];
  }, [funnelType, metaTotalsRow, project?.source_type]);

  const metaDistributionData = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return null;
    const r: any = metaTotalsRow;

    const reachFromField = Number(r?.reach || 0);
    const freq = Number(r?.frequency || 0);
    const imps = Number(r?.impressions || 0);
    const totalReach =
      reachFromField > 0
        ? reachFromField
        : (freq > 0 && imps > 0 ? Math.round(imps / freq) : 0);
    const totalImpressions = Number(r?.impressions || 0);
    const avgEngagement = Number(r?.ctr || 0); // using CTR as engagement proxy for ads
    const clicks = Number(r?.clicks || 0);
    const ctr = totalImpressions > 0 ? (clicks / totalImpressions) * 100 : Number(r?.ctr || 0);

    const videoViewsRaw = Number(r?.thruplay || 0) || Number(r?.video3s || 0);
    const videoViews = Number.isFinite(videoViewsRaw) ? videoViewsRaw : 0;
    const video3s = Number(r?.video3s || 0);
    const thruplay = Number(r?.thruplay || 0);

    const followersGained = Number(r?.instagram_follows || 0);
    const spend = Number(r?.spend || 0);
    const purchases = Number(r?.purchases || 0);
    const checkouts = Number(r?.checkout_views || 0);
    const purchaseValue = Number(r?.purchase_value || 0);
    const roas = spend > 0 ? purchaseValue / spend : Number(r?.roas || 0);
    const roi = spend > 0 ? (purchaseValue - spend) / spend : 0;
    const frequency = totalReach > 0 ? totalImpressions / totalReach : Number(r?.frequency || 0);
    const cpc = clicks > 0 ? spend / clicks : Number(r?.cpc || 0);
    const profileVisits = Number(r?.profile_visits || 0);

    const platformRows = (metaPlatformBreakdownQuery.data || []) as any[];
    const byPlatform = new Map<string, { reach: number; impressions: number; clicks: number }>();
    for (const row of platformRows) {
      const platform = String(row?.publisher_platform || 'Outros');
      const current = byPlatform.get(platform) || { reach: 0, impressions: 0, clicks: 0 };
      const rowImps = Number(row?.impressions || 0);
      const rowFreq = Number(row?.frequency || 0);
      const rowReachField = Number(row?.reach || 0);
      const rowReach = rowReachField > 0 ? rowReachField : (rowFreq > 0 && rowImps > 0 ? Math.round(rowImps / rowFreq) : 0);
      current.reach += rowReach;
      current.impressions += rowImps;
      current.clicks += Number(row?.clicks || 0);
      byPlatform.set(platform, current);
    }

    const platformBreakdown = Array.from(byPlatform.entries())
      .map(([platform, v]) => ({
        platform,
        reach: v.reach,
        engagement: v.impressions > 0 ? v.clicks / v.impressions : 0,
      }))
      .sort((a, b) => b.reach - a.reach);

    return {
      totalReach,
      totalImpressions,
      avgEngagement,
      clicks,
      ctr,
      cpc,
      frequency,
      videoViews,
      video3s,
      thruplay,
      followersGained,
      spend,
      revenue: purchaseValue,
      roas,
      cpa: purchases > 0 ? spend / purchases : 0,
      checkouts,
      purchases,
      profileVisits,
      costPerProfileVisit: profileVisits > 0 ? spend / profileVisits : 0,
      platformBreakdown,
    };
  }, [metaPlatformBreakdownQuery.data, metaTotalsRow, project?.source_type]);

  const metaBigNumbers = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];
    const r: any = metaTotalsRow;
    if (!r) return [];

    const spend = Number(r?.spend || 0);
    const impressions = Number(r?.impressions || 0);
    const clicks = Number(r?.clicks || 0);
    const leads = Number(r?.leads || 0);
    const purchases = Number(r?.purchases || 0);
    const purchaseValue = Number(r?.purchase_value || 0);

    const resultsLabel = purchases > 0 ? 'Compras' : 'Leads';
    const results = purchases > 0 ? purchases : leads;
    const costPerResult = results > 0 ? spend / results : 0;
    const roas = spend > 0 ? purchaseValue / spend : Number(r?.roas || 0);
    const roi = spend > 0 ? (purchaseValue - spend) / spend : 0;

    return [
      { label: 'Investimento', value: spend, format: 'currency' as const },
      { label: 'Impressões', value: impressions, format: 'number' as const },
      { label: 'Cliques', value: clicks, format: 'number' as const },
      { label: resultsLabel, value: results, format: 'number' as const },
      { label: purchases > 0 ? 'CPA' : 'CPL', value: costPerResult, format: 'currency' as const },
      { label: 'ROAS', value: roas, format: 'decimal' as const },
      { label: 'ROI', value: roi, format: 'percentage' as const },
    ];
  }, [metaTotalsRow, project?.source_type]);

  const bigNumbersToRender =
    project?.source_type === 'meta_ads'
      ? metaBigNumbers
      : (sheetBigNumbers.length > 0 ? sheetBigNumbers : processedData.bigNumbers);

  const isLoading =
    loadingProject ||
    (loadingMappings && !(shareToken && initialMappings)) ||
    allSheetsQuery.isLoading ||
    metaInsightsQuery.isLoading ||
    metaAccountInsightsQuery.isLoading ||
    metaAccountTotalsQuery.isLoading ||
    metaCampaignTotalsQuery.isLoading ||
    metaPlatformBreakdownQuery.isLoading ||
    metaAdsQuery.isLoading ||
    paymentAttributionSummaryQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Carregando dados do dashboard...</p>
      </div>
    );
  }

  const handleReconnectGoogle = async () => {
    setIsReconnecting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Reconnect failed:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  // Show reconnect prompt if Google token expired
  if (googleReconnectRequired && !shareToken) {
    return (
      <div className="container py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Reconexão Necessária</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-4">
              Sua conexão com o Google expirou. Reconecte sua conta para acessar os dados das planilhas.
            </p>
            <Button onClick={handleReconnectGoogle} disabled={isReconnecting}>
              {isReconnecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reconectar Conta Google
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (allSheetsQuery.error) {
    return (
      <div className="container py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar dados</AlertTitle>
          <AlertDescription>
            Não foi possível acessar as planilhas do Google. Verifique as permissões.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const setupWarnings = (() => {
    const warnings: { title: string; description: string }[] = [];

    if (!project) {
      warnings.push({
        title: 'Projeto não carregado',
        description: 'Não foi possível carregar as informações do projeto.',
      });
      return warnings;
    }

    if (project.source_type === 'meta_ads') {
      if (!adAccountId) {
        warnings.push({
          title: 'Meta Ads não configurado',
          description: 'Conecte a Meta e selecione uma conta de anúncios para começar a puxar dados.',
        });
      } else if (
        !metaCampaignsQuery.isLoading &&
        metaCampaignsQuery.error &&
        !String((metaCampaignsQuery.error as any)?.message || '').toLowerCase().includes('invalid action')
      ) {
        warnings.push({
          title: 'Falha ao carregar campanhas',
          description: 'Não foi possível listar campanhas dessa conta. Confirme se a Edge Function `meta-api` foi redeployada e tente novamente.',
        });
      } else if (!shareToken && !metaAccountInsightsQuery.isLoading && (metaAccountInsightsQuery.data || []).length === 0) {
        warnings.push({
          title: 'Sem dados da Meta no período',
          description: 'Tente ampliar o período ou verifique se a conta tem campanhas/entregas.',
        });
      }
      return warnings;
    }

    if (!project.spreadsheet_id) {
      warnings.push({
        title: 'Planilha não configurada',
        description: 'Selecione uma planilha do Google para começar a puxar dados.',
      });
    } else if (sheetNames.length === 0) {
      warnings.push({
        title: 'Abas não selecionadas',
        description: 'Selecione ao menos uma aba da planilha para ler os dados.',
      });
    }
    if (project.spreadsheet_id && sheetNames.length > 0 && sourceRows.length === 0 && !allSheetsQuery.isLoading) {
      warnings.push({
        title: 'Nenhum dado encontrado',
        description: `As abas selecionadas (${sheetNames.join(', ')}) estão vazias, inacessíveis ou em um formato não esperado.`,
      });
    }

    return warnings;
  })();

  return (
    <div className="container py-6">
      {setupWarnings.length > 0 && (
        <div className="mb-6 space-y-3">
          {setupWarnings.map((w) => (
            <Alert key={w.title}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{w.title}</AlertTitle>
              <AlertDescription>{w.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
      {/* Filters */}
      <DashboardFilters
        selectedCreative={selectedCreative}
        onCreativeChange={setSelectedCreative}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        campaigns={campaignOptions}
        campaignsLoading={project?.source_type === 'meta_ads' ? metaCampaignsQuery.isLoading : false}
        selectedCampaignIds={selectedCampaignIds}
        onCampaignChange={(ids) => setSelectedCampaignIds(ids)}
        viewMode={viewMode}
        onViewModeChange={(v) => setViewMode(v)}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="perpetua">Perpétua</TabsTrigger>
          <TabsTrigger value="descoberta">Descoberta</TabsTrigger>
          <TabsTrigger value="consideracao">Consideracao</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <TabsContent value="perpetua" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Big Numbers */}
              {bigNumbersToRender.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Indicadores Principais</h3>
                  {project?.source_type !== 'meta_ads' && sheetMetricOptions.length > 0 && (
                    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                      {sheetBigNumberColumns.slice(0, 8).map((metricKey, index) => (
                        <Select
                          key={`sheet-big-number-${index}`}
                          value={metricKey}
                          onValueChange={(value) =>
                            setSheetBigNumberColumns((prev) => {
                              const next = [...prev];
                              next[index] = value;
                              return next;
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={`Métrica ${index + 1}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {sheetMetricOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                    {bigNumbersToRender.map((kpi, index) => {
                      const { label, value, format } = kpi;
                      const previousValue = 'previousValue' in kpi ? (kpi as any).previousValue : undefined;
                      return (
                        <BigNumberCard
                          key={label}
                          label={label}
                          value={value}
                          previousValue={previousValue}
                          format={format}
                          delay={index * 0.1}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {trendRows.length > 0 && chartMetricOptions.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Gráficos de Tendência</h3>
                  <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {chartSeriesColumns.slice(0, 4).map((metricKey, index) => (
                      <Select
                        key={`chart-metric-${index}`}
                        value={metricKey}
                        onValueChange={(value) =>
                          setChartMetricColumns((prev) => {
                            const next = [...prev];
                            next[index] = value;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={`Métrica ${index + 1}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {chartMetricOptions.map((option) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ))}
                  </div>
                  <div className="h-[320px] rounded-lg border p-2">
                    <ChartContainer config={trendChartConfig} className="h-full w-full">
                      <LineChart data={trendRows} margin={{ left: 8, right: 8, top: 16, bottom: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={24} />
                        {chartSeriesColumns.slice(0, 4).map((metricKey, index) => (
                          <YAxis
                            key={`y-${metricKey}`}
                            yAxisId={`y-${index}`}
                            tickLine={false}
                            axisLine={false}
                            width={index === 0 ? 80 : 0}
                            hide={index !== 0}
                            domain={['auto', 'auto']}
                          />
                        ))}
                        <ChartTooltip content={<ChartTooltipContent />} />
                        {chartSeriesColumns.slice(0, 4).map((metricKey, index) => (
                          <Line
                            key={metricKey}
                            type="monotone"
                            dataKey={metricKey}
                            yAxisId={`y-${index}`}
                            stroke={`hsl(var(--chart-${(index % 5) + 1}))`}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ChartContainer>
                  </div>
                </section>
              )}

              {/* Weekly Comparison */}
              {(project?.source_type === 'meta_ads' ? metaWeeklyData.length > 0 : sheetWeeklyData.length > 0) && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">
                    {viewMode === 'day' ? 'Visão Diária' : viewMode === 'month' ? 'Visão Mensal' : 'Visão Semanal'}
                  </h3>
                  <WeeklyComparisonTable
                    data={project?.source_type === 'meta_ads' ? (metaWeeklyData as any) : (sheetWeeklyData as any)}
                    isMeta
                    viewMode={viewMode}
                    onViewModeChange={(v) => setViewMode(v)}
                    metricOptions={project?.source_type === 'meta_ads' ? (metaWeeklyMetricOptions as any) : (sheetMetricOptions as any)}
                    defaultMetricColumns={project?.source_type === 'meta_ads' ? ['result', 'impressions', 'reach', 'cpc', 'ctr'] : sheetDefaultWeeklyColumns}
                    metricColumns={project?.source_type === 'meta_ads' ? weeklyMetricColumns : sheetWeeklyMetricColumns}
                    onMetricColumnsChange={project?.source_type === 'meta_ads' ? setWeeklyMetricColumns : setSheetWeeklyMetricColumns}
                  />
                </section>
              )}

              {/* Creative Performance */}
              {(project?.source_type === 'meta_ads' ? metaCreativeDataWithThumbs.length > 0 : sheetCreativeData.length > 0) && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Performance por Criativo</h3>
                  <CreativePerformanceTable
                    data={project?.source_type === 'meta_ads' ? (metaCreativeDataWithThumbs as any) : (sheetCreativeData as any)}
                    selectedCreative={selectedCreative}
                    onCreativeSelect={setSelectedCreative}
                    isMeta
                    metricOptions={project?.source_type === 'meta_ads' ? (metaWeeklyMetricOptions as any) : (sheetCreativeMetricOptions as any)}
                    defaultMetricColumns={project?.source_type === 'meta_ads' ? ['post_engagement', 'hook_rate', 'hold_rate', 'cpc', 'cost_per_result'] : sheetDefaultWeeklyColumns}
                    metricColumns={project?.source_type === 'meta_ads' ? creativeMetricColumns : sheetCreativeMetricColumns}
                    onMetricColumnsChange={project?.source_type === 'meta_ads' ? setCreativeMetricColumns : setSheetCreativeMetricColumns}
                  />
                </section>
              )}

              {/* Funnel */}
              {(project?.source_type === 'meta_ads' ? metaFunnelSteps.length > 0 : processedData.funnelData.length > 0) && (
                <section>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Funil de Conversao</h3>
                    {project?.source_type === 'meta_ads' && (
                      <Select value={funnelType} onValueChange={(v) => setFunnelType(v as any)}>
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Tipo de funil" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="captacao">Captação</SelectItem>
                          <SelectItem value="mensagem">Mensagem</SelectItem>
                          <SelectItem value="conversao">Conversão</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <FunnelVisualization data={project?.source_type === 'meta_ads' ? (metaFunnelSteps as any) : processedData.funnelData} />
                </section>
              )}

              {bigNumbersToRender.length === 0 && !allSheetsQuery.error && (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    {filteredRows.length === 0
                      ? 'Nenhum dado encontrado para os filtros selecionados.'
                      : 'Nenhuma métrica configurada para esta aba.'}
                  </p>
                  {filteredRows.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDateRange(undefined);
                        setSelectedCreative(null);
                      }}
                    >
                      Limpar Filtros
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="descoberta" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {project?.source_type !== 'meta_ads' && (
                <section>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">Visao de Descoberta</h3>
                    <Select value={distributionPhase} onValueChange={(value) => setDistributionPhase(value as any)}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Fase da campanha" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as fases</SelectItem>
                        <SelectItem value="descoberta">Descoberta</SelectItem>
                        <SelectItem value="consideracao">Consideração</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </section>
              )}
              <section>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <BigNumberCard
                    label="Investimento"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.spend || 0) : (sheetDistributionData?.spend || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="Alcance"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.totalReach || 0) : (sheetDistributionData?.totalReach || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Impressoes"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.totalImpressions || 0) : (sheetDistributionData?.totalImpressions || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Frequencia"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.frequency || 0) : (sheetDistributionData?.frequency || 0)}
                    format="percentage"
                  />
                  <BigNumberCard
                    label="Cliques no Link"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.clicks || 0) : (sheetDistributionData?.totalLinkClicks || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="CPC"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.cpc || 0) : (sheetDistributionData?.cpc || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="CTR"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.ctr || 0) : (sheetDistributionData?.ctr || 0)}
                    format="percentage"
                  />
                  <BigNumberCard
                    label="Views de Video 3s"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.video3s || 0) : (sheetDistributionData?.videoViews3s || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Thruplay"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.thruplay || 0) : (sheetDistributionData?.thruplayViews || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Visitas ao Perfil"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.profileVisits || 0) : (sheetDistributionData?.profileVisits || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Faturamento"
                    value={project?.source_type === 'meta_ads' ? ((metaDistributionData as any)?.revenue || 0) : ((sheetDistributionData as any)?.revenue || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="Custo por Compra"
                    value={project?.source_type === 'meta_ads' ? ((metaDistributionData as any)?.cpa || 0) : ((sheetDistributionData as any)?.cpa || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="Posts com Permalink"
                    value={project?.source_type === 'meta_ads' ? 0 : (sheetDistributionData?.permalinkCount || 0)}
                    format="number"
                  />
                </div>
              </section>

              {(project?.source_type === 'meta_ads'
                ? (metaDistributionData?.platformBreakdown || []).length > 0
                : (sheetDistributionData?.platformBreakdown || []).length > 0) && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Breakdown por Plataforma</h3>
                  <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Plataforma</th>
                          <th className="px-4 py-3 text-right font-medium">Alcance</th>
                          <th className="px-4 py-3 text-right font-medium">Engajamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(project?.source_type === 'meta_ads'
                          ? (metaDistributionData?.platformBreakdown || [])
                          : (sheetDistributionData?.platformBreakdown || [])
                        ).map((item) => (
                          <tr key={item.platform} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium capitalize">{item.platform}</td>
                            <td className="px-4 py-3 text-right">{item.reach.toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3 text-right">{(item.engagement * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {distributionTopCreatives.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Melhores Criativos</h3>
                  <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Criativo</th>
                          <th className="px-4 py-3 text-left font-medium">Link / Prévia</th>
                          {distributionCreativeColumns.map((metricKey, index) => {
                            const option = distributionCreativeMetricOptions.find((item) => item.key === metricKey);
                            return (
                              <th key={`${metricKey}-${index}`} className="px-4 py-3 text-right font-medium">
                                <Select
                                  value={metricKey}
                                  onValueChange={(value) => setDistributionCreativeColumnAtIndex(index, value)}
                                >
                                  <SelectTrigger className="h-8 w-[160px] text-xs ml-auto">
                                    <SelectValue placeholder={option?.label || 'Métrica'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {distributionCreativeMetricOptions.map((item) => (
                                      <SelectItem key={item.key} value={item.key}>
                                        {item.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {distributionTopCreatives.map((item) => (
                          <tr key={item.name} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium">{item.name}</td>
                            <td className="px-4 py-3">
                              {item.link ? (
                                <div className="flex items-center gap-2">
                                  {item.thumbnail || getInstagramThumbnailFromLink(item.link) ? (
                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                      <img
                                        src={item.thumbnail || getInstagramThumbnailFromLink(item.link)}
                                        alt={item.name}
                                        className="h-8 w-8 rounded object-cover border"
                                        loading="lazy"
                                        onError={(event) => {
                                          event.currentTarget.style.display = 'none';
                                          event.currentTarget.parentElement?.querySelector('.fallback-thumb')?.classList.remove('hidden');
                                        }}
                                      />
                                    </a>
                                  ) : (
                                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center border">
                                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="fallback-thumb hidden h-8 w-8 rounded bg-muted items-center justify-center border">
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Ver post
                                  </a>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Sem link</span>
                              )}
                            </td>
                            {distributionCreativeColumns.map((metricKey, metricIndex) => {
                              const option = distributionCreativeMetricOptions.find((entry) => entry.key === metricKey);
                              const raw = project?.source_type === 'meta_ads'
                                ? getMetaMetricValue(item as Record<string, unknown>, metricKey)
                                : (() => {
                                    switch (metricKey) {
                                      case 'investment':
                                        return Number(item.spend || 0);
                                      case 'reach':
                                        return Number(item.reach || 0);
                                      case 'impressions':
                                        return Number(item.impressions || 0);
                                      case 'frequency':
                                        return Number(item.frequency || 0);
                                      case 'clicks':
                                        return Number(item.clicks || 0);
                                      case 'video3s':
                                        return Number(item.video3s || 0);
                                      case 'thruplay':
                                        return Number(item.thruplay || 0);
                                      case 'profile_visits':
                                        return Number(item.profileVisits || 0);
                                      case 'checkout_views':
                                        return Number(item.checkouts || 0);
                                      case 'purchases':
                                        return Number(item.purchases || 0);
                                      case 'ctr':
                                        return Number(item.ctr || 0);
                                      case 'cpc':
                                        return Number(item.cpc || 0);
                                      case 'cpm':
                                        return Number(item.cpm || 0);
                                      case 'revenue':
                                        return Number(item.revenue || 0);
                                      case 'cpa':
                                        return Number(item.cpa || 0);
                                      case 'roas':
                                        return Number(item.roas || 0);
                                      case 'roi': {
                                        const spend = Number(item.spend || 0);
                                        const roas = Number(item.roas || 0);
                                        const revenue = roas > 0 ? roas * spend : 0;
                                        return spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
                                      }
                                      default:
                                        return Number((item.metrics && item.metrics[metricKey]) || 0);
                                    }
                                  })();
                              return (
                                <td key={`${item.name}-${metricKey}-${metricIndex}`} className="px-4 py-3 text-right">
                                  {formatDistributionMetricValue(raw, (option?.format === 'link' ? 'number' : option?.format) || 'number')}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </motion.div>
          </TabsContent>

<TabsContent value="consideracao" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {project?.source_type !== 'meta_ads' && (
                <section>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">Visao de Consideracao</h3>
                    <Select value={distributionPhase} onValueChange={(value) => setDistributionPhase(value as any)}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Fase da campanha" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as fases</SelectItem>
                        <SelectItem value="descoberta">Descoberta</SelectItem>
                        <SelectItem value="consideracao">Consideração</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </section>
              )}
              <section>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <BigNumberCard
                    label="Investimento"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.spend || 0) : (sheetDistributionData?.spend || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="Alcance"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.totalReach || 0) : (sheetDistributionData?.totalReach || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Impressoes"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.totalImpressions || 0) : (sheetDistributionData?.totalImpressions || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Frequencia"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.frequency || 0) : (sheetDistributionData?.frequency || 0)}
                    format="percentage"
                  />
                  <BigNumberCard
                    label="Cliques no Link"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.clicks || 0) : (sheetDistributionData?.totalLinkClicks || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="CPC"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.cpc || 0) : (sheetDistributionData?.cpc || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="CTR"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.ctr || 0) : (sheetDistributionData?.ctr || 0)}
                    format="percentage"
                  />
                  <BigNumberCard
                    label="Views de Video 3s"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.video3s || 0) : (sheetDistributionData?.videoViews3s || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Thruplay"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.thruplay || 0) : (sheetDistributionData?.thruplayViews || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Visitas ao Perfil"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.profileVisits || 0) : (sheetDistributionData?.profileVisits || 0)}
                    format="number"
                  />
                  <BigNumberCard
                    label="Faturamento"
                    value={project?.source_type === 'meta_ads' ? ((metaDistributionData as any)?.revenue || 0) : ((sheetDistributionData as any)?.revenue || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="Custo por Compra"
                    value={project?.source_type === 'meta_ads' ? ((metaDistributionData as any)?.cpa || 0) : ((sheetDistributionData as any)?.cpa || 0)}
                    format="currency"
                  />
                  <BigNumberCard
                    label="Posts com Permalink"
                    value={project?.source_type === 'meta_ads' ? 0 : (sheetDistributionData?.permalinkCount || 0)}
                    format="number"
                  />
                </div>
              </section>

              {(project?.source_type === 'meta_ads'
                ? (metaDistributionData?.platformBreakdown || []).length > 0
                : (sheetDistributionData?.platformBreakdown || []).length > 0) && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Breakdown por Plataforma</h3>
                  <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Plataforma</th>
                          <th className="px-4 py-3 text-right font-medium">Alcance</th>
                          <th className="px-4 py-3 text-right font-medium">Engajamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(project?.source_type === 'meta_ads'
                          ? (metaDistributionData?.platformBreakdown || [])
                          : (sheetDistributionData?.platformBreakdown || [])
                        ).map((item) => (
                          <tr key={item.platform} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium capitalize">{item.platform}</td>
                            <td className="px-4 py-3 text-right">{item.reach.toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3 text-right">{(item.engagement * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {distributionTopCreatives.length > 0 && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Melhores Criativos</h3>
                  <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Criativo</th>
                          <th className="px-4 py-3 text-left font-medium">Link / Prévia</th>
                          {distributionCreativeColumns.map((metricKey, index) => {
                            const option = distributionCreativeMetricOptions.find((item) => item.key === metricKey);
                            return (
                              <th key={`${metricKey}-${index}`} className="px-4 py-3 text-right font-medium">
                                <Select
                                  value={metricKey}
                                  onValueChange={(value) => setDistributionCreativeColumnAtIndex(index, value)}
                                >
                                  <SelectTrigger className="h-8 w-[160px] text-xs ml-auto">
                                    <SelectValue placeholder={option?.label || 'Métrica'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {distributionCreativeMetricOptions.map((item) => (
                                      <SelectItem key={item.key} value={item.key}>
                                        {item.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {distributionTopCreatives.map((item) => (
                          <tr key={item.name} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium">{item.name}</td>
                            <td className="px-4 py-3">
                              {item.link ? (
                                <div className="flex items-center gap-2">
                                  {item.thumbnail || getInstagramThumbnailFromLink(item.link) ? (
                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                      <img
                                        src={item.thumbnail || getInstagramThumbnailFromLink(item.link)}
                                        alt={item.name}
                                        className="h-8 w-8 rounded object-cover border"
                                        loading="lazy"
                                        onError={(event) => {
                                          event.currentTarget.style.display = 'none';
                                          event.currentTarget.parentElement?.querySelector('.fallback-thumb')?.classList.remove('hidden');
                                        }}
                                      />
                                    </a>
                                  ) : (
                                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center border">
                                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="fallback-thumb hidden h-8 w-8 rounded bg-muted items-center justify-center border">
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Ver post
                                  </a>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Sem link</span>
                              )}
                            </td>
                            {distributionCreativeColumns.map((metricKey, metricIndex) => {
                              const option = distributionCreativeMetricOptions.find((entry) => entry.key === metricKey);
                              const raw = project?.source_type === 'meta_ads'
                                ? getMetaMetricValue(item as Record<string, unknown>, metricKey)
                                : (() => {
                                    switch (metricKey) {
                                      case 'investment':
                                        return Number(item.spend || 0);
                                      case 'reach':
                                        return Number(item.reach || 0);
                                      case 'impressions':
                                        return Number(item.impressions || 0);
                                      case 'frequency':
                                        return Number(item.frequency || 0);
                                      case 'clicks':
                                        return Number(item.clicks || 0);
                                      case 'video3s':
                                        return Number(item.video3s || 0);
                                      case 'thruplay':
                                        return Number(item.thruplay || 0);
                                      case 'profile_visits':
                                        return Number(item.profileVisits || 0);
                                      case 'checkout_views':
                                        return Number(item.checkouts || 0);
                                      case 'purchases':
                                        return Number(item.purchases || 0);
                                      case 'ctr':
                                        return Number(item.ctr || 0);
                                      case 'cpc':
                                        return Number(item.cpc || 0);
                                      case 'cpm':
                                        return Number(item.cpm || 0);
                                      case 'revenue':
                                        return Number(item.revenue || 0);
                                      case 'cpa':
                                        return Number(item.cpa || 0);
                                      case 'roas':
                                        return Number(item.roas || 0);
                                      case 'roi': {
                                        const spend = Number(item.spend || 0);
                                        const roas = Number(item.roas || 0);
                                        const revenue = roas > 0 ? roas * spend : 0;
                                        return spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
                                      }
                                      default:
                                        return Number((item.metrics && item.metrics[metricKey]) || 0);
                                    }
                                  })();
                              return (
                                <td key={`${item.name}-${metricKey}-${metricIndex}`} className="px-4 py-3 text-right">
                                  {formatDistributionMetricValue(raw, (option?.format === 'link' ? 'number' : option?.format) || 'number')}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>

      {/* Footer */}
      <footer className="mt-12 border-t pt-6">
        <p className="text-center text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleTimeString('pt-BR')} • Dados sincronizados com {project?.source_type === 'meta_ads' ? 'Meta Ads' : 'Google Sheets'}
        </p>
      </footer>
    </div>
  );
}

