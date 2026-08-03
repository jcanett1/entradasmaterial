// Edge Function: admin-update-password
// Permite al administrador cambiar la contraseña de cualquier usuario
// usando la Service Role Key de Supabase (que nunca debe ir al frontend).
//
// DESPLIEGUE:
//   supabase functions deploy admin-update-password
//
// VARIABLES DE ENTORNO requeridas en Supabase Dashboard:
//   SUPABASE_URL         → URL de tu proyecto (se inyecta automáticamente)
//   SUPABASE_SERVICE_ROLE_KEY → Clave de servicio (Settings → API → service_role)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Manejar preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verificar que quien llama tiene sesión válida (es un usuario autenticado)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Crear cliente con Service Role para operaciones de admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar que el usuario que llama es admin en usuarioalmacen
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
        JSON.stringify({ error: 'Solo los administradores pueden cambiar contraseñas de otros usuarios' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obtener parámetros del body
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ error: 'userId y newPassword son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Actualizar contraseña usando Admin API
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

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
