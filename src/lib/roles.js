// src/lib/roles.js
import { supabase } from "./supabaseClient";

/** Obtiene el rol del usuario autenticado desde app_users. */
export async function getCurrentUserRole() {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user || null;
  if (!user) return null;

  const { data } = await supabase
    .from("app_users")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  return data?.rol || null; // 'administrador' | 'encargado' | 'secretario' | 'operador' | null
}

/** Secretario solo ve/exporta. Pueden generar: admin, encargado, operador. */
export function canGenerateProfile(rol) {
  return rol === "administrador" || rol === "encargado" || rol === "operador";
}
