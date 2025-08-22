import { supabase } from '../lib/supabaseClient';

// Calcula y guarda puntaje convertido consultando la tabla 'normativas'
export async function calcularGuardarPuntaje({ caso_id, prueba_id, escala, grupo, puntaje_bruto, normativa_version = 'v1' }) {
  // Busca conversión en normativas
  const { data: norm, error: eNorm } = await supabase
    .from('normativas')
    .select('puntaje_convertido')
    .match({ prueba_id, escala, grupo, puntaje_bruto })
    .maybeSingle();
  if (eNorm) throw eNorm;

  const puntaje_convertido = norm?.puntaje_convertido ?? null;

  const { data, error } = await supabase
    .from('puntajes')
    .upsert(
      { caso_id, prueba_id, escala, puntaje_bruto, puntaje_convertido, normativa_version },
      { onConflict: 'caso_id,prueba_id,escala' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
