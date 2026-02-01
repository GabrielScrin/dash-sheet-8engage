import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop(); // "meta-auth" or "authorize" or "callback" ?? 
    // Usually mapped to /functions/v1/meta-auth
    // Let's check query params or path logic.
    // Assuming we call /authorize or /callback via params or logic.
    // Safer: check valid action via query param or simple path match if strict routing used.

    // We'll use a simple "action = authorize | callback" query param for simplicity in single function
    const action = url.searchParams.get('action');

    const META_CLIENT_ID = Deno.env.get('META_CLIENT_ID');
    const META_CLIENT_SECRET = Deno.env.get('META_CLIENT_SECRET');
    const META_REDIRECT_URI = `${url.origin}/functions/v1/meta-auth?action=callback`; // Self-referential callback

    if (!META_CLIENT_ID || !META_CLIENT_SECRET) {
      throw new Error('Missing Meta configuration');
    }

    if (action === 'authorize') {
      const scope = 'ads_read,read_insights,business_management'; // Scopes needed
      const metaAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_CLIENT_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${scope}&response_type=code`;

      return new Response(JSON.stringify({ url: metaAuthUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code');
      if (!code) throw new Error('No code provided');

      // 1. Exchange code for access token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_CLIENT_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&client_secret=${META_CLIENT_SECRET}&code=${code}`
      );
      const tokenData = await tokenRes.json();

      if (tokenData.error) throw new Error(tokenData.error.message);

      const shortLivedToken = tokenData.access_token;

      // 2. Exchange for long-lived token
      const longTokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_CLIENT_ID}&client_secret=${META_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`
      );
      const longTokenData = await longTokenRes.json();

      if (longTokenData.error) throw new Error(longTokenData.error.message);

      const longLivedToken = longTokenData.access_token;
      const expiresIn = longTokenData.expires_in ? new Date(Date.now() + longTokenData.expires_in * 1000) : null;

      // 3. Store in Supabase
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // Use service role to write to restricted table
      const supabase = createClient(supabaseUrl, supabaseKey);

      // We need the user ID. Since this is a callback, we might not have the session cookie easily accessible 
      // if it's a server-side redirect. 
      // BETTER APPROACH for Frontend integration:
      // Frontend calls /authorize -> gets URL -> Redirects -> Meta -> Redirects to Frontend /callback route -> Frontend calls Function /callback with code AND auth header.

      // Let's assume the frontend will handle the "Redirect to Meta" part via the URL we gave in 'authorize'.
      // And the Frontend will receive the code, then call this function's 'callback' action WITH the user's Auth Header.

      // Get User from Auth Header
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) throw new Error('Missing Supabase Auth Token');

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();

      if (userError || !user) throw new Error('Invalid User');

      // UPSERT token
      const { error: upsertError } = await supabase
        .from('service_tokens')
        .upsert({
          user_id: user.id,
          provider: 'meta',
          access_token: longLivedToken,
          expires_at: expiresIn,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, provider' });

      if (upsertError) throw upsertError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
