// Deno Edge Function: eliminar fila en app_users + eliminar usuario en Auth + log
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Cliente con el JWT del usuario que invoca (desde tu web)
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const authed = createClient(supabaseUrl, jwt);

    const me = await authed.auth.getUser();
    const meId = me.data.user?.id ?? null;
    if (!meId) {
      return new Response(JSON.stringify({ error: "No session" }), { status: 401, headers: corsHeaders });
    }

    // Verificación de rol administrador
    const { data: meRow } = await authed.from("app_users").select("rol").eq("id", meId).single();
    if (meRow?.rol !== "administrador") {
      return new Response(JSON.stringify({ error: "Solo administrador" }), { status: 403, headers: corsHeaders });
    }

    // Body
    const { targetId } = await req.json();
    if (!targetId) {
      return new Response(JSON.stringify({ error: "targetId requerido" }), { status: 400, headers: corsHeaders });
    }

    // No permitir borrar administradores
    const { data: target, error: eGet } = await admin.from("app_users").select("rol").eq("id", targetId).single();
    if (eGet) {
      return new Response(JSON.stringify({ error: "No se pudo obtener el usuario objetivo", detail: eGet.message }), { status: 400, headers: corsHeaders });
    }
    if (!target) {
      return new Response(JSON.stringify({ error: "Usuario no existe" }), { status: 404, headers: corsHeaders });
    }
    if (target.rol === "administrador") {
      return new Response(JSON.stringify({ error: "No se puede eliminar a un administrador" }), { status: 400, headers: corsHeaders });
    }

    // 1) Borrar fila app_users
    const { error: eDelRow } = await admin.from("app_users").delete().eq("id", targetId);
    if (eDelRow) {
      return new Response(JSON.stringify({ error: "No se pudo eliminar de app_users", detail: eDelRow.message }), { status: 400, headers: corsHeaders });
    }

    // 2) Borrar usuario en Auth
    const { error: eDelAuth } = await admin.auth.admin.deleteUser(targetId);
    if (eDelAuth) {
      // si por alguna razón falla Auth, deja constancia en log
      await admin.from("logs").insert({
        usuario_id: meId,
        accion: "DELETE",
        entidad: "app_users",
        entidad_id: targetId,
        fecha: new Date().toISOString(),
        detalle: "Fila eliminada, fallo al eliminar en Auth",
        data: { authError: eDelAuth.message },
      });
      return new Response(JSON.stringify({ error: "Se eliminó de app_users pero falló eliminar en Auth", detail: eDelAuth.message }), {
        status: 500, headers: corsHeaders
      });
    }

    // 3) Log
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ua = req.headers.get("user-agent") || "";
    await admin.from("logs").insert({
      usuario_id: meId,
      accion: "DELETE",
      entidad: "app_users",
      entidad_id: targetId,
      fecha: new Date().toISOString(),
      detalle: "Eliminación de usuario por administrador",
      data: {},
      ip,
      user_agent: ua,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Excepción no controlada", detail: String(err?.message ?? err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
