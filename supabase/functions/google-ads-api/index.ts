import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-share-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type GoogleAdsConnectionRow = {
  project_id: string;
  user_id: string;
  customer_id: string | null;
  login_customer_id: string | null;
  customer_name: string | null;
  currency_code: string | null;
  time_zone: string | null;
};

const GOOGLE_OAUTH_URL = "https://www.googleapis.com/oauth2/v3/token";
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v20";

const normalizeCustomerId = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "");

async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Secrets GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configuradas");
  }

  const response = await fetch(GOOGLE_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Falha ao renovar token do Google Ads");
  }

  return String(data.access_token);
}

async function googleAdsRequest<T>(
  accessToken: string,
  loginCustomerId: string | null | undefined,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const developerToken = Deno.env.get("GOOGLE_DEVELOPER_TOKEN");
  if (!developerToken) {
    throw new Error("Secret GOOGLE_DEVELOPER_TOKEN não configurada");
  }

  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("developer-token", developerToken);
  headers.set("Content-Type", "application/json");

  const normalizedLoginCustomerId = normalizeCustomerId(loginCustomerId);
  if (normalizedLoginCustomerId) {
    headers.set("login-customer-id", normalizedLoginCustomerId);
  }

  const response = await fetch(`${GOOGLE_ADS_API_BASE}${path}`, {
    ...init,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    // Extrai a mensagem de erro em múltiplos formatos da Google Ads API
    const detailErrors = (data?.error?.details || [])
      .flatMap((d: any) => d?.errors || [])
      .map((e: any) => e?.message)
      .filter(Boolean);
    const message =
      data?.error?.message ||
      detailErrors[0] ||
      (data?.error ? String(JSON.stringify(data.error)).slice(0, 300) : null) ||
      "Erro na API do Google Ads";
    throw new Error(message);
  }

  return data as T;
}

async function listAccessibleCustomers(accessToken: string, loginCustomerId: string | null | undefined) {
  const accessible = await googleAdsRequest<{ resourceNames?: string[] }>(
    accessToken,
    loginCustomerId,
    "/customers:listAccessibleCustomers",
    { method: "GET" },
  );

  const customerIds = (accessible.resourceNames || [])
    .map((name) => String(name).split("/").pop() || "")
    .map(normalizeCustomerId)
    .filter(Boolean);

  const customers: Array<{ id: string; name: string; currencyCode: string | null; timeZone: string | null; loginCustomerId: string | null | undefined }> = [];

  for (const customerId of customerIds) {
    try {
      const details = await googleAdsRequest<Array<{ results?: Array<{ customer?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string } }> }>>(
        accessToken,
        loginCustomerId,
        `/customers/${customerId}/googleAds:searchStream`,
        {
          method: "POST",
          body: JSON.stringify({
            query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
          }),
        },
      );

      const customer = details?.[0]?.results?.[0]?.customer;
      customers.push({
        id: customerId,
        name: String(customer?.descriptiveName || customerId),
        currencyCode: customer?.currencyCode || null,
        timeZone: customer?.timeZone || null,
        loginCustomerId,
      });
    } catch {
      customers.push({
        id: customerId,
        name: customerId,
        currencyCode: null,
        timeZone: null,
        loginCustomerId,
      });
    }
  }

  return customers;
}

async function validateCustomer(
  accessToken: string,
  customerIdValue: string | null | undefined,
  loginCustomerId: string | null | undefined,
) {
  const customerId = normalizeCustomerId(customerIdValue);
  if (!customerId) {
    throw new Error("customer_id inválido");
  }

  const details = await googleAdsRequest<Array<{ results?: Array<{ customer?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string } }> }>>(
    accessToken,
    loginCustomerId,
    `/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      body: JSON.stringify({
        query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
      }),
    },
  );

  const customer = details?.[0]?.results?.[0]?.customer;
  if (!customer?.id) {
    throw new Error("Não foi possível validar a conta Google Ads informada");
  }

  return {
    id: normalizeCustomerId(String(customer.id)),
    name: String(customer.descriptiveName || customer.id),
    currencyCode: customer.currencyCode || null,
    timeZone: customer.timeZone || null,
    loginCustomerId,
  };
}

async function fetchInsights(
  accessToken: string,
  customerIdValue: string | null | undefined,
  loginCustomerId: string | null | undefined,
  startDate: string,
  endDate: string,
) {
  const customerId = normalizeCustomerId(customerIdValue);
  if (!customerId) {
    throw new Error("customer_id não configurado. Configure o Google Ads no painel do projeto.");
  }

  const query = [
    "SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions",
    "FROM campaign",
    `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    "AND campaign.status != 'REMOVED'",
  ].join(" ");

  const response = await googleAdsRequest<Array<{
    results?: Array<{
      metrics?: {
        costMicros?: string;
        impressions?: string;
        clicks?: string;
        conversions?: number;
      };
    }>;
  }>>(
    accessToken,
    loginCustomerId,
    `/customers/${customerId}/googleAds:searchStream`,
    { method: "POST", body: JSON.stringify({ query }) },
  );

  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;

  const batches = Array.isArray(response) ? response : [response];
  for (const batch of batches) {
    for (const result of batch.results || []) {
      spend += Number(result.metrics?.costMicros || 0) / 1_000_000;
      impressions += Number(result.metrics?.impressions || 0);
      clicks += Number(result.metrics?.clicks || 0);
      conversions += Number(result.metrics?.conversions || 0);
    }
  }

  return { spend, impressions, clicks, conversions };
}

