import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS para llamadas desde tu web
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("URL")!;
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // payload enviado desde tu modal
    const body = await req.json();
    const { email, password, nombre, ci, especialidad, nivel, turno, estado = "Disponible" } = body;

    if (!email || !password || !nombre) {
      return new Response(JSON.stringify({ error: "Faltan: email, password, nombre" }), { status: 400, headers: corsHeaders });
    }

    // 1) Crear usuario en Auth (confirmado)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Error creando usuario" }), { status: 400, headers: corsHeaders });
    }

    const authUserId = created.user.id;

    // 2) Insertar fila en la tabla staff (asegúrate de tenerla creada con RLS según te pasé)
    const { error: insertErr } = await admin.from("staff").insert({
      id: authUserId, email, nombre, ci, especialidad, nivel, turno, estado
    });
    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, user_id: authUserId }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
