// Edge Function: admin-delete-user
// Permite al administrador eliminar un usuario de Supabase Auth
// usando la Service Role Key (que nunca debe ir al frontend).
//
// DESPLIEGUE:
//   supabase functions deploy admin-delete-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar sesión del llamador
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: callerUser } } = await supabaseUser.auth.getUser();
    if (!callerUser) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar rol admin
    const { data: callerProfile } = await supabaseAdmin
      .from('usuarioalmacen')
      .select('rol')
      .eq('user_id', callerUser.id)
      .single();

    if (!callerProfile || callerProfile.rol !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Solo los administradores pueden eliminar usuarios' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId } = await req.json();
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Eliminar de Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
