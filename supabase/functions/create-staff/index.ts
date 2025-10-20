// Deno Edge Function: crear/actualizar usuario + fila en app_users (idempotente) + enviar invitación
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// 👇 Siempre devolver JSON
const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const j = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

const ALLOWED_ROLES = new Set(["administrador", "encargado", "operador", "secretario"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1) validar JWT del llamante
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "")?.trim();
    if (!jwt) return j({ error: "Falta Authorization Bearer <token>" }, 401);

    const { data: authUserData, error: getUserErr } = await admin.auth.getUser(jwt);
    if (getUserErr || !authUserData?.user?.id) {
      return j({ error: "No session", detail: getUserErr?.message }, 401);
    }
    const meId = authUserData.user.id;

    // 2) verificar que sea administrador
    const { data: meRow, error: meErr } = await admin
      .from("app_users")
      .select("rol")
      .eq("id", meId)
      .single();
    if (meErr) return j({ error: "No se pudo verificar rol", detail: meErr.message }, 400);
    if (meRow?.rol !== "administrador") return j({ error: "Solo administrador" }, 403);

    // 3) body
    const body = await req.json();
    const { email, password, nombre, rol, perfil = {}, redirectTo } = body ?? {};
    if (!email || !password || !nombre || !rol) {
      return j({ error: "Faltan campos (email, password, nombre, rol)" }, 400);
    }
    if (!ALLOWED_ROLES.has(String(rol))) return j({ error: "Rol no válido" }, 400);

    // 4) invitar (email de verificación)
    const redir = redirectTo || Deno.env.get("SITE_URL") || "http://localhost:5173/login";
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: redir });
    if (invErr) return j({ error: "No se pudo invitar al usuario", detail: invErr.message }, 400);

    const authUser = invited.user;
    if (!authUser?.id) return j({ error: "Auth no devolvió id de usuario" }, 500);

    // 5) fijar/actualizar contraseña
    const { error: setPassErr } = await admin.auth.admin.updateUserById(authUser.id, { password });
    if (setPassErr) return j({ error: "No se pudo fijar la contraseña", detail: setPassErr.message }, 400);

    // 6) upsert en app_users (idempotente)
    //   - si existe con otro id el mismo email, devolvemos conflicto legible
    const { data: emailRow, error: emailQueryErr } = await admin
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (emailQueryErr) return j({ error: "No se pudo verificar email existente", detail: emailQueryErr.message }, 400);
    if (emailRow && emailRow.id !== authUser.id) {
      return j({ error: "El email ya está asignado a otro usuario en el sistema" }, 409);
    }

    const insertPayload = {
      id: authUser.id,
      email,
      nombre,
      rol,
      estado: "verificacion", // siempre forzamos verificación al crear/recuperar
      deleted_at: null,       // “des-eliminar” si estaba en soft-delete
    };

    const { error: upsertErr } = await admin
      .from("app_users")
      .upsert(insertPayload, { onConflict: "id" });
    if (upsertErr) return j({ error: "No se pudo crear/actualizar en app_users", detail: upsertErr.message }, 400);

    // 7) upsert perfil (si llega)
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
          avatar_url: perfil.avatar_url ?? null,
        }, { onConflict: "id" });
      if (eProf) {
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

    // 8) log
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ua = req.headers.get("user-agent") || "";
    await admin.from("logs").insert({
      usuario_id: meId,
      accion: "CREATE_OR_UPSERT",
      entidad: "app_users",
      entidad_id: authUser.id,
      fecha: new Date().toISOString(),
      detalle: "Alta/recuperación de usuario por administrador",
      data: { insertPayload, perfil },
      ip,
      user_agent: ua,
    });

    return j({ ok: true, id: authUser.id }, 200);
  } catch (err) {
    return j({ error: "Excepción no controlada", detail: String(err?.message ?? err) }, 500);
  }
});
