import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StoreGoogleTokensRequest {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  scope?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const requestBody = req.method === "POST" ? await req.json().catch(() => null) : null;
    const action = url.searchParams.get("action") ?? requestBody?.action;

    if (action !== "store-tokens") {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Supabase Auth Token");
    }

    const body = (requestBody ?? {}) as StoreGoogleTokensRequest;
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

    if (!refreshToken) {
      throw new Error("Missing Google refresh token");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Invalid user");
    }

    const { error: upsertError } = await supabase
      .from("service_tokens")
      .upsert(
        {
          user_id: user.id,
          provider: "google",
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: body.tokenType ?? "Bearer",
          scope: body.scope ?? null,
          expires_at: body.expiresAt ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, provider" },
      );

    if (upsertError) {
      throw upsertError;
    }

    return new Response(JSON.stringify({ success: true, user_id: user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[google-auth] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