type GoogleAdsDetailRow = {
  date: string;
  campaignName: string;
  adName: string;
  cost: number;
  uniqueUsers: number;
  impressions: number;
  averageImpressionFrequencyPerUser: number;
  clicks: number;
  averageCpc: number;
  trueviewAverageCpv: number;
  trueviewViews: number;
  conversions: number;
  costPerConversion: number;
  videoViews25: number;
  videoViews50: number;
  videoViews75: number;
  videoViews100: number;
  videoLink: string | null;
  channelType: "search" | "youtube" | "display" | "shopping" | "performance_max" | "other";
  rawChannelType: string;
};

function normalizeChannelType(
  channelType: string | undefined | null,
  subType: string | undefined | null,
): GoogleAdsDetailRow["channelType"] {
  const ct = String(channelType || "").toUpperCase();
  const st = String(subType || "").toUpperCase();
  if (ct === "SEARCH") return "search";
  if (ct === "VIDEO" || ct === "DEMAND_GEN" || ct === "DISCOVERY" || st.includes("VIDEO") || st.includes("YOUTUBE")) return "youtube";
  if (ct === "DISPLAY") return "display";
  if (ct === "SHOPPING") return "shopping";
  if (ct === "PERFORMANCE_MAX") return "performance_max";
  return "other";
}

