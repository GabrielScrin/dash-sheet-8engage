import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const toNumber = (value: unknown) => {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
    return Number.isFinite(n) ? n : 0;
  };

  const toInt = (value: unknown) => {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? '0'), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const sumActionValues = (actions: any[] | undefined, matcher: (actionType: string) => boolean) => {
    if (!Array.isArray(actions)) return 0;
    return actions.reduce((sum, a) => {
      const actionType = String(a?.action_type || '');
      if (!actionType) return sum;
      if (!matcher(actionType)) return sum;
      return sum + toInt(a?.value);
    }, 0);
  };

  const sumMetricArrayValues = (items: any[] | undefined) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => sum + toInt(item?.value), 0);
  };

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action'); // 'ad-accounts' | 'campaigns' | 'insights' | 'ad-thumbnails' | 'metrics-catalog'

    // Validate JWT manually using getClaims
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error('JWT validation failed:', claimsError);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;
    console.log('Authenticated user:', userId);

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Meta Access Token from DB
    const { data: tokenData, error: tokenError } = await supabase
      .from('service_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'meta')
      .single();

    if (tokenError || !tokenData) {
      console.error('Token not found:', tokenError);
      return new Response(JSON.stringify({ error: 'Meta account not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const ACCESS_TOKEN = tokenData.access_token;

    // --- Action: List Ad Accounts ---
    if (action === 'ad-accounts') {
      console.log('Fetching ad accounts for user:', userId);
      const accounts: any[] = [];
      let nextUrl: string | null =
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency,timezone_name&limit=200&access_token=${ACCESS_TOKEN}`;

      while (nextUrl) {
        const res: Response = await fetch(nextUrl);
        const data: { data?: any[]; paging?: { next?: string }; error?: { message: string } } = await res.json();

        if (data.error) {
          console.error('Meta API error:', data.error);
          throw new Error(data.error.message);
        }

        if (Array.isArray(data.data)) accounts.push(...data.data);
        nextUrl = data?.paging?.next || null;

        // Safety guard to avoid infinite loops or unexpected huge result sets
        if (accounts.length > 5000) break;
      }

      const normalizedAccounts = accounts.map((acc: any) => ({
        id: acc.account_id,
        name: acc.name,
        currency: acc.currency,
        timezone: acc.timezone_name
      }));

      console.log('Found', normalizedAccounts.length, 'ad accounts');
      return new Response(JSON.stringify({ accounts: normalizedAccounts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: List Campaigns for an Ad Account ---
    if (action === 'campaigns') {
      const accountId = url.searchParams.get('accountId');
      if (!accountId) throw new Error('Missing accountId');

      // effective_status can be used to include ACTIVE even with no spend in the selected period.
      // We'll return all and let the UI decide how to show/filter.
      const campaigns: any[] = [];
      let nextUrl: string | null =
        `https://graph.facebook.com/v19.0/act_${accountId}/campaigns?fields=id,name,effective_status,status&limit=200&access_token=${ACCESS_TOKEN}`;

      while (nextUrl) {
        const res: Response = await fetch(nextUrl);
        const page: { data?: any[]; paging?: { next?: string }; error?: { message: string } } = await res.json();

        if (page.error) {
          console.error('Meta API error:', page.error);
          throw new Error(page.error.message);
        }

        if (Array.isArray(page.data)) campaigns.push(...page.data);
        nextUrl = page?.paging?.next || null;
        if (campaigns.length > 10000) break;
      }

      const normalizedCampaigns = campaigns
        .filter((c: any) => c?.id && c?.name)
        .map((c: any) => ({
          id: String(c.id),
          name: String(c.name),
          effective_status: String(c.effective_status || ''),
          status: String(c.status || ''),
        }));

      return new Response(JSON.stringify({ campaigns: normalizedCampaigns }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Fetch Ad Thumbnails ---
    if (action === 'ad-thumbnails') {
      let body: any = null;
      try {
        body = await req.json();
      } catch {
        body = null;
      }

      const adIds: string[] = Array.isArray(body?.adIds) ? body.adIds.map((x: any) => String(x)).filter(Boolean) : [];
      if (adIds.length === 0) {
        return new Response(JSON.stringify({ thumbnails: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const thumbnails: Record<string, { thumbnail: string | null; image: string | null }> = {};

      // Graph API: keep ids chunks small to avoid URL length issues
      const chunkSize = 50;
      for (let i = 0; i < adIds.length; i += chunkSize) {
        const chunk = adIds.slice(i, i + chunkSize);
        const idsParam = encodeURIComponent(chunk.join(','));
        const fieldsParam = encodeURIComponent('creative{thumbnail_url,image_url}');
        const graphUrl =
          `https://graph.facebook.com/v19.0/?ids=${idsParam}&fields=${fieldsParam}&access_token=${ACCESS_TOKEN}`;

        const res: Response = await fetch(graphUrl);
        const page: Record<string, any> & { error?: { message: string } } = await res.json();
        if (page?.error) {
          console.error('Meta API error:', page.error);
          throw new Error(page.error.message);
        }

        for (const id of chunk) {
          const entry = page?.[id];
          const creative = entry?.creative;
          const thumbnail = typeof creative?.thumbnail_url === 'string' ? creative.thumbnail_url : null;
          const image = typeof creative?.image_url === 'string' ? creative.image_url : null;
          thumbnails[id] = { thumbnail, image };
        }
      }

      return new Response(JSON.stringify({ thumbnails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Fetch Metrics Catalog (including custom actions) ---
    if (action === 'metrics-catalog') {
      const accountId = url.searchParams.get('accountId');
      if (!accountId) throw new Error('Missing accountId');

      const now = new Date();
      const defaultEndDate = now.toISOString().slice(0, 10);
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      const defaultStartDate = start.toISOString().slice(0, 10);

      const startDate = url.searchParams.get('startDate') || defaultStartDate;
      const endDate = url.searchParams.get('endDate') || defaultEndDate;

      const actionTypes = new Set<string>();
      const actionValueTypes = new Set<string>();
      let nextUrl: string | null =
        `https://graph.facebook.com/v19.0/act_${accountId}/insights?level=account` +
        `&time_increment=all&time_range={'since':'${startDate}','until':'${endDate}'}` +
        `&fields=${encodeURIComponent('actions,action_values')}&limit=500&access_token=${ACCESS_TOKEN}`;

      while (nextUrl) {
        const res: Response = await fetch(nextUrl);
        const page: { data?: any[]; paging?: { next?: string }; error?: { message: string } } = await res.json();

        if (page.error) {
          console.error('Meta API error:', page.error);
          throw new Error(page.error.message);
        }

        for (const row of page.data || []) {
          const actions = Array.isArray(row?.actions) ? row.actions : [];
          const actionValues = Array.isArray(row?.action_values) ? row.action_values : [];

          for (const actionItem of actions) {
            const actionType = String(actionItem?.action_type || '').trim();
            if (actionType) actionTypes.add(actionType);
          }

          for (const actionValueItem of actionValues) {
            const actionType = String(actionValueItem?.action_type || '').trim();
            if (actionType) actionValueTypes.add(actionType);
          }
        }

        nextUrl = page?.paging?.next || null;
      }

      return new Response(JSON.stringify({
        catalog: {
          actions: Array.from(actionTypes).sort((a, b) => a.localeCompare(b)),
          action_values: Array.from(actionValueTypes).sort((a, b) => a.localeCompare(b)),
          base_metrics: [
            'spend',
            'impressions',
            'reach',
            'frequency',
            'clicks',
            'inline_link_clicks',
            'ctr',
            'cpc',
            'cpm',
            'leads',
            'messages',
            'purchases',
            'purchase_value',
            'roas',
            'cpl',
            'cpa',
            'landing_views',
            'checkout_views',
            'video3s',
            'video15s',
            'thruplay',
            'hook_rate',
            'hold_rate',
          ],
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Fetch Insights ---
    if (action === 'insights') {
      const accountId = url.searchParams.get('accountId');
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const level = url.searchParams.get('level') || 'account';
      const timeIncrement = url.searchParams.get('timeIncrement') || '1'; // '1' (daily) | 'all' (aggregated)
      const breakdowns = url.searchParams.get('breakdowns'); // e.g. 'publisher_platform'
      const normalizedLevel = ['account', 'campaign', 'adset', 'ad'].includes(level) ? level : 'account';

      if (!accountId) throw new Error('Missing accountId');
      if (!startDate || !endDate) throw new Error('Missing date range');

      console.log('Fetching insights for account:', accountId, 'level:', normalizedLevel);

      const base =
        'date_start,date_stop,impressions,reach,frequency,clicks,inline_link_clicks,spend,cpm,ctr,cpc,actions,action_values,purchase_roas,video_thruplay_watched_actions,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions';
      const fields =
        normalizedLevel === 'campaign'
          ? `campaign_id,campaign_name,${base}`
          : normalizedLevel === 'adset'
            ? `adset_id,adset_name,campaign_id,campaign_name,${base}`
            : normalizedLevel === 'ad'
              ? `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${base}`
              : base;

      const insights: any[] = [];
      const timeIncrementParam =
        timeIncrement === 'all' || timeIncrement === '0' || timeIncrement === 'false'
          ? ''
          : '&time_increment=1';
      const breakdownsParam = breakdowns ? `&breakdowns=${encodeURIComponent(breakdowns)}` : '';
      let nextUrl: string | null =
        `https://graph.facebook.com/v19.0/act_${accountId}/insights?level=${encodeURIComponent(normalizedLevel)}` +
        `${timeIncrementParam}&time_range={'since':'${startDate}','until':'${endDate}'}` +
        `${breakdownsParam}&fields=${encodeURIComponent(fields)}&limit=500&access_token=${ACCESS_TOKEN}`;

      while (nextUrl) {
        const res: Response = await fetch(nextUrl);
        const page: { data?: any[]; paging?: { next?: string }; error?: { message: string } } = await res.json();

        if (page.error) {
          console.error('Meta API error:', page.error);
          throw new Error(page.error.message);
        }

        if (Array.isArray(page.data)) insights.push(...page.data);
        nextUrl = page?.paging?.next || null;
        if (insights.length > 5000) break;
      }

      const isLeadLike = (t: string) =>
        t === 'lead' ||
        t.includes('lead') ||
        t.includes('omni_lead') ||
        t.includes('offsite_conversion.fb_pixel_lead');

      const isMessageLike = (t: string) =>
        // "Messaging conversations started" and close variants
        t.includes('messaging_conversation_started') ||
        t.includes('messaging_first_reply') ||
        t.includes('total_messaging_connection') ||
        t.includes('messaging_user_depth') ||
        // Onsite conversion variants
        t.includes('onsite_conversion.messaging') ||
        t.includes('onsite_conversion.messaging_conversation_started') ||
        t.includes('onsite_conversion.total_messaging_connection') ||
        // Omni / platform variants
        t.includes('omni_message') ||
        t.includes('omni_messaging') ||
        t.includes('messaging') ||
        t.includes('whatsapp') ||
        t.includes('instagram_direct');

      const isPurchaseLike = (t: string) =>
        t === 'purchase' || t.includes('purchase');

      const isLandingViewLike = (t: string) =>
        t === 'landing_page_view' || t.includes('landing_page_view');

      const isCheckoutLike = (t: string) =>
        t === 'initiate_checkout' ||
        t.includes('initiate_checkout') ||
        t.includes('omni_initiated_checkout') ||
        t.includes('omni_initiate_checkout');

      const isVideo3sLike = (t: string) =>
        t === 'video_view' ||
        t.includes('video_play') ||
        t.includes('thruplay') ||
        t.includes('video_view') ||
        t.includes('video_view_3s');

      const isVideo15sLike = (t: string) =>
        t.includes('video_view_15') || t.includes('video_view_15s');

      // Normalize Data
      const normalized = insights.map((row: any) => {
        const spend = toNumber(row.spend);
        const clicks = toInt(row.clicks);
        const inlineLinkClicks = toInt(row.inline_link_clicks);
        const impressions = toInt(row.impressions);
        let reach = toInt(row.reach);
        const frequency = toNumber(row.frequency);
        if (reach === 0 && frequency > 0 && impressions > 0) {
          // Some breakdown queries may omit reach; approximate from impressions/frequency when possible.
          reach = Math.round(impressions / frequency);
        }
        const cpm = toNumber(row.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0);
        const ctr = toNumber(row.ctr) || (impressions > 0 ? (clicks / impressions) * 100 : 0);
        const cpc = toNumber(row.cpc) || (clicks > 0 ? spend / clicks : 0);

        const leads = sumActionValues(row.actions, isLeadLike);
        const messages = sumActionValues(row.actions, isMessageLike);
        const purchases = sumActionValues(row.actions, isPurchaseLike);
        const landing_views = sumActionValues(row.actions, isLandingViewLike);
        const checkout_views = sumActionValues(row.actions, isCheckoutLike);

        // Revenue/value (when available). Meta returns monetary values inside action_values.
        const purchase_value = Array.isArray(row.action_values)
          ? row.action_values.reduce((sum: number, a: any) => {
            const actionType = String(a?.action_type || '');
            if (!actionType) return sum;
            if (!isPurchaseLike(actionType)) return sum;
            return sum + toNumber(a?.value);
          }, 0)
          : 0;

        // Prefer computed ROAS from purchase_value when possible. Fallback to purchase_roas if provided.
        const roasFromValue = spend > 0 ? purchase_value / spend : 0;
        const roasFromMetaField = Array.isArray(row.purchase_roas)
          ? row.purchase_roas.reduce((sum: number, r: any) => sum + toNumber(r?.value), 0)
          : 0;
        const roas = roasFromValue > 0 ? roasFromValue : roasFromMetaField;

        const video3sFromActions = sumActionValues(row.actions, isVideo3sLike);
        const video15sFromActions = sumActionValues(row.actions, isVideo15sLike);
        const videoPlay = sumMetricArrayValues(row.video_play_actions);
        const videoP25 = sumMetricArrayValues(row.video_p25_watched_actions);
        const videoP50 = sumMetricArrayValues(row.video_p50_watched_actions);
        const videoP75 = sumMetricArrayValues(row.video_p75_watched_actions);
        const thruplayRaw = sumMetricArrayValues(row.video_thruplay_watched_actions);

        // Fallback strategy to avoid zeroing video metrics on accounts where actions don't include video_view_*.
        const video3s = video3sFromActions > 0 ? video3sFromActions : videoPlay;
        const video15s = video15sFromActions > 0 ? video15sFromActions : videoP25;
        const thruplay = thruplayRaw > 0 ? thruplayRaw : videoP50 || videoP75;

        const cpl = leads > 0 ? spend / leads : 0;
        const cpa = purchases > 0 ? spend / purchases : 0;

        const actionsMap = Array.isArray(row.actions)
          ? row.actions.reduce((acc: Record<string, number>, item: any) => {
            const actionType = String(item?.action_type || '').trim();
            if (!actionType) return acc;
            acc[actionType] = (acc[actionType] || 0) + toInt(item?.value);
            return acc;
          }, {})
          : {};

        const actionValuesMap = Array.isArray(row.action_values)
          ? row.action_values.reduce((acc: Record<string, number>, item: any) => {
            const actionType = String(item?.action_type || '').trim();
            if (!actionType) return acc;
            acc[actionType] = (acc[actionType] || 0) + toNumber(item?.value);
            return acc;
          }, {})
          : {};

        const breakdownFields: Record<string, unknown> = {};
        if (breakdowns) {
          const keys = breakdowns.split(',').map((s) => s.trim()).filter(Boolean);
          for (const key of keys) {
            if (row?.[key] !== undefined) breakdownFields[key] = row[key];
          }
        }

        return {
          date: row.date_start,
          date_stop: row.date_stop,
          impressions,
          reach,
          frequency,
          clicks,
          inline_link_clicks: inlineLinkClicks,
          spend,
          leads,
          messages,
          purchases,
          purchase_value,
          landing_views,
          checkout_views,
          roas,
          ctr,
          cpc,
          cpl,
          cpm,
          cpa,
          video3s,
          video15s,
          thruplay,
          hook_rate: impressions > 0 ? video3s / impressions : 0,
          hold_rate: impressions > 0 ? (video15s || thruplay) / impressions : 0,
          actions_map: actionsMap,
          action_values_map: actionValuesMap,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          adset_id: row.adset_id,
          adset_name: row.adset_name,
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          ...breakdownFields,
        };
      });

      return new Response(JSON.stringify({ data: normalized }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
