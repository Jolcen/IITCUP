import { createClient } from "@supabase/supabase-js";
import featuresOrder from "../ia/features_order.json";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Lee el último perfil del caso para una versión de modelo.
 * @param {string} caso_id
 * @param {string} modelVersion
 */
export async function getPerfilCaso(caso_id, modelVersion = "nn_v1") {
  const { data, error } = await supabase
    .from("perfiles_caso")
    .select(
      "id, caso_id, intento_id, model_version, perfil_clinico, probabilidad, summary, insights, generated_at"
    )
    .eq("caso_id", caso_id)
    .eq("model_version", modelVersion)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Inserta el perfil IA del intento, si no existe ya para esa versión.
 * @param {{ intento_id: string, caso_id?: string|null, pred: Object, features: Object.<string, number> }} args
 */
export async function guardarPerfilCaso({ intento_id, caso_id = null, pred, features }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("No hay usuario autenticado.");
  const generated_by = auth.user.id;

  // ¿ya existe por intento + versión?
  const { data: existing, error: selErr } = await supabase
    .from("perfiles_caso")
    .select(
      "id, caso_id, intento_id, model_version, perfil_clinico, probabilidad, summary, insights, generated_at"
    )
    .eq("intento_id", intento_id)
    .eq("model_version", pred.model_version)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  const prob = typeof pred?.probabilidad === "number" ? pred.probabilidad : 0;
  const summary = `Perfil IA ${pred.model_version}: ${pred.perfil_clinico} (${prob.toFixed(2)})`;

  const insights = {
    input_signature: { model_version: pred.model_version, features_usadas: featuresOrder },
    tbr_snapshot: features,
    explicacion: pred.explicacion ?? null
  };

  const payload = {
    intento_id,
    caso_id,
    generated_by,
    model_version: pred.model_version,
    perfil_clinico: pred.perfil_clinico,
    probabilidad: prob,
    summary,
    insights
  };

  const { data, error } = await supabase
    .from("perfiles_caso")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}
