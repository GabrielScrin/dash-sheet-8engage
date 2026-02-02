import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action'); // 'ad-accounts' | 'insights'

    // 1. Authenticate User via Supabase Token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Auth Header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // Needed to read service_tokens
    const supabase = createClient(supabaseUrl, supabaseKey);

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Invalid User');

    // 2. Get Meta Access Token from DB
    const { data: tokenData, error: tokenError } = await supabase
      .from('service_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'meta')
      .single();

    if (tokenError || !tokenData) throw new Error('Meta account not connected');
    const ACCESS_TOKEN = tokenData.access_token;

    // --- Action: List Ad Accounts ---
    if (action === 'ad-accounts') {
      const res = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency,timezone_name&access_token=${ACCESS_TOKEN}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);

      const accounts = data.data.map((acc: any) => ({
        id: acc.account_id, // "act_" prefix is stripped by specific field request or just pure ID
        name: acc.name,
        currency: acc.currency,
        timezone: acc.timezone_name
      }));

      return new Response(JSON.stringify({ accounts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Action: Fetch Insights ---
    if (action === 'insights') {
      const accountId = url.searchParams.get('accountId');
      const startDate = url.searchParams.get('startDate'); // YYYY-MM-DD
      const endDate = url.searchParams.get('endDate');     // YYYY-MM-DD

      if (!accountId) throw new Error('Missing accountId');
      if (!startDate || !endDate) throw new Error('Missing date range');

      // CACHING STRATEGY (Simple implementation)
      // Check if we have cached data? For now, implementing direct fetch.
      // In a real prod env, we'd query a 'cache_meta_insights' table or Redis here.

      const fields = 'impressions,clicks,spend,actions,date_start,date_stop';
      const apiUrl = `https://graph.facebook.com/v19.0/act_${accountId}/insights?level=account&time_increment=1&time_range={'since':'${startDate}','until':'${endDate}'}&fields=${fields}&access_token=${ACCESS_TOKEN}`;

      const res = await fetch(apiUrl);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);

      // Normalize Data
      const normalized = data.data.map((row: any) => {
        const spend = parseFloat(row.spend || '0');
        const clicks = parseInt(row.clicks || '0');
        const impressions = parseInt(row.impressions || '0');

        // Calc Metrics
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;

        // Extract Actions (Leads, Purchases, etc.)
        let leads = 0;
        if (row.actions) {
          const leadAction = row.actions.find((a: any) => a.action_type === 'lead'); // Customize based on mapping preference later
          if (leadAction) leads = parseInt(leadAction.value);
        }
        const cpl = leads > 0 ? spend / leads : 0;

        return {
          date: row.date_start,
          impressions,
          clicks,
          spend,
          leads,
          ctr,
          cpc,
          cpl
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
