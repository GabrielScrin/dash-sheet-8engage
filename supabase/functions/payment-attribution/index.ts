import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-share-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-webhook-secret",
};

type JsonRecord = Record<string, unknown>;

const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB max payload
const MAX_STRING_LENGTH = 500;

const sanitizeString = (value: unknown, maxLen = MAX_STRING_LENGTH): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim().substring(0, maxLen).replace(/[<>]/g, "");
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
};

const deepGet = (obj: unknown, paths: string[]) => {
  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = obj;
    let ok = true;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in (current as JsonRecord))) {
        ok = false;
        break;
      }
      current = (current as JsonRecord)[part];
    }
    if (ok && current !== undefined && current !== null && String(current).trim() !== "") {
      return current;
    }
  }
  return null;
};

const parseDate = (value: unknown) => {
  if (!value) return null;
  const asDate = new Date(String(value));
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
};

const statusToInternal = (statusRaw: unknown) => {
  const status = String(statusRaw ?? "").toLowerCase();
  if (["approved", "paid", "completed", "billet_printed", "finished"].includes(status)) return "approved";
  if (["refunded", "chargeback", "canceled", "cancelled"].includes(status)) return "refunded";
  if (["pending", "processing", "waiting_payment"].includes(status)) return "pending";
  return status || "pending";
};

const mergeMetaFields = (payload: JsonRecord, tracking: JsonRecord) => ({
  campaign_id: String(deepGet(payload, ["campaign_id", "utm.campaign_id", "metadata.campaign_id"]) ?? tracking.campaign_id ?? "") || null,
  adset_id: String(deepGet(payload, ["adset_id", "utm.adset_id", "metadata.adset_id"]) ?? tracking.adset_id ?? "") || null,
  ad_id: String(deepGet(payload, ["ad_id", "utm.ad_id", "metadata.ad_id"]) ?? tracking.ad_id ?? "") || null,
  campaign_name: String(deepGet(payload, ["campaign_name", "utm_campaign_name", "metadata.campaign_name"]) ?? "") || null,
  adset_name: String(deepGet(payload, ["adset_name", "utm_adset_name", "metadata.adset_name"]) ?? "") || null,
  ad_name: String(deepGet(payload, ["ad_name", "utm_ad_name", "metadata.ad_name"]) ?? "") || null,
});

