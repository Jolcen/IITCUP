// set-staff-password: cambia la contraseña de un usuario (solo administrador)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // 1) Validar JWT del que llama (debe ser alguien logueado)
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "")?.trim();
    if (!jwt) return new Response(JSON.stringify({ error: "Falta Authorization" }), { status: 401, headers: corsHeaders });

    const { data: meAuth, error: meErr } = await admin.auth.getUser(jwt);
    if (meErr || !meAuth?.user?.id) {
      return new Response(JSON.stringify({ error: "No session", detail: meErr?.message }), { status: 401, headers: corsHeaders });
    }

    // 2) Debe ser administrador en tu tabla app_users
    const meId = meAuth.user.id;
    const { data: meRow, error: rolErr } = await admin.from("app_users").select("rol").eq("id", meId).single();
    if (rolErr) return new Response(JSON.stringify({ error: "No se pudo verificar rol", detail: rolErr.message }), { status: 400, headers: corsHeaders });
    if ((meRow?.rol || "").toLowerCase() !== "administrador") {
      return new Response(JSON.stringify({ error: "Solo administrador" }), { status: 403, headers: corsHeaders });
    }

    // 3) Validar payload
    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password || new_password.length < 8) {
      return new Response(JSON.stringify({ error: "Campos inválidos (user_id, new_password>=8)" }), { status: 400, headers: corsHeaders });
    }

    // 4) Cambiar contraseña en Auth
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Excepción", detail: String(e?.message ?? e) }), { status: 500, headers: corsHeaders });
  }
});
