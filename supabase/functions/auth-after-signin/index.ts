// auth-after-signin: si el email está verificado, pasa estado a 'disponible'
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
    // Cliente admin (service role) — ignoramos RLS pero validamos que el JWT sea del propio usuario
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // 1) Validar JWT entrante (debe venir de un usuario logueado)
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "")?.trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Falta Authorization Bearer <token>" }), { status: 401, headers: corsHeaders });
    }

    const { data: authUserData, error: getUserErr } = await admin.auth.getUser(jwt);
    if (getUserErr || !authUserData?.user?.id) {
      return new Response(JSON.stringify({ error: "No session", detail: getUserErr?.message }), { status: 401, headers: corsHeaders });
    }

    const uid = authUserData.user.id;
    const emailConfirmedAt = (authUserData.user as any).email_confirmed_at ?? null;

    // 2) Si AÚN no confirmó email, no cambiamos nada
    if (!emailConfirmedAt) {
      // devolvemos el estado actual para que el frontend sepa qué pasó
      const { data: row } = await admin.from("app_users").select("estado").eq("id", uid).maybeSingle();
      return new Response(JSON.stringify({
        ok: true,
        updated: false,
        reason: "email_not_confirmed",
        current_estado: row?.estado ?? null,
      }), { status: 200, headers: corsHeaders });
    }

    // 3) Leer estado actual
    const { data: app, error: readErr } = await admin
      .from("app_users")
      .select("estado")
      .eq("id", uid)
      .maybeSingle();

    if (readErr) {
      return new Response(JSON.stringify({ error: "No se pudo leer app_users", detail: readErr.message }), { status: 400, headers: corsHeaders });
    }

    const current = app?.estado ?? null;

    // 4) Solo pasamos a "disponible" si estaba en "verificacion"
    if (current === "verificacion") {
      const { error: updErr } = await admin
        .from("app_users")
        .update({ estado: "disponible" })
        .eq("id", uid);

      if (updErr) {
        return new Response(JSON.stringify({ error: "No se pudo actualizar estado", detail: updErr.message }), { status: 400, headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        ok: true,
        updated: true,
        from: "verificacion",
        to: "disponible",
      }), { status: 200, headers: corsHeaders });
    }

    // 5) Si ya estaba disponible/suspendido/etc., no tocamos nada
    return new Response(JSON.stringify({
      ok: true,
      updated: false,
      current_estado: current,
    }), { status: 200, headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Excepción", detail: String(e?.message ?? e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
