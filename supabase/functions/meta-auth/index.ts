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
<<<<<<< HEAD

    const requestBody = req.method === 'POST' ? await req.json().catch(() => null) : null;
    const action = url.searchParams.get('action') ?? requestBody?.action;

    const META_CLIENT_ID = Deno.env.get('META_CLIENT_ID');
    const META_CLIENT_SECRET = Deno.env.get('META_CLIENT_SECRET');

    const requestOrigin = getOriginFromRequest(req);
    const defaultRedirectUri = requestOrigin ? `${requestOrigin.replace(/\/$/, '')}/app/meta/callback` : null;
    const META_REDIRECT_URI = Deno.env.get('META_REDIRECT_URI') ?? defaultRedirectUri;
=======
    const action = url.searchParams.get('action');

    const META_CLIENT_ID = Deno.env.get('META_CLIENT_ID');
    const META_CLIENT_SECRET = Deno.env.get('META_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
>>>>>>> 3bf5818de4769fd10ee1c0daddec6d9598587078

    if (!META_CLIENT_ID || !META_CLIENT_SECRET) {
      throw new Error('Missing Meta configuration');
    }
    if (!META_REDIRECT_URI) {
      throw new Error('Missing Meta redirect URI (set META_REDIRECT_URI or call from a browser origin)');
    }

<<<<<<< HEAD
    if (action === 'authorize') {
      // NOTE: `read_insights` is for Page Insights and will cause "Invalid Scopes" for many apps.
      // `ads_read` is enough for listing ad accounts and pulling Ads Insights.
      const scope = Deno.env.get('META_SCOPES') ?? 'ads_read,business_management';
      const returnTo = url.searchParams.get('return_to') ?? requestBody?.return_to ?? null;
      const state = returnTo ? base64UrlEncode(JSON.stringify({ return_to: returnTo })) : undefined;
      const metaAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_CLIENT_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&response_type=code${state ? `&state=${state}` : ''}`;
=======
    // Validate JWT manually using getClaims
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
>>>>>>> 3bf5818de4769fd10ee1c0daddec6d9598587078

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

    // Build redirect URI - use frontend callback page
    const META_REDIRECT_URI = `${url.origin}/functions/v1/meta-auth?action=callback`;

    if (action === 'authorize') {
      const scope = 'ads_read,read_insights,business_management';
      const metaAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_CLIENT_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${scope}&response_type=code&state=${userId}`;

      console.log('Generated Meta auth URL for user:', userId);
      return new Response(JSON.stringify({ url: metaAuthUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'callback') {
<<<<<<< HEAD
      const code = url.searchParams.get('code') ?? requestBody?.code;
=======
      const code = url.searchParams.get('code');
      const stateUserId = url.searchParams.get('state');
      
>>>>>>> 3bf5818de4769fd10ee1c0daddec6d9598587078
      if (!code) throw new Error('No code provided');

      console.log('Processing callback with code for user:', stateUserId || userId);

      // 1. Exchange code for access token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_CLIENT_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&client_secret=${META_CLIENT_SECRET}&code=${code}`
      );
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        console.error('Token exchange error:', tokenData.error);
        throw new Error(tokenData.error.message);
      }

      const shortLivedToken = tokenData.access_token;

      // 2. Exchange for long-lived token
      const longTokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_CLIENT_ID}&client_secret=${META_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`
      );
      const longTokenData = await longTokenRes.json();

      if (longTokenData.error) {
        console.error('Long-lived token error:', longTokenData.error);
        throw new Error(longTokenData.error.message);
      }

      const longLivedToken = longTokenData.access_token;
      const expiresIn = longTokenData.expires_in ? new Date(Date.now() + longTokenData.expires_in * 1000).toISOString() : null;

      // Use state userId if available (from redirect), otherwise use authenticated user
      const targetUserId = stateUserId || userId;

      // UPSERT token
      const { error: upsertError } = await supabase
        .from('service_tokens')
        .upsert({
          user_id: targetUserId,
          provider: 'meta',
          access_token: longLivedToken,
          expires_at: expiresIn,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,provider' });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        throw upsertError;
      }

      console.log('Token saved successfully for user:', targetUserId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
