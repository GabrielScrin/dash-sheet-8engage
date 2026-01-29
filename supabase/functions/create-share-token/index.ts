import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CreateTokenRequest {
  project_id: string;
  name?: string;
  password?: string;
  expires_at?: string | null;
  allowed_filters?: Record<string, unknown>;
}

function generateToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get auth header to verify user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to check ownership
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CreateTokenRequest = await req.json();

    // Input validation
    if (!body.project_id || typeof body.project_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'project_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(body.project_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid project_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password if provided
    if (body.password !== undefined && body.password !== null) {
      if (typeof body.password !== 'string' || body.password.length < 4) {
        return new Response(
          JSON.stringify({ error: 'Password must be at least 4 characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (body.password.length > 100) {
        return new Response(
          JSON.stringify({ error: 'Password too long' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate name if provided
    if (body.name !== undefined && body.name !== null) {
      if (typeof body.name !== 'string' || body.name.length > 100) {
        return new Response(
          JSON.stringify({ error: 'Name must be less than 100 characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id')
      .eq('id', body.project_id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (project.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to create tokens for this project' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate secure token
    const token = generateToken();

    // Hash password with bcrypt if provided
    let passwordHash: string | null = null;
    if (body.password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(body.password, salt);
    }

    // Create the share token
    const { data: shareToken, error: insertError } = await supabaseAdmin
      .from('share_tokens')
      .insert({
        project_id: body.project_id,
        token,
        name: body.name || 'Link de Acesso',
        password_hash: passwordHash,
        expires_at: body.expires_at || null,
        allowed_filters: body.allowed_filters || {},
        is_active: true,
        created_by: user.id,
      })
      .select('id, token, name, expires_at, is_active, created_at, password_hash')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return token data (include password_hash presence but not the actual hash)
    return new Response(
      JSON.stringify({
        id: shareToken.id,
        token: shareToken.token,
        name: shareToken.name,
        expires_at: shareToken.expires_at,
        is_active: shareToken.is_active,
        created_at: shareToken.created_at,
        has_password: !!shareToken.password_hash,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal create-share-token error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
