import { createClient } from "@supabase/supabase-js";
import type { InferResponse } from "./ia";
import featuresOrder from "../ia/features_order.json";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

// LEE el perfil existente por caso y versión (último generado)
export async function getPerfilCaso(caso_id: string, modelVersion = "nn_v1") {
  const { data, error } = await supabase
    .from("perfiles_caso")
    .select("id, caso_id, intento_id, model_version, perfil_clinico, probabilidad, summary, insights, generated_at")
    .eq("caso_id", caso_id)
    .eq("model_version", modelVersion)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data; // puede ser null
}

type GuardarArgs = {
  intento_id: string;
  caso_id?: string | null;
  pred: InferResponse;
  features: Record<string, number>;
};

// INSERT-ONLY (no upsert). Si ya existe, devuelve el existente.
export async function guardarPerfilCaso({ intento_id, caso_id = null, pred, features }: GuardarArgs) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("No hay usuario autenticado.");
  const generated_by = auth.user.id;

  // ¿ya existe por intento + versión? -> devuelve y no intenta UPDATE
  const { data: existing, error: selErr } = await supabase
    .from("perfiles_caso")
    .select("id, caso_id, intento_id, model_version, perfil_clinico, probabilidad, summary, insights, generated_at")
    .eq("intento_id", intento_id)
    .eq("model_version", pred.model_version)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  const summary = `Perfil IA ${pred.model_version}: ${pred.perfil_clinico} (${pred.probabilidad.toFixed(2)})`;
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
    probabilidad: pred.probabilidad,
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
