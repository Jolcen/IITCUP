import { supabase } from '../lib/supabaseClient';

// Lista casos (RLS hace que: admin ve todo, asistente ve todo, operador solo asignados)
export async function listCasos() {
  const { data, error } = await supabase
    .from('casos')
    .select('*')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data;
}

// Crear caso (solo admin mediante RLS/policies)
export async function createCaso(payload) {
  const { data, error } = await supabase
    .from('casos')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cambiar estado (operador solo en casos asignados; admin libre)
export async function updateCasoEstado(id, estado) {
  const { data, error } = await supabase
    .from('casos')
    .update({ estado })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
