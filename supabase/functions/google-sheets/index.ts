import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-google-token',
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
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name,modifiedTime,iconLink)&orderBy=modifiedTime desc&pageSize=50",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Drive API error:", error);
    throw new Error("Failed to list spreadsheets");
  }

  return await response.json();
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

async function readSheetData(accessToken: string, spreadsheetId: string, range: string) {
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

  return await response.json();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
    let accessToken: string;

    if (googleToken) {
      // Use token passed directly from frontend
      console.log("Using Google token from header");
      accessToken = googleToken;
    } else {
      // Fallback: try to get refresh token from profiles
      console.log("No Google token in header, trying refresh token from profiles");
      
      // Create Supabase client
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

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

      // Get user's refresh token from profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("google_refresh_token")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile?.google_refresh_token) {
        console.error("No refresh token available");
        return new Response(JSON.stringify({ 
          error: "Google account not connected. Please log out and log in again with Google.",
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
    const { action, spreadsheetId, range } = await req.json();

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