const readTracking = (payload: JsonRecord): JsonRecord => {
  const utmSource = deepGet(payload, ["utm_source", "utm.source", "tracking.utm_source", "metadata.utm_source"]);
  const utmMedium = deepGet(payload, ["utm_medium", "utm.medium", "tracking.utm_medium", "metadata.utm_medium"]);
  const utmCampaign = deepGet(payload, ["utm_campaign", "utm.campaign", "tracking.utm_campaign", "metadata.utm_campaign"]);
  const utmContent = deepGet(payload, ["utm_content", "utm.content", "tracking.utm_content", "metadata.utm_content"]);
  const utmTerm = deepGet(payload, ["utm_term", "utm.term", "tracking.utm_term", "metadata.utm_term"]);
  const fbclid = deepGet(payload, ["fbclid", "tracking.fbclid", "metadata.fbclid"]);
  const fbc = deepGet(payload, ["fbc", "tracking.fbc", "metadata.fbc"]);
  const fbp = deepGet(payload, ["fbp", "tracking.fbp", "metadata.fbp"]);

  return {
    utm_source: utmSource ? String(utmSource) : null,
    utm_medium: utmMedium ? String(utmMedium) : null,
    utm_campaign: utmCampaign ? String(utmCampaign) : null,
    utm_content: utmContent ? String(utmContent) : null,
    utm_term: utmTerm ? String(utmTerm) : null,
    fbclid: fbclid ? String(fbclid) : null,
    fbc: fbc ? String(fbc) : null,
    fbp: fbp ? String(fbp) : null,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Public webhook ingestion (provider POST)
    if (action === "ingest-webhook") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Webhook secret is REQUIRED
      if (!webhookSecret) {
        return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const incomingSecret = req.headers.get("x-webhook-secret");
      if (incomingSecret !== webhookSecret) {
        return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Enforce payload size limit
      const contentLength = Number(req.headers.get("content-length") || "0");
      if (contentLength > MAX_PAYLOAD_SIZE) {
        return new Response(JSON.stringify({ error: "Payload too large" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawBody = await req.text().catch(() => "");
      if (rawBody.length > MAX_PAYLOAD_SIZE) {
        return new Response(JSON.stringify({ error: "Payload too large" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const providerRaw = url.searchParams.get("provider") || "manual";
      const provider = ["hotmart", "eduzz", "kiwify", "manual"].includes(providerRaw) ? providerRaw : "manual";

      let payload: JsonRecord;
      try {
        payload = JSON.parse(rawBody) as JsonRecord;
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const externalOrderId = sanitizeString(
          deepGet(payload, [
            "order_id",
            "id",
            "transaction",
            "transaction_id",
            "purchase.order_id",
            "data.order_id",
            "data.id",
          ]),
          100,
        );

      if (!externalOrderId) {
        return new Response(JSON.stringify({ error: "Missing external order id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tracking = readTracking(payload);
      const metaFields = mergeMetaFields(payload, tracking);

      const projectIdRaw = deepGet(payload, ["project_id", "metadata.project_id", "tracking.project_id"]);
      const userIdRaw = deepGet(payload, ["user_id", "metadata.user_id", "tracking.user_id"]);
      const sessionKeyRaw = deepGet(payload, ["session_key", "metadata.session_key", "tracking.session_key"]);

      const approvedAt = parseDate(
        deepGet(payload, ["approved_at", "purchase.approved_date", "data.approved_at", "event_date", "created_at"]) ??
          new Date().toISOString(),
      );
      const grossAmount = Math.min(Math.max(toNumber(
        deepGet(payload, ["gross_amount", "amount", "purchase.price.value", "data.amount", "value"]),
      ), 0), 99999999);
      const netAmount = Math.min(Math.max(toNumber(
        deepGet(payload, ["net_amount", "purchase.net.value", "data.net_amount", "net_value"]) ?? grossAmount,
      ), 0), 99999999);
      const feeAmount = Math.min(Math.max(toNumber(deepGet(payload, ["fee_amount", "fees", "purchase.fees.value"])), 0), 99999999);
      const refundedAmount = Math.min(Math.max(toNumber(deepGet(payload, ["refunded_amount", "refund_value"])), 0), 99999999);
      const status = statusToInternal(
        deepGet(payload, ["status", "purchase.status", "event", "event_name", "data.status"]),
      );
      const currency = sanitizeString(deepGet(payload, ["currency", "purchase.price.currency_value"]) ?? "BRL", 10);
      const customerEmail = sanitizeString(
        deepGet(payload, ["customer_email", "buyer.email", "purchase.buyer.email", "data.customer.email"]),
        255,
      );
      const customerId = sanitizeString(
        deepGet(payload, ["customer_id", "buyer.id", "purchase.buyer.id", "data.customer.id"]),
        100,
      );

      let attributionSessionId: string | null = null;

      if (userIdRaw && sessionKeyRaw) {
        const { data: sessionData } = await supabase
          .from("attribution_sessions")
          .select("id")
          .eq("user_id", String(userIdRaw))
          .eq("session_key", String(sessionKeyRaw))
          .maybeSingle();
        attributionSessionId = sessionData?.id ?? null;
      }

      const { error: upsertError } = await supabase.from("payment_orders").upsert(
        {
          user_id: userIdRaw ? String(userIdRaw) : null,
          project_id: projectIdRaw ? String(projectIdRaw) : null,
          provider,
          external_order_id: externalOrderId,
          status,
          approved_at: approvedAt,
          currency,
          gross_amount: grossAmount,
          net_amount: netAmount,
          fee_amount: feeAmount,
          refunded_amount: refundedAmount,
          attribution_session_id: attributionSessionId,
          campaign_id: metaFields.campaign_id,
          adset_id: metaFields.adset_id,
          ad_id: metaFields.ad_id,
          campaign_name: metaFields.campaign_name,
          adset_name: metaFields.adset_name,
          ad_name: metaFields.ad_name,
          utm_source: tracking.utm_source,
          utm_medium: tracking.utm_medium,
          utm_campaign: tracking.utm_campaign,
          utm_content: tracking.utm_content,
          utm_term: tracking.utm_term,
          fbclid: tracking.fbclid,
          fbc: tracking.fbc,
          fbp: tracking.fbp,
          customer_email: customerEmail || null,
          customer_id: customerId || null,
          tracking,
          raw_payload: payload,
        },
        { onConflict: "provider,external_order_id" },
      );

      if (upsertError) {
        // If user_id is missing, the row fails not-null. Surface explicit message for integration config.
        return new Response(
          JSON.stringify({
            error: upsertError.message,
            hint: "Ensure webhook payload contains metadata.user_id and metadata.project_id.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ success: true, externalOrderId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Authenticated actions
    const authHeader = req.headers.get("Authorization");
    const shareToken = req.headers.get("x-share-token");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = String(claimsData.claims.sub);
    } else if (shareToken) {
      const { data: shareData, error: shareError } = await supabase
        .from("share_tokens")
        .select("project_id,is_active,expires_at")
        .eq("token", shareToken)
        .single();

      if (shareError || !shareData?.is_active) {
        return new Response(JSON.stringify({ error: "Invalid share token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (shareData.expires_at && new Date(shareData.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Share token expired" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("user_id")
        .eq("id", shareData.project_id)
        .single();
      if (projectError || !projectData?.user_id) {
        return new Response(JSON.stringify({ error: "Project owner not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = String(projectData.user_id);
    } else {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2.1) Upsert attribution session (from landing/checkout)
    if (action === "upsert-session") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = (await req.json().catch(() => ({}))) as JsonRecord;
      const sessionKey = String(body.sessionKey ?? "").trim();
      if (!sessionKey) {
        return new Response(JSON.stringify({ error: "sessionKey is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = {
        user_id: userId,
        project_id: body.projectId ? String(body.projectId) : null,
        session_key: sessionKey,
        landing_url: body.landingUrl ? String(body.landingUrl) : null,
        utm_source: body.utm_source ? String(body.utm_source) : null,
        utm_medium: body.utm_medium ? String(body.utm_medium) : null,
        utm_campaign: body.utm_campaign ? String(body.utm_campaign) : null,
        utm_content: body.utm_content ? String(body.utm_content) : null,
        utm_term: body.utm_term ? String(body.utm_term) : null,
        campaign_id: body.campaign_id ? String(body.campaign_id) : null,
        adset_id: body.adset_id ? String(body.adset_id) : null,
        ad_id: body.ad_id ? String(body.ad_id) : null,
        campaign_name: body.campaign_name ? String(body.campaign_name) : null,
        adset_name: body.adset_name ? String(body.adset_name) : null,
        ad_name: body.ad_name ? String(body.ad_name) : null,
        fbclid: body.fbclid ? String(body.fbclid) : null,
        fbc: body.fbc ? String(body.fbc) : null,
        fbp: body.fbp ? String(body.fbp) : null,
        gclid: body.gclid ? String(body.gclid) : null,
        client_ip: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      };

      const { error } = await supabase.from("attribution_sessions").upsert(data, {
        onConflict: "user_id,session_key",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, sessionKey }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2.2) Attribution summary for dashboard (campaign/adset/ad)
    if (action === "attribution-summary") {
      const projectId = url.searchParams.get("projectId");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      const campaignIds = (url.searchParams.get("campaignIds") || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      let query = supabase
        .from("payment_orders")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["approved", "paid", "completed", "finished"]);

      if (projectId) query = query.eq("project_id", projectId);
      if (startDate) query = query.gte("approved_at", `${startDate}T00:00:00.000Z`);
      if (endDate) query = query.lte("approved_at", `${endDate}T23:59:59.999Z`);

      const { data, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rows = (data || []).filter((row: any) => {
        if (!campaignIds.length) return true;
        return campaignIds.includes(String(row.campaign_id || ""));
      });

      const summary = rows.reduce(
        (acc: any, row: any) => {
          const gross = toNumber(row.gross_amount);
          const net = toNumber(row.net_amount || gross);
          const fees = toNumber(row.fee_amount);
          const refunds = toNumber(row.refunded_amount);
          acc.orders += 1;
          acc.grossRevenue += gross;
          acc.netRevenue += net;
          acc.fees += fees;
          acc.refunds += refunds;
          return acc;
        },
        { orders: 0, grossRevenue: 0, netRevenue: 0, fees: 0, refunds: 0 },
      );

      const makeGrouped = (idKey: "campaign_id" | "adset_id" | "ad_id", nameKey: "campaign_name" | "adset_name" | "ad_name") => {
        const grouped = new Map<string, { id: string; name: string; orders: number; grossRevenue: number; netRevenue: number }>();
        for (const row of rows as any[]) {
          const id = String(row[idKey] || "").trim();
          const name = String(row[nameKey] || "").trim();
          if (!id && !name) continue;
          const key = id || name;
          const current = grouped.get(key) || {
            id: id || key,
            name: name || key,
            orders: 0,
            grossRevenue: 0,
            netRevenue: 0,
          };
          current.orders += 1;
          current.grossRevenue += toNumber(row.gross_amount);
          current.netRevenue += toNumber(row.net_amount || row.gross_amount);
          grouped.set(key, current);
        }
        return Array.from(grouped.values()).sort((a, b) => b.netRevenue - a.netRevenue);
      };

      return new Response(
        JSON.stringify({
          summary,
          campaigns: makeGrouped("campaign_id", "campaign_name"),
          adsets: makeGrouped("adset_id", "adset_name"),
          ads: makeGrouped("ad_id", "ad_name"),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

