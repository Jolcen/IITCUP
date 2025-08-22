import { supabase } from '../lib/supabaseClient';

export async function listPruebas() {
  const { data, error } = await supabase.from('pruebas').select('*').order('nombre');
  if (error) throw error;
  return data;
}

export async function listItems(prueba_id) {
  const { data, error } = await supabase
    .from('items_prueba')
    .select('*')
    .eq('prueba_id', prueba_id)
    .order('codigo', { ascending: true });
  if (error) throw error;
  return data;
}

// Guarda/actualiza respuesta por ítem (unique: caso_id, prueba_id, item_id)
export async function upsertRespuesta({ caso_id, prueba_id, item_id, valor }) {
  const { data, error } = await supabase
    .from('respuestas')
    .upsert({ caso_id, prueba_id, item_id, valor }, { onConflict: 'caso_id,prueba_id,item_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
