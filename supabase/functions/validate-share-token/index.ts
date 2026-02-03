import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ValidateRequest {
  token: string;
  password?: string;
}

interface TokenData {
  id: string;
  project_id: string;
  password_hash: string | null;
  expires_at: string | null;
  is_active: boolean;
  allowed_filters: Record<string, unknown> | null;
  name: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ValidateRequest = await req.json();
    const token = typeof body.token === 'string' ? body.token.trim() : body.token;
    const password = body.password;

    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Token is required', valid: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Input validation - token should be hex string
    if (!/^[a-f0-9]{48}$/i.test(token)) {
      console.log('Invalid token format');
      return new Response(
        JSON.stringify({ error: 'Invalid token format', valid: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch token data server-side
    const { data: tokenData, error: tokenError } = await supabase
      .from('share_tokens')
      .select('id, project_id, password_hash, expires_at, is_active, allowed_filters, name')
      .eq('token', token)
      .single();

    if (tokenError || !tokenData) {
      console.log('Token not found:', token.substring(0, 8) + '...');
      return new Response(
        JSON.stringify({ error: 'Token not found', valid: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shareToken = tokenData as TokenData;

    // Check if token is active
    if (!shareToken.is_active) {
      console.log('Token revoked:', shareToken.id);
      return new Response(
        JSON.stringify({ error: 'Token has been revoked', valid: false }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      console.log('Token expired:', shareToken.id);
      return new Response(
        JSON.stringify({ error: 'Token has expired', valid: false }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if password is required
    if (shareToken.password_hash) {
      if (!password) {
        // Password required but not provided - return status indicating password needed
        return new Response(
          JSON.stringify({ 
            valid: false, 
            requiresPassword: true,
            tokenName: shareToken.name 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate password using bcrypt
      const passwordValid = await bcrypt.compare(password, shareToken.password_hash);
      
      if (!passwordValid) {
        console.log('Invalid password for token:', shareToken.id);
        return new Response(
          JSON.stringify({ error: 'Invalid password', valid: false }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Log access (server-side, with IP and user agent if available)
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    await supabase.from('access_logs').insert({
      project_id: shareToken.project_id,
      share_token_id: shareToken.id,
      viewer_ip: clientIp,
      viewer_user_agent: userAgent,
      filters_used: {},
    });

    // Fetch project data to return with validation
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, name, spreadsheet_id, sheet_name, sheet_names')
      .eq('id', shareToken.project_id)
      .single();

    if (projectError || !projectData) {
      console.error('Project not found:', projectError);
      return new Response(
        JSON.stringify({ error: 'Project not found', valid: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch column mappings for the project
    const { data: mappingsData, error: mappingsError } = await supabase
      .from('column_mappings')
      .select('*')
      .eq('project_id', shareToken.project_id);

    if (mappingsError) {
      console.error('Error fetching mappings:', mappingsError);
    }

    // Return validated data with project info (never return the token or password_hash)
    return new Response(
      JSON.stringify({
        valid: true,
        projectId: shareToken.project_id,
        allowedFilters: shareToken.allowed_filters,
        tokenName: shareToken.name,
        project: {
          id: projectData.id,
          name: projectData.name,
          spreadsheet_id: projectData.spreadsheet_id,
          sheet_name: projectData.sheet_name,
          sheet_names: projectData.sheet_names,
        },
        mappings: mappingsData || [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', valid: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
