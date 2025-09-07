// Deno Edge Function: crear usuario (Auth Admin) + fila en app_users + log
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_ROLES = new Set(["administrador","encargado","operador","secretario"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente admin (service role) — ignora RLS
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1) Validar quién llama (leer JWT del header)
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "")?.trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Falta Authorization Bearer <token>" }), { status: 401, headers: corsHeaders });
    }

    // 2) Preguntar a Auth por el usuario del token
    const { data: authUserData, error: getUserErr } = await admin.auth.getUser(jwt);
    if (getUserErr || !authUserData?.user?.id) {
      return new Response(JSON.stringify({ error: "No session", detail: getUserErr?.message }), { status: 401, headers: corsHeaders });
    }
    const meId = authUserData.user.id;

    // 3) Verificar que sea administrador
    const { data: meRow, error: meErr } = await admin
      .from("app_users")
      .select("rol")
      .eq("id", meId)
      .single();

    if (meErr) {
      return new Response(JSON.stringify({ error: "No se pudo verificar rol", detail: meErr.message }), { status: 400, headers: corsHeaders });
    }
    if (meRow?.rol !== "administrador") {
      return new Response(JSON.stringify({ error: "Solo administrador" }), { status: 403, headers: corsHeaders });
    }

    // 4) Body
    const body = await req.json();
    const { email, password, nombre, rol, estado = "disponible", perfil = {} } = body ?? {};
    if (!email || !password || !nombre || !rol) {
      return new Response(JSON.stringify({ error: "Faltan campos (email, password, nombre, rol)" }), { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_ROLES.has(String(rol))) {
      return new Response(JSON.stringify({ error: "Rol no válido" }), { status: 400, headers: corsHeaders });
    }

    // 5) Crear en Auth
    const { data: created, error: eCreate } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (eCreate) {
      const msg = eCreate.message ?? String(eCreate);
      const status = /already/i.test(msg) ? 409 : 400;
      return new Response(JSON.stringify({ error: "No se pudo crear en Auth", detail: msg }), { status, headers: corsHeaders });
    }
    const authUser = created!.user;

    // 6) Insertar en app_users
    const insertPayload = { id: authUser.id, email, nombre, rol, estado };
    const { error: eInsert } = await admin.from("app_users").insert(insertPayload);
    if (eInsert) {
      await admin.auth.admin.deleteUser(authUser.id); // rollback
      return new Response(JSON.stringify({ error: "No se pudo insertar en app_users", detail: eInsert.message }), { status: 400, headers: corsHeaders });
    }

    // 7) Upsert perfil (si viene)
    if (perfil && typeof perfil === "object") {
      const { error: eProf } = await admin
        .from("staff_profiles")
        .upsert({
          id: authUser.id,
          ci: perfil.ci ?? null,
          telefono: perfil.telefono ?? null,
          direccion: perfil.direccion ?? null,
          fecha_nacimiento: perfil.fecha_nacimiento ?? null,
          especialidad: perfil.especialidad ?? null,
          matricula: perfil.matricula ?? null,
          institucion: perfil.institucion ?? null,
          fecha_graduacion: perfil.fecha_graduacion ?? null,
          nivel: perfil.nivel ?? null,
          turno: perfil.turno ?? null,
          disponibilidad: perfil.disponibilidad ?? null,
          avatar_url: perfil.avatar_url ?? null,
        }, { onConflict: "id" });
      if (eProf) {
        // No hacemos rollback de Auth/app_users; registramos en logs que el perfil falló
        await admin.from("logs").insert({
          usuario_id: meId,
          accion: "CREATE_PROFILE_FAILED",
          entidad: "staff_profiles",
          entidad_id: authUser.id,
          fecha: new Date().toISOString(),
          detalle: "Upsert de perfil falló",
          data: { error: eProf.message },
        });
      }
    }

    // 8) Log
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ua = req.headers.get("user-agent") || "";
    await admin.from("logs").insert({
      usuario_id: meId,
      accion: "CREATE",
      entidad: "app_users",
      entidad_id: authUser.id,
      fecha: new Date().toISOString(),
      detalle: "Alta de usuario por administrador",
      data: { insertPayload, perfil },
      ip,
      user_agent: ua,
    });

    return new Response(JSON.stringify({ ok: true, id: authUser.id }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Excepción no controlada", detail: String(err?.message ?? err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
