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

    // --- Action: Fetch Insights ---
    if (action === 'insights') {
      const accountId = url.searchParams.get('accountId');
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const level = url.searchParams.get('level') || 'account';

      if (!accountId) throw new Error('Missing accountId');
      if (!startDate || !endDate) throw new Error('Missing date range');

      console.log('Fetching insights for account:', accountId, 'level:', level);

      const fieldsBase = 'impressions,clicks,spend,actions,date_start,date_stop';
      const fields = level === 'campaign'
        ? `campaign_id,campaign_name,${fieldsBase}`
        : fieldsBase;
      const apiUrl = `https://graph.facebook.com/v19.0/act_${accountId}/insights?level=${encodeURIComponent(level)}&time_increment=1&time_range={'since':'${startDate}','until':'${endDate}'}&fields=${encodeURIComponent(fields)}&access_token=${ACCESS_TOKEN}`;

      const res = await fetch(apiUrl);
      const data = await res.json();

      if (data.error) {
        console.error('Meta API error:', data.error);
        throw new Error(data.error.message);
      }

      // Normalize Data
      const normalized = data.data.map((row: any) => {
        const spend = parseFloat(row.spend || '0');
        const clicks = parseInt(row.clicks || '0');
        const impressions = parseInt(row.impressions || '0');

        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;

        let leads = 0;
        if (row.actions) {
          const leadAction = row.actions.find((a: any) => a.action_type === 'lead');
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
          cpl,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name
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
