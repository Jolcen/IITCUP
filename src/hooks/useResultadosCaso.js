// src/components/ModalResultados/hooks/useResultadosCaso.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useResultadosCaso(casoId, open) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [perfilGuardado, setPerfilGuardado] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !casoId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: fin, error: e1 } = await supabase.rpc(
          "api_pruebas_finalizadas_por_caso",
          { p_caso: casoId }
        );
        if (e1) throw e1;

        const list = (fin || []).map((p) => ({
          id: p?.prueba_id || p?.id,
          codigo: p?.codigo,
          nombre: p?.nombre || p?.codigo,
          img: null,
          intentoId: p?.intento_id || null,
          terminado_en: p?.terminado_en || null,
        }));
        if (alive) setTests(list);

        const { data: last, error: e2 } = await supabase
          .from("perfiles_caso")
          .select(
            "id, model_version, perfil_clinico, probabilidad, generated_at, generated_by, insights"
          )
          .eq("caso_id", casoId)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (e2) throw e2;
        if (alive) setPerfilGuardado(last || null);
      } catch (err) {
        if (alive) setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, casoId]);

  return { tests, loading, perfilGuardado, error };
}
