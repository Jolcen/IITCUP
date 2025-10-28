import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { inferirIA } from "../services/ia";

/** Maneja carga/creación/uso del perfil IA sin crashear si no hay caso u open */
export function usePerfilIA(params) {
  const safe = params ?? {};
  const casoId = safe.casoId ?? null;
  const open   = Boolean(safe.open);

  const [perfilGuardado, setPerfilGuardado] = useState(null);
  const [perfilIA, setPerfilIA] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !casoId) return;
    let alive = true;
    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("perfiles_caso")
          .select("id, caso_id, model_version, perfil_clinico, probabilidad, insights, generated_at")
          .eq("caso_id", casoId)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (e) throw e;
        if (alive) setPerfilGuardado(data || null);
      } catch (err) {
        if (alive) setError(err);
      }
    })();
    return () => { alive = false; };
  }, [open, casoId]);

  async function generarPerfil(getFeaturesFn) {
    if (!casoId) throw new Error("Falta casoId.");
    setGenerando(true); setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error("Inicia sesión para generar el perfil IA.");

      const features = await getFeaturesFn();
      const resp = await inferirIA(features, { explain: true, topK: 5, debug: true, log: true });

      const insights = {
        metodo: resp.explicacion?.metodo ?? null,
        clase_objetivo: resp.explicacion?.clase_objetivo ?? resp.perfil_clinico,
        descripcion: resp.descripcion ?? null,
        guia_long: resp.guia?.long ?? null,
        top_features: resp.explicacion?.top_features ?? [],
        features_count: Object.keys(features).length,
        probabilidad: resp.probabilidad,
        version: resp.model_version,
      };

      const { data: ins, error: eIns } = await supabase
        .from("perfiles_caso")
        .insert([{
          caso_id: casoId,
          generated_by: u.user.id,
          model_version: resp.model_version,
          perfil_clinico: resp.perfil_clinico,
          probabilidad: resp.probabilidad,
          insights,
        }])
        .select()
        .single();
      if (eIns) throw eIns;

      setPerfilGuardado(ins);
      setPerfilIA(resp);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setGenerando(false);
    }
  }

  function usarPerfilGuardado() {
    if (!perfilGuardado) return;
    const ins = perfilGuardado.insights || {};
    setPerfilIA({
      perfil_clinico: perfilGuardado.perfil_clinico,
      probabilidad: Number(perfilGuardado.probabilidad ?? ins.probabilidad ?? 0),
      descripcion: ins.descripcion ?? null,
      guia: ins.guia_long ? { long: ins.guia_long } : null,
      model_version: perfilGuardado.model_version || ins.version || null,
      explicacion: {
        metodo: ins.metodo || null,
        clase_objetivo: ins.clase_objetivo || perfilGuardado.perfil_clinico,
        top_features: Array.isArray(ins.top_features) ? ins.top_features : [],
      },
    });
  }

  return { perfilGuardado, perfilIA, generando, error, generarPerfil, usarPerfilGuardado, setPerfilIA };
}
