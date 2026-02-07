import * as React from 'react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
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
import { getMetaMetricFormat, getMetaMetricLabel } from '@/lib/meta-metric-labels';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { useAuth } from '@/contexts/AuthContext';

// Helper to safely type source_config from Json
interface MetaSourceConfig {
  ad_account_id?: string;
  [key: string]: unknown;
}

function getSourceConfig(config: unknown): MetaSourceConfig | null {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return config as MetaSourceConfig;
  }
  return null;
}

interface DashboardViewProps {
  projectId: string;
  isPreview?: boolean;
  shareToken?: string;
}

export function DashboardView({ projectId, isPreview = false, shareToken }: DashboardViewProps) {
  const { signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState('perpetua');
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [funnelType, setFunnelType] = useState<'captacao' | 'mensagem' | 'conversao'>('captacao');
  const [googleReconnectRequired, setGoogleReconnectRequired] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // 1. Fetch Project Details
  const { data: project, isLoading: loadingProject } = useQuery({
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
    enabled: !!projectId,
  });

  // 2. Fetch Column Mappings
  const { mappings, isLoading: loadingMappings } = useColumnMappings(projectId);

  const sourceConfig = getSourceConfig(project?.source_config);
  const adAccountId = sourceConfig?.ad_account_id;

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

      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=account`
      );
      if (error) throw error;

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
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

      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=account&timeIncrement=all`
      );
      if (error) throw error;

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
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

      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=campaign`
      );
      if (error) throw error;

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
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

      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=campaign&timeIncrement=all`
      );
      if (error) throw error;

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
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

      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=ad`
      );
      if (error) throw error;

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
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
      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=insights&accountId=${encodeURIComponent(adAccountId)}&startDate=${startDate}&endDate=${endDate}&level=account&timeIncrement=all&breakdowns=publisher_platform`
      );
      if (error) throw error;

      return (data?.data || []) as Array<Record<string, any>>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
  });

  const metaCampaignsQuery = useQuery({
    queryKey: ['meta-campaigns', adAccountId],
    queryFn: async () => {
      if (!adAccountId) return [];

      const { data, error } = await supabase.functions.invoke(
        `meta-api?action=campaigns&accountId=${encodeURIComponent(adAccountId)}`
      );
      if (error) {
        const message = String((error as any)?.message || '');
        // Backwards compatibility: older deployed edge function versions don't support action=campaigns yet.
        if (message.toLowerCase().includes('invalid action')) return [];
        throw error;
      }

      return (data?.campaigns || []) as Array<{ id: string; name: string; effective_status?: string; status?: string }>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
  });

  const metaMetricsCatalogQuery = useQuery({
    queryKey: ['meta-metrics-catalog', adAccountId],
    queryFn: async () => {
      if (!adAccountId) return { actions: [], action_values: [] };

      try {
        const { data, error } = await supabase.functions.invoke(
          `meta-api?action=metrics-catalog&accountId=${encodeURIComponent(adAccountId)}`
        );
        if (error) {
          return { actions: [], action_values: [] };
        }

        const catalog = data?.catalog || {};
        return {
          actions: Array.isArray(catalog.actions) ? catalog.actions : [],
          action_values: Array.isArray(catalog.action_values) ? catalog.action_values : [],
        } as { actions: string[]; action_values: string[] };
      } catch {
        return { actions: [], action_values: [] };
      }
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken,
  });

  // 3. Fetch Sheet Data from all configured sheets
  const sheetNames: string[] = Array.isArray(project?.sheet_names)
    ? (project.sheet_names as string[])
    : (project?.sheet_name ? [project.sheet_name] : []);

  // We'll use a custom query to fetch all sheets in parallel
  const allSheetsQuery = useQuery({
    queryKey: ['all-sheets-data', project?.spreadsheet_id, sheetNames, shareToken],
    queryFn: async () => {
      const results = await Promise.all(
        sheetNames.map(async (name: string) => {
          try {
            const range = `'${name}'!A:Z`;
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
      const flattened = results.flat();
      console.log(`Total rows aggregated: ${flattened.length}`);
      return flattened;
    },
    enabled: !!project?.spreadsheet_id && sheetNames.length > 0,
  });

  const sourceRows = (project?.source_type === 'meta_ads' ? (metaInsightsQuery.data || []) : (allSheetsQuery.data || [])) as any[];
  const metaAccountRows = (metaAccountInsightsQuery.data || []) as any[];

  const campaignOptions = useMemo(() => {
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

  const metaWeeklyMetricOptions = useMemo(() => {
    const baseKeys = [
      'sales',
      'investment',
      'revenue',
      'roas',
      'conversion',
      'impressions',
      'reach',
      'clicks',
      'leads',
      'messages',
      'purchases',
      'ctr',
      'cpc',
      'cpm',
      'frequency',
      'landing_views',
      'checkout_views',
      'video_views',
    ];

    const catalogActionKeys = (metaMetricsCatalogQuery.data?.actions || [])
      .filter((value) => value && value.trim().length > 0)
      .map((actionType) => `action:${actionType}`);

    const catalogActionValueKeys = (metaMetricsCatalogQuery.data?.action_values || [])
      .filter((value) => value && value.trim().length > 0)
      .map((actionType) => `action_value:${actionType}`);

    const discoveredActionTypes = new Set<string>();
    const discoveredActionValueTypes = new Set<string>();
    const source = (sourceRows || []) as any[];
    for (const row of source) {
      const actionsMap = (row?.actions_map || row?.actions_agg_map || {}) as Record<string, number>;
      const actionValuesMap = (row?.action_values_map || row?.action_values_agg_map || {}) as Record<string, number>;
      for (const actionType of Object.keys(actionsMap)) {
        if (actionType) discoveredActionTypes.add(actionType);
      }
      for (const actionType of Object.keys(actionValuesMap)) {
        if (actionType) discoveredActionValueTypes.add(actionType);
      }
    }

    const discoveredActionKeys = Array.from(discoveredActionTypes).map((actionType) => `action:${actionType}`);
    const discoveredActionValueKeys = Array.from(discoveredActionValueTypes).map((actionType) => `action_value:${actionType}`);

    const allKeys = [
      ...baseKeys,
      ...catalogActionKeys,
      ...catalogActionValueKeys,
      ...discoveredActionKeys,
      ...discoveredActionValueKeys,
    ];
    const unique = Array.from(new Set(allKeys));

    return unique.map((key) => ({
      key,
      label: getMetaMetricLabel(key),
      format: getMetaMetricFormat(key),
    }));
  }, [metaMetricsCatalogQuery.data?.action_values, metaMetricsCatalogQuery.data?.actions, sourceRows]);

  const rowsAfterCampaignFilter = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return sourceRows;
    if (selectedCampaignIds.length === 0) return metaAccountRows;
    const selectedSet = new Set(selectedCampaignIds.map((id) => String(id)));
    return sourceRows.filter((r) => selectedSet.has(String(r?.campaign_id || '')));
  }, [metaAccountRows, project?.source_type, selectedCampaignIds, sourceRows]);

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
        // Try to find a date column
        const dateKey = Object.keys(row).find(k =>
          k.toLowerCase().includes('data') || k.toLowerCase().includes('date')
        );
        if (dateKey && row[dateKey]) {
          const rowDate = new Date(row[dateKey]);
          if (!isNaN(rowDate.getTime())) {
            // Normalize dates to start of day for inclusive comparison
            const from = new Date(dateRange.from!);
            from.setHours(0, 0, 0, 0);

            const to = dateRange.to ? new Date(dateRange.to) : new Date();
            to.setHours(23, 59, 59, 999);

            if (rowDate < from) return false;
            if (rowDate > to) return false;
          }
        }
      }

      // Creative Filter
      if (selectedCreative) {
        const creativeKey = Object.keys(row).find(k =>
          k.toLowerCase().includes('criativo') || k.toLowerCase().includes('creative')
        );
        if (creativeKey && row[creativeKey] !== selectedCreative) {
          return false;
        }
      }

      return true;
    });
  }, [aggregatedMetaRows, dateRange, selectedCreative]);

  // 5. Process Data
  const effectiveMappings = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return mappings || [];

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
  }, [mappings, adAccountId, project?.source_type, projectId]);

  const processedData = useMemo(() => {
    return processDashboardData(filteredRows, effectiveMappings as any);
  }, [filteredRows, effectiveMappings]);

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

    const buckets = Array.from(byBucket.values())
      .sort((a, b) => b.bucket.localeCompare(a.bucket))
      .slice(0, 5)
      .reverse();

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
  }, [filteredRows, project?.source_type, viewMode]);

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
        name: String(row?.ad_name || 'Anúncio'),
        impressions: 0,
        clicks: 0,
        ctr: 0,
        landingViews: 0,
        checkoutViews: 0,
        sales: 0,
      };
      current.impressions += Number(row?.impressions || 0);
      current.clicks += Number(row?.clicks || 0);
      current.landingViews += Number(row?.landing_views || 0);
      current.checkoutViews += Number(row?.checkout_views || 0);
      current.sales += Number((row?.purchases && Number(row.purchases) > 0 ? row.purchases : row?.leads) || 0);
      byAd.set(id, current);
    }

    return Array.from(byAd.values())
      .map((a) => ({ ...a, ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0 }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 50);
  }, [metaAdsQuery.data, project?.source_type, selectedCampaignIds]);

  const creativeAdIds = useMemo(() => {
    if (project?.source_type !== 'meta_ads') return [];
    return (metaCreativeData || []).map((c: any) => String(c?.id || '')).filter(Boolean);
  }, [metaCreativeData, project?.source_type]);

  const metaAdThumbnailsQuery = useQuery({
    queryKey: ['meta-ad-thumbnails', adAccountId, creativeAdIds],
    queryFn: async () => {
      if (!creativeAdIds.length) return {};
      const { data, error } = await supabase.functions.invoke('meta-api?action=ad-thumbnails', {
        body: { adIds: creativeAdIds },
      });
      if (error) throw error;
      return (data?.thumbnails || {}) as Record<string, { thumbnail: string | null; image: string | null }>;
    },
    enabled: project?.source_type === 'meta_ads' && !!adAccountId && !shareToken && creativeAdIds.length > 0,
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
    if (shareToken) return null;

    const aggregateMetaTotals = (rows: any[], extra: Record<string, unknown> = {}) => {
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

      return {
        ...totals,
        frequency: reach > 0 ? impressions / reach : 0,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpl: leads > 0 ? spend / leads : 0,
        cpa: purchases > 0 ? spend / purchases : 0,
        roas: spend > 0 ? purchaseValue / spend : 0,
        hook_rate: impressions > 0 ? video3s / impressions : 0,
        hold_rate: impressions > 0 ? (video15s || thruplay) / impressions : 0,
        ...extra,
      };
    };

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
      return aggregateMetaTotals(filtered, { campaign_id: selectedCampaignIds.join(','), campaign_name: campaignName });
    }

    const accountTotals = (metaAccountTotalsQuery.data || []) as any[];
    if (!accountTotals.length) return null;
    return aggregateMetaTotals(accountTotals);
  }, [
    metaAccountTotalsQuery.data,
    metaCampaignTotalsQuery.data,
    metaCampaignsQuery.data,
    project?.source_type,
    selectedCampaignIds,
    shareToken,
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

    const videoViewsRaw = Number(r?.thruplay || 0) || Number(r?.video3s || 0);
    const videoViews = Number.isFinite(videoViewsRaw) ? videoViewsRaw : 0;

    // Followers gained is not available in Ads Insights reliably; keep 0 for now.
    const followersGained = 0;

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
      videoViews,
      followersGained,
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

    return [
      { label: 'Investimento', value: spend, format: 'currency' as const },
      { label: 'Impressões', value: impressions, format: 'number' as const },
      { label: 'Cliques', value: clicks, format: 'number' as const },
      { label: resultsLabel, value: results, format: 'number' as const },
      { label: purchases > 0 ? 'CPA' : 'CPL', value: costPerResult, format: 'currency' as const },
      { label: 'ROAS', value: roas, format: 'decimal' as const },
    ];
  }, [metaTotalsRow, project?.source_type]);

  const bigNumbersToRender = project?.source_type === 'meta_ads' ? metaBigNumbers : processedData.bigNumbers;

  const isLoading =
    loadingProject ||
    loadingMappings ||
    allSheetsQuery.isLoading ||
    metaInsightsQuery.isLoading ||
    metaAccountInsightsQuery.isLoading ||
    metaAccountTotalsQuery.isLoading ||
    metaCampaignTotalsQuery.isLoading ||
    metaPlatformBreakdownQuery.isLoading ||
    metaAdsQuery.isLoading;

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
      if (shareToken) {
        warnings.push({
          title: 'Meta Ads indisponível no link compartilhado',
          description: 'Por enquanto, o dashboard público não consegue buscar dados da Meta. Abra logado para visualizar.',
        });
      }
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

    if (!mappings || mappings.length === 0) {
      warnings.push({
        title: 'Mapeamento de colunas pendente',
        description: 'Sem mapeamento, o dashboard continua visível, mas não sabe quais métricas exibir.',
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
        campaignsLoading={metaCampaignsQuery.isLoading}
        selectedCampaignIds={selectedCampaignIds}
        onCampaignChange={(ids) => setSelectedCampaignIds(ids)}
        viewMode={viewMode}
        onViewModeChange={(v) => setViewMode(v)}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="perpetua">Perpétua</TabsTrigger>
          <TabsTrigger value="distribuicao">Distribuição de Conteúdos</TabsTrigger>
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
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {bigNumbersToRender.map((kpi, index) => {
                      const { label, value, previousValue, format } = kpi;
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

              {/* Weekly Comparison */}
              {(project?.source_type === 'meta_ads' ? metaWeeklyData.length > 0 : processedData.weeklyData.length > 0) && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">
                    {viewMode === 'day' ? 'Visão Diária' : viewMode === 'month' ? 'Visão Mensal' : 'Visão Semanal'}
                  </h3>
                  <WeeklyComparisonTable
                    data={project?.source_type === 'meta_ads' ? (metaWeeklyData as any) : processedData.weeklyData}
                    isMeta={project?.source_type === 'meta_ads'}
                    viewMode={viewMode}
                    onViewModeChange={(v) => setViewMode(v)}
                    metricOptions={project?.source_type === 'meta_ads' ? (metaWeeklyMetricOptions as any) : undefined}
                    defaultMetricColumns={['sales', 'investment', 'revenue', 'roas', 'conversion']}
                  />
                </section>
              )}

              {/* Creative Performance */}
              {(project?.source_type === 'meta_ads' ? metaCreativeDataWithThumbs.length > 0 : processedData.creativeData.length > 0) && (
                <section>
                  <h3 className="mb-4 text-lg font-semibold">Performance por Criativo</h3>
                  <CreativePerformanceTable
                    data={project?.source_type === 'meta_ads' ? (metaCreativeDataWithThumbs as any) : processedData.creativeData}
                    selectedCreative={selectedCreative}
                    onCreativeSelect={setSelectedCreative}
                  />
                </section>
              )}

              {/* Funnel */}
              {(project?.source_type === 'meta_ads' ? metaFunnelSteps.length > 0 : processedData.funnelData.length > 0) && (
                <section>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Funil de Conversão</h3>
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

          <TabsContent value="distribuicao" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              <section>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <BigNumberCard
                    label="Alcance Total"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.totalReach || 0) : processedData.distributionData.totalReach}
                    format="number"
                  />
                  <BigNumberCard
                    label="Impressões"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.totalImpressions || 0) : processedData.distributionData.totalImpressions}
                    format="number"
                  />
                  <BigNumberCard
                    label="Engajamento Médio"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.avgEngagement || 0) : processedData.distributionData.avgEngagement}
                    format="percentage"
                  />
                  <BigNumberCard
                    label="Views de Vídeo"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.videoViews || 0) : processedData.distributionData.videoViews}
                    format="number"
                  />
                  <BigNumberCard
                    label="Novos Seguidores"
                    value={project?.source_type === 'meta_ads' ? (metaDistributionData?.followersGained || 0) : processedData.distributionData.followersGained}
                    format="number"
                  />
                </div>
              </section>

              {(project?.source_type === 'meta_ads'
                ? (metaDistributionData?.platformBreakdown || []).length > 0
                : processedData.distributionData.platformBreakdown.length > 0) && (
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
                          : processedData.distributionData.platformBreakdown
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
