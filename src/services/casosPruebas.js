// src/services/casosPruebas.js
import { supabase } from "../lib/supabaseClient";

/**
 * Marca la prueba del caso como "en_evaluacion" usando el RPC con SECURITY DEFINER.
 * Lanza error si el RPC falla.
 */
export async function marcarPruebaEnProgreso(casoId, pruebaId) {
  const { error } = await supabase.rpc("marcar_prueba_en_progreso", {
    p_caso_id: casoId,
    p_prueba_id: pruebaId,
  });
  if (error) throw error;
}
