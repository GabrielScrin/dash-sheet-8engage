import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64UrlEncode(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getOriginFromRequest(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin;

  const referer = req.headers.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const requestBody = req.method === "POST" ? await req.json().catch(() => null) : null;
    const action = url.searchParams.get("action") ?? requestBody?.action;

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    const requestOrigin = getOriginFromRequest(req);
    const defaultRedirectUri = requestOrigin ? `${requestOrigin.replace(/\/$/, "")}/app/google-ads/callback` : null;
    const redirectUri = Deno.env.get("GOOGLE_ADS_REDIRECT_URI") ?? defaultRedirectUri;

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google Ads configuration");
    }
    if (!redirectUri) {
      throw new Error("Missing Google Ads redirect URI");
    }

    if (action === "authorize") {
      const returnTo = url.searchParams.get("return_to") ?? requestBody?.return_to ?? null;
      const state = returnTo ? base64UrlEncode(JSON.stringify({ return_to: returnTo })) : undefined;
      const scope = "https://www.googleapis.com/auth/adwords";

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&scope=${encodeURIComponent(scope)}` +
        (state ? `&state=${state}` : "");

      return new Response(JSON.stringify({ url: authUrl, redirect_uri: redirectUri, scope }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "callback") {
      const code = url.searchParams.get("code") ?? requestBody?.code;
      if (!code) throw new Error("No code provided");

      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Missing Supabase Auth Token");

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || tokenData?.error) {
        throw new Error(tokenData?.error_description || tokenData?.error || "Failed to exchange Google Ads token");
      }

      const refreshToken = String(tokenData.refresh_token || "").trim();
      const accessToken = String(tokenData.access_token || "").trim();
      if (!refreshToken || !accessToken) {
        throw new Error("Google Ads authorization did not return a refresh token");
      }

      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

      const adminClient = createClient(supabaseUrl, serviceKey);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();
      if (userError || !user) throw new Error("Invalid User");

      const { error: upsertError } = await adminClient
        .from("service_tokens")
        .upsert(
          {
            user_id: user.id,
            provider: "google_ads",
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: tokenData.token_type || "Bearer",
            scope: tokenData.scope || "https://www.googleapis.com/auth/adwords",
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id, provider" },
        );

      if (upsertError) throw upsertError;

      return new Response(JSON.stringify({ success: true, user_id: user.id, expires_at: expiresAt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Unexpected error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
