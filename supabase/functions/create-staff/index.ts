// supabase/functions/create-staff/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SB_URL")  ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY      = Deno.env.get("SB_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE  = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    }

    const input = await req.json();
    const { email, password, nombre, rol, ...extras } = input ?? {};

    // Cliente con el token del solicitante (para verificar ADMIN)
    const supa = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // Debe haber sesión
    const { data: me } = await supa.auth.getUser();
    const meId = me.user?.id;
    if (!meId) return json(401, { error: "No autenticado" });

    // Debe ser admin (policy self-select permite leer su propia fila)
    const { data: row, error: e0 } = await supa.from("app_users").select("rol").eq("id", meId).maybeSingle();
    if (e0) return json(400, { error: e0.message });
    if (row?.rol !== "administrador") return json(403, { error: "Solo admin" });

    // Validaciones básicas
    if (!email || !password || !nombre || !rol) return json(400, { error: "Faltan email, password, nombre o rol" });

    // Cliente admin para crear usuario y escribir sin RLS
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Crear en Auth (confirmado)
    const { data: created, error: e1 } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nombre }
    });
    if (e1) return json(400, { error: e1.message });
    const newId = created.user?.id;
    if (!newId) return json(500, { error: "No se obtuvo el id del usuario" });

    // 2) Insertar perfil en app_users
    const { error: e2 } = await admin.from("app_users").insert({ id: newId, nombre, email, rol });
    if (e2) return json(400, { error: e2.message });

    // 3) (Opcional) Guardar extras en staff_profile si la tienes
    // await admin.from("staff_profile").insert({ user_id: newId, ...extras });

    return json(200, { ok: true, user_id: newId });
  } catch (e) {
    return json(500, { error: e?.message ?? "Error inesperado" });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
