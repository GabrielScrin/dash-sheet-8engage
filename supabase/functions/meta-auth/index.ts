import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function base64UrlEncode(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getOriginFromRequest(req: Request) {
  const origin = req.headers.get('origin');
  if (origin) return origin;

  const referer = req.headers.get('referer');
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    const requestBody = req.method === 'POST' ? await req.json().catch(() => null) : null;
    const action = url.searchParams.get('action') ?? requestBody?.action;

    const META_CLIENT_ID = Deno.env.get('META_CLIENT_ID');
    const META_CLIENT_SECRET = Deno.env.get('META_CLIENT_SECRET');

    const requestOrigin = getOriginFromRequest(req);
    const defaultRedirectUri = requestOrigin ? `${requestOrigin.replace(/\/$/, '')}/app/meta/callback` : null;
    const META_REDIRECT_URI = Deno.env.get('META_REDIRECT_URI') ?? defaultRedirectUri;

    if (!META_CLIENT_ID || !META_CLIENT_SECRET) {
      throw new Error('Missing Meta configuration');
    }
    if (!META_REDIRECT_URI) {
      throw new Error('Missing Meta redirect URI (set META_REDIRECT_URI or call from a browser origin)');
    }

    if (action === 'authorize') {
      // NOTE: `read_insights` is for Page Insights and will cause "Invalid Scopes" for many apps.
      // `ads_read` is enough for listing ad accounts and pulling Ads Insights.
      const scope = Deno.env.get('META_SCOPES') ?? 'ads_read,business_management';
      const returnTo = url.searchParams.get('return_to') ?? requestBody?.return_to ?? null;
      const state = returnTo ? base64UrlEncode(JSON.stringify({ return_to: returnTo })) : undefined;
      const metaAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_CLIENT_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&response_type=code${state ? `&state=${state}` : ''}`;

      return new Response(JSON.stringify({ url: metaAuthUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code') ?? requestBody?.code;
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
