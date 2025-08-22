import { supabase } from '../lib/supabaseClient';

export async function registrarLog({ accion, entidad, entidad_id }) {
  // Llama a la función SQL: fn_log(p_accion, p_entidad, p_entidad_id)
  const { data, error } = await supabase.rpc('fn_log', {
    p_accion: accion,
    p_entidad: entidad,
    p_entidad_id: entidad_id ?? null
  });
  if (error) throw error;
  return data;
}
