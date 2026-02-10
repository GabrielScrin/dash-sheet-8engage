import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-google-token, x-share-token',
};

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Token refresh failed:", error);
    throw new Error("Failed to refresh Google access token");
  }

  const data: TokenResponse = await response.json();
  return data.access_token;
}

async function listSpreadsheets(accessToken: string) {
  const files: any[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "nextPageToken,files(id,name,modifiedTime,iconLink)",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Drive API error:", error);
      throw new Error("Failed to list spreadsheets");
    }

    const data = await response.json();
    if (Array.isArray(data?.files)) files.push(...data.files);
    pageToken = data?.nextPageToken || null;

    if (files.length >= 2000) break;
  } while (pageToken);

  return { files };
}

async function getSheetTabs(accessToken: string, spreadsheetId: string) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Sheets API error:", error);
    throw new Error("Failed to get sheet tabs");
  }

  const data = await response.json();
  return data.sheets.map((sheet: any) => ({
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
    index: sheet.properties.index,
  }));
}

import { Redis } from "https://esm.sh/@upstash/redis@1.25.0";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@0.4.3";

const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

// Rate limiter: 100 requests per hour per IP
const ratelimit = redis ? new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(100, "1h"),
  analytics: true,
}) : null;

async function readSheetData(accessToken: string, spreadsheetId: string, range: string) {
  const cacheKey = `sheet_data:${spreadsheetId}:${range}`;

  if (redis) {
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log("Serving from cache:", cacheKey);
        return cachedData;
      }
    } catch (e) {
      console.error("Redis get error:", e);
    }
  }

  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Sheets API error:", error);
    throw new Error("Failed to read sheet data");
  }

  const data = await response.json();

  if (redis) {
    try {
      // Cache for 5 minutes (300 seconds)
      await redis.set(cacheKey, data, { ex: 300 });
      console.log("Cached data for:", cacheKey);
    } catch (e) {
      console.error("Redis set error:", e);
    }
  }

  return data;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Rate limiting check
    if (ratelimit) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const { success, reset } = await ratelimit.limit(clientIp);
      
      if (!success) {
        console.log(`Rate limit exceeded for IP: ${clientIp}`);
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please try again later."
        }), {
          status: 429,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000))
          },
        });
      }
    }

    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for Google token passed directly via header
    const googleToken = req.headers.get("x-google-token");
    const shareToken = req.headers.get("x-share-token");
    let accessToken: string;

    if (googleToken) {
      // Use token passed directly from frontend
      console.log("Using Google token from header");
      accessToken = googleToken;
    } else {
      // Create Supabase client
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      let ownerUserId: string | null = null;

      if (shareToken) {
        console.log("Using share token for authentication");
        const { data: tokenData, error: tokenError } = await supabase
          .from("share_tokens")
          .select("project_id, is_active, expires_at")
          .eq("token", shareToken)
          .single();

        if (tokenError || !tokenData || !tokenData.is_active) {
          console.error("Invalid or inactive share token");
          return new Response(JSON.stringify({ error: "Invalid share token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check expiry
        if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
          return new Response(JSON.stringify({ error: "Share token expired" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get project owner
        const { data: project, error: projectError } = await supabase
          .from("projects")
          .select("user_id")
          .eq("id", tokenData.project_id)
          .single();

        if (projectError || !project) {
          throw new Error("Project owner not found");
        }
        ownerUserId = project.user_id;

      } else {
        // Fallback: try to get refresh token from profiles for the logged in user
        console.log("No Google token or share token, trying refresh token from profiles");

        // Get user from JWT
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
          console.error("Auth error:", userError);
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        ownerUserId = user.id;
      }

      // Get user's refresh token from profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("google_refresh_token")
        .eq("user_id", ownerUserId)
        .single();

      if (profileError || !profile?.google_refresh_token) {
        console.error("No refresh token available");
        return new Response(JSON.stringify({
          error: "Google account not connected or refresh token missing.",
          code: "GOOGLE_RECONNECT_REQUIRED"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get fresh access token
      accessToken = await refreshAccessToken(profile.google_refresh_token);
    }


    // Parse request body
    const body = await req.json();
    const { action, spreadsheetId, range } = body;
    console.log(`Parsed body: action=${action}, spreadsheetId=${spreadsheetId}, range=${range}`);

    let result;
    switch (action) {
      case "list-spreadsheets":
        result = await listSpreadsheets(accessToken);
        break;
      case "get-sheets":
        if (!spreadsheetId) {
          throw new Error("spreadsheetId is required");
        }
        result = await getSheetTabs(accessToken, spreadsheetId);
        break;
      case "read-data":
        if (!spreadsheetId || !range) {
          throw new Error("spreadsheetId and range are required");
        }
        result = await readSheetData(accessToken, spreadsheetId, range);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`Action ${action} completed successfully`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