async function fetchAdPerformanceRows(
  accessToken: string,
  customerIdValue: string | null | undefined,
  loginCustomerId: string | null | undefined,
  startDate: string,
  endDate: string,
) {
  const customerId = normalizeCustomerId(customerIdValue);
  if (!customerId) {
    throw new Error("customer_id nÃ£o configurado. Configure o Google Ads no painel do projeto.");
  }

  const query = [
    "SELECT",
    "segments.date,",
    "campaign.name,",
    "campaign.advertising_channel_type,",
    "ad_group_ad.ad.id,",
    "ad_group_ad.ad.name,",
    "ad_group_ad.ad.final_urls,",
    "metrics.cost_micros,",
    "metrics.impressions,",
    "metrics.clicks,",
    "metrics.average_cpc,",
    "metrics.trueview_average_cpv,",
    "metrics.video_views,",
    "metrics.conversions,",
    "metrics.cost_per_conversion,",
    "metrics.video_quartile_p25_rate,",
    "metrics.video_quartile_p50_rate,",
    "metrics.video_quartile_p75_rate,",
    "metrics.video_quartile_p100_rate",
    "FROM ad_group_ad",
    `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    "AND campaign.status != 'REMOVED'",
    "AND ad_group_ad.status != 'REMOVED'",
    "AND metrics.cost_micros > 0",
  ].join(" ");

  type BatchResult = Array<{
    results?: Array<{
      segments?: { date?: string };
      campaign?: {
        name?: string;
        advertisingChannelType?: string;
      };
      adGroupAd?: {
        ad?: {
          id?: string | number;
          name?: string;
          finalUrls?: string[];
        };
      };
      metrics?: {
        costMicros?: string;
        uniqueUsers?: string | number;
        impressions?: string | number;
        clicks?: string | number;
        averageCpc?: string;
        trueviewAverageCpv?: number;
        videoViews?: string | number;
        conversions?: number;
        costPerConversion?: number;
        videoQuartileP25Rate?: number;
        videoQuartileP50Rate?: number;
        videoQuartileP75Rate?: number;
        videoQuartileP100Rate?: number;
      };
    }>;
  }>;

  const response = await googleAdsRequest<BatchResult>(
    accessToken,
    loginCustomerId,
    `/customers/${customerId}/googleAds:searchStream`,
    { method: "POST", body: JSON.stringify({ query }) },
  );

  const rows: GoogleAdsDetailRow[] = [];
  const batches = Array.isArray(response) ? response : [response];

  for (const batch of batches) {
    for (const result of batch.results || []) {
      const impressions = Number(result.metrics?.impressions || 0);
      // metrics.unique_users é beta/restrito — usa impressions como base de frequência
      const uniqueUsers = 0;
      const videoViews = Number(result.metrics?.videoViews || 0);
      const p25Rate = Number(result.metrics?.videoQuartileP25Rate || 0);
      const p50Rate = Number(result.metrics?.videoQuartileP50Rate || 0);
      const p75Rate = Number(result.metrics?.videoQuartileP75Rate || 0);
      const p100Rate = Number(result.metrics?.videoQuartileP100Rate || 0);
      const adId = String(result.adGroupAd?.ad?.id || "").trim();
      const adName = String(result.adGroupAd?.ad?.name || adId || "Anúncio sem nome");

      const estimatedVideoBase = videoViews > 0 ? videoViews : impressions;
      const rawChannelType = String(result.campaign?.advertisingChannelType || "");
      const rawChannelSubType = "";

      rows.push({
        date: String(result.segments?.date || ""),
        campaignName: String(result.campaign?.name || "Campanha sem nome"),
        adName,
        cost: Number(result.metrics?.costMicros || 0) / 1_000_000,
        uniqueUsers,
        impressions,
        averageImpressionFrequencyPerUser: 0,
        clicks: Number(result.metrics?.clicks || 0),
        averageCpc: Number(result.metrics?.averageCpc || 0) / 1_000_000,
        trueviewAverageCpv: Number(result.metrics?.trueviewAverageCpv || 0),
        trueviewViews: videoViews,
        conversions: Number(result.metrics?.conversions || 0),
        costPerConversion: Number(result.metrics?.costPerConversion || 0),
        videoViews25: Math.round(estimatedVideoBase * p25Rate),
        videoViews50: Math.round(estimatedVideoBase * p50Rate),
        videoViews75: Math.round(estimatedVideoBase * p75Rate),
        videoViews100: Math.round(estimatedVideoBase * p100Rate),
        videoLink: result.adGroupAd?.ad?.finalUrls?.[0] || null,
        channelType: normalizeChannelType(rawChannelType, rawChannelSubType),
        rawChannelType: rawChannelType || rawChannelSubType || "",
      });
    }
  }

  return rows.filter((row) => row.date && row.campaignName);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get("Authorization");
    const shareTokenHeader = req.headers.get("x-share-token");

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) throw new Error("projectId é obrigatório");

    let userId: string | null = null;

    if (shareTokenHeader) {
      const { data: tokenRow } = await adminClient
        .from("share_tokens")
        .select("project_id")
        .eq("token", shareTokenHeader.trim())
        .eq("is_active", true)
        .single();

      if (!tokenRow || tokenRow.project_id !== projectId) {
        return new Response(JSON.stringify({ error: "Token de compartilhamento inválido" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    } else {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let connectionQuery = adminClient
      .from("project_google_ads_connections")
      .select("project_id, user_id, customer_id, login_customer_id, customer_name, currency_code, time_zone")
      .eq("project_id", projectId);

    if (userId) {
      connectionQuery = connectionQuery.eq("user_id", userId);
    }

    const { data: connection } = await connectionQuery.maybeSingle();
    const typedConnection = (connection as GoogleAdsConnectionRow | null) ?? null;

    let tokenOwnerUserId = typedConnection?.user_id ?? userId;
    if (!tokenOwnerUserId) {
      const { data: projectOwner } = await adminClient
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .maybeSingle();
      tokenOwnerUserId = String(projectOwner?.user_id || "").trim() || null;
    }

    if (!tokenOwnerUserId) {
      return new Response(JSON.stringify({ error: "Projeto não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokenRow, error: tokenError } = await adminClient
      .from("service_tokens")
      .select("refresh_token")
      .eq("user_id", tokenOwnerUserId)
      .eq("provider", "google_ads")
      .maybeSingle();

    if (tokenError || !tokenRow?.refresh_token) {
      return new Response(JSON.stringify({ error: "Google Ads não conectado. Autorize sua conta para continuar." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await refreshAccessToken(String(tokenRow.refresh_token));
    const loginCustomerId = String(body?.loginCustomerId || typedConnection?.login_customer_id || "").trim() || null;
    const selectedCustomerId = String(body?.customerId || typedConnection?.customer_id || "").trim() || null;

    if (action === "insights") {
      const startDate = String(body?.startDate || "").trim();
      const endDate = String(body?.endDate || "").trim();
      if (!startDate || !endDate) throw new Error("startDate e endDate são obrigatórios");

      const totals = await fetchInsights(accessToken, selectedCustomerId, loginCustomerId, startDate, endDate);
      return new Response(JSON.stringify({ totals }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "portal-overview") {
      const startDate = String(body?.startDate || "").trim();
      const endDate = String(body?.endDate || "").trim();
      if (!startDate || !endDate) throw new Error("startDate e endDate são obrigatórios");

      const customerId = normalizeCustomerId(selectedCustomerId);
      if (!customerId) throw new Error("customer_id não configurado. Configure o Google Ads no painel do projeto.");

      const timeseriesQuery = [
        "SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions",
        "FROM campaign",
        `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
        "AND campaign.status != 'REMOVED'",
      ].join(" ");

      const campaignsQuery = [
        "SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions",
        "FROM campaign",
        `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
        "AND campaign.status != 'REMOVED'",
      ].join(" ");

      type BatchResult = Array<{
        results?: Array<{
          segments?: { date?: string };
          campaign?: { id?: string; name?: string };
          metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
        }>;
      }>;

      const [tsRes, campRes] = await Promise.all([
        googleAdsRequest<BatchResult>(accessToken, loginCustomerId, `/customers/${customerId}/googleAds:searchStream`, {
          method: "POST",
          body: JSON.stringify({ query: timeseriesQuery }),
        }),
        googleAdsRequest<BatchResult>(accessToken, loginCustomerId, `/customers/${customerId}/googleAds:searchStream`, {
          method: "POST",
          body: JSON.stringify({ query: campaignsQuery }),
        }),
      ]);

      const byDate = new Map<string, { date: string; spend: number; conversions: number; impressions: number; clicks: number }>();
      for (const batch of (Array.isArray(tsRes) ? tsRes : [tsRes])) {
        for (const result of (batch.results || [])) {
          const date = String(result.segments?.date || "");
          if (!date) continue;
          const cur = byDate.get(date) || { date, spend: 0, conversions: 0, impressions: 0, clicks: 0 };
          cur.spend += Number(result.metrics?.costMicros || 0) / 1_000_000;
          cur.conversions += Number(result.metrics?.conversions || 0);
          cur.impressions += Number(result.metrics?.impressions || 0);
          cur.clicks += Number(result.metrics?.clicks || 0);
          byDate.set(date, cur);
        }
      }
      const timeseries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

      const byCampaign = new Map<string, { id: string; name: string; spend: number; conversions: number; impressions: number; clicks: number }>();
      for (const batch of (Array.isArray(campRes) ? campRes : [campRes])) {
        for (const result of (batch.results || [])) {
          const id = String(result.campaign?.id || "");
          if (!id) continue;
          const name = String(result.campaign?.name || id);
          const cur = byCampaign.get(id) || { id, name, spend: 0, conversions: 0, impressions: 0, clicks: 0 };
          cur.spend += Number(result.metrics?.costMicros || 0) / 1_000_000;
          cur.conversions += Number(result.metrics?.conversions || 0);
          cur.impressions += Number(result.metrics?.impressions || 0);
          cur.clicks += Number(result.metrics?.clicks || 0);
          byCampaign.set(id, cur);
        }
      }
      const campaigns = Array.from(byCampaign.values()).map((c) => ({
        id: c.id,
        name: c.name,
        spend: c.spend,
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        conversions: c.conversions,
      }));

      const totals = timeseries.reduce(
        (acc, r) => ({ spend: acc.spend + r.spend, conversions: acc.conversions + r.conversions, impressions: acc.impressions + r.impressions }),
        { spend: 0, conversions: 0, impressions: 0 },
      );

      return new Response(JSON.stringify({ timeseries, campaigns, totals }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ad-performance") {
      const startDate = String(body?.startDate || "").trim();
      const endDate = String(body?.endDate || "").trim();
      if (!startDate || !endDate) throw new Error("startDate e endDate sÃ£o obrigatÃ³rios");

      const rows = await fetchAdPerformanceRows(accessToken, selectedCustomerId, loginCustomerId, startDate, endDate);
      return new Response(JSON.stringify({ rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list-accessible-customers") {
      const customers = await listAccessibleCustomers(accessToken, loginCustomerId);
      return new Response(JSON.stringify({ customers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "validate-connection") {
      if (!userId) {
        throw new Error("Autenticação de usuário é obrigatória para validar a conexão");
      }

      const customer = await validateCustomer(accessToken, selectedCustomerId, loginCustomerId);

      await adminClient
        .from("project_google_ads_connections")
        .upsert({
          project_id: projectId,
          user_id: userId,
          customer_id: customer.id,
          customer_name: customer.name,
          currency_code: customer.currencyCode,
          time_zone: customer.timeZone,
          login_customer_id: customer.loginCustomerId,
          last_validated_at: new Date().toISOString(),
        }, { onConflict: "project_id" });

      return new Response(JSON.stringify({ customer, valid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Unexpected error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
