// Deno Edge Function: crear usuario (Auth Admin) + fila en app_users + log (extras SOLO al log)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_ROLES = new Set([
  "administrador",
  "encargado",
  "operador",
  "secretario",
  "asistente",
]);

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Cliente con el JWT del usuario que invoca (desde tu web)
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const authed = createClient(supabaseUrl, jwt, { auth: { persistSession: false } });

    const me = await authed.auth.getUser();
    const meId = me.data.user?.id ?? null;
    if (!meId) {
      return new Response(JSON.stringify({ error: "No session" }), { status: 401, headers: corsHeaders });
    }

    // Verificar que quien invoca sea administrador
    const { data: meRow, error: meErr } = await authed
      .from("app_users").select("rol").eq("id", meId).single();
    if (meErr) {
      return new Response(JSON.stringify({ error: "No se pudo verificar el rol del usuario actual", detail: meErr.message }), { status: 400, headers: corsHeaders });
    }
    if (meRow?.rol !== "administrador") {
      return new Response(JSON.stringify({ error: "Solo administrador" }), { status: 403, headers: corsHeaders });
    }

    // Body
    const body = await req.json();
    const {
      email,
      password,
      nombre,
      rol,
      estado = "Disponible",
      ...extra // estos NO se insertan en app_users; solo van al log
    } = body ?? {};

    if (!email || !password || !nombre || !rol) {
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios (email, password, nombre, rol)" }), {
        status: 400, headers: corsHeaders
      });
    }

    if (!ALLOWED_ROLES.has(String(rol))) {
      return new Response(JSON.stringify({ error: "Rol no válido" }), { status: 400, headers: corsHeaders });
    }

    // 1) Crear usuario en Auth
    const { data: created, error: eCreate } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (eCreate) {
      // Duplicado de email en Auth
      const code = String(eCreate.status ?? eCreate.code ?? "");
      const msg  = eCreate.message ?? String(eCreate);
      const status = code === "422" || /already/i.test(msg) ? 409 : 400;
      return new Response(JSON.stringify({ error: "No se pudo crear en Auth", detail: msg }), {
        status, headers: corsHeaders
      });
    }

    const authUser = created!.user;

    // 2) Insertar SOLO columnas existentes en app_users
    const insertPayload = {
      id: authUser.id,
      email,
      nombre,
      rol,
      estado,
    };
    const { error: eInsert } = await admin.from("app_users").insert(insertPayload);
    if (eInsert) {
      // Si falla la fila, borrar el usuario Auth para no dejar huérfanos
      await admin.auth.admin.deleteUser(authUser.id);
      return new Response(JSON.stringify({ error: "No se pudo insertar en app_users", detail: eInsert.message }), {
        status: 400, headers: corsHeaders
      });
    }

    // 3) Log (incluimos todos los extras para auditoría)
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ua = req.headers.get("user-agent") || "";
    await admin.from("logs").insert({
      usuario_id: meId,
      accion: "CREATE",
      entidad: "app_users",
      entidad_id: authUser.id,
      fecha: new Date().toISOString(),
      detalle: "Alta de usuario por administrador",
      data: { ...insertPayload, extra },
      ip,
      user_agent: ua,
    });

    return new Response(JSON.stringify({ ok: true, id: authUser.id }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Excepción no controlada", detail: String(err?.message ?? err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
