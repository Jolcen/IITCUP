// src/components/ModalResultados.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { inferirIA } from "../services/ia";
import "../styles/ModalResultados.css";

const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  DEFAULT: "static/images/testP.jpg",
};

/** Normaliza aportes (magnitud) -> % */
function calcularPorcentajes(topFeatures = []) {
  const mags = topFeatures.map((t) => Math.abs(t.aporte));
  const total = mags.reduce((a, b) => a + b, 0) || 1;
  return topFeatures.map((t) => ({
    ...t,
    aporte_pct: (Math.abs(t.aporte) / total) * 100,
  }));
}

export default function ModalResultados({ open, onClose, caso }) {
  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState([]);

  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleTest, setDetalleTest] = useState(null);
  const [puntajes, setPuntajes] = useState([]);

  const [generando, setGenerando] = useState(false);
  const [perfilIA, setPerfilIA] = useState(null);
  const [perfilGuardado, setPerfilGuardado] = useState(null);

  // Carga tarjetas y último perfil
  useEffect(() => {
    if (!open || !caso?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: fin, error } = await supabase.rpc(
          "api_pruebas_finalizadas_por_caso",
          { p_caso: caso.id }
        );
        if (error) throw error;

        const list = (fin || []).map((p) => ({
          id: p?.prueba_id || p?.id,
          codigo: p?.codigo,
          nombre: p?.nombre || p?.codigo,
          img: PRUEBA_IMG[p?.codigo] || PRUEBA_IMG.DEFAULT,
          intentoId: p?.intento_id || null,
          terminado_en: p?.terminado_en || null,
        }));
        setTests(list);

        const { data: last, error: e2 } = await supabase
          .from("perfiles_caso")
          .select("id, model_version, perfil_clinico, probabilidad, generated_at, generated_by, insights")
          .eq("caso_id", caso.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!e2) setPerfilGuardado(last || null);
      } catch (e) {
        console.error("carga inicial", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, caso?.id]);

  // Detalle prueba
  async function abrirDetalle(t) {
    if (!t?.intentoId) return;
    setDetalleTest(t);
    setDetalleOpen(true);
    setPuntajes([]);
    try {
      const { data, error } = await supabase.rpc("api_puntajes_por_intento", {
        p_intento_id: t.intentoId,
        p_solo_validos: false,
      });
      if (error) throw error;

      const rows = (data || []).map((r) => ({
        escala: r.escala_codigo,
        nombre: r.escala_nombre ?? r.escala_codigo,
        bruto: r.puntaje_bruto ?? null,
        puntaje: r.puntaje_convertido ?? r.puntaje_t ?? r.puntaje_bruto ?? null,
      }));
      setPuntajes(rows);
    } catch (e) {
      console.error("api_puntajes_por_intento", e);
      setPuntajes([]);
    }
  }
  function cerrarDetalle() {
    setDetalleOpen(false);
    setDetalleTest(null);
    setPuntajes([]);
  }

  // === Aliases para cuadrar con features_orden.json del modelo ===
  const ALIAS = {
    "Fp-r": "Fpsi-r",
    "FBS-r": "FVS-r",
    RCd: "CRd",
    RC1: "CR1", RC2: "CR2", RC3: "CR3", RC4: "CR4",
    RC6: "CR6", RC7: "CR7", RC8: "CR8", RC9: "CR9",
    "AE-PI": "AE/PI",
    "AC-PE": "AC/PE",
  };

  // Construye features del caso con prefijos y alias
  async function recolectarFeaturesCaso() {
    const { data: fin, error } = await supabase.rpc(
      "api_pruebas_finalizadas_por_caso",
      { p_caso: caso.id }
    );
    if (error) throw error;

    const intentos = (fin || [])
      .map((p) => ({ codigo: p?.codigo, intentoId: p?.intento_id }))
      .filter((x) => x.intentoId);

    const presentes = new Set(intentos.map((i) => i.codigo));
    const features = {
      tiene_PAI: presentes.has("PAI") ? 1 : 0,
      tiene_MCMI: presentes.has("MCMI-IV") ? 1 : 0,
      tiene_MMPI: presentes.has("MMPI-2") ? 1 : 0,
    };

    for (const it of intentos) {
      const { data, error: e2 } = await supabase.rpc("api_puntajes_por_intento", {
        p_intento_id: it.intentoId,
        p_solo_validos: false,
      });
      if (e2) throw e2;

      const pref =
        it.codigo === "PAI" ? "PAI_" :
        it.codigo === "MCMI-IV" ? "MCMI_" :
        it.codigo === "MMPI-2" ? "MMPI_" : "";

      for (const r of data || []) {
        const rawCode = String(r.escala_codigo || "").trim();
        const fixed = ALIAS[rawCode] ?? rawCode;
        const finalKey = pref ? (pref + fixed) : fixed;

        const val =
          typeof r.puntaje_convertido === "number" ? r.puntaje_convertido :
          typeof r.puntaje_t === "number" ? r.puntaje_t :
          typeof r.puntaje_bruto === "number" ? r.puntaje_bruto : null;

        if (Number.isFinite(val)) {
          features[finalKey] = Number(val);
        }
      }
    }

    // ===== LOGS =====
    const keys = Object.keys(features);
    console.log("==== FEATURES ENVIADAS A IA ====");
    console.log("Total de features:", keys.length);
    console.log("Claves (orden alfabético):", [...keys].sort());
    const sample = {};
    for (const k of keys.slice(0, 10)) sample[k] = features[k];
    console.log("Ejemplo de pares clave→valor:", sample);
    console.log("JSON a enviar:", { explain: true, top_k: 5, debug: true, features });

    return features;
  }

  // Generar y guardar (agrega generated_by + insights con descripcion/guia_long)
  async function generarPerfilCasoIA() {
    try {
      setGenerando(true);
      const features = await recolectarFeaturesCaso();

      const resp = await inferirIA(features, {
        explain: true, topK: 5, debug: true, log: true,
      });

      // Logs de depuración del backend
      if (resp?.explicacion?.debug) {
        const dbg = resp.explicacion.debug;
        console.log("DEBUG.missing_numeric:", dbg.missing_numeric);
        console.log("DEBUG.unknown_inputs:", dbg.unknown_inputs);
        console.log("DEBUG.used_numeric:", dbg.used_numeric);
      }

      // Usuario actual para generated_by
      const { data: udata, error: eAuth } = await supabase.auth.getUser();
      if (eAuth) throw eAuth;
      const user = udata?.user;
      if (!user?.id) throw new Error("No hay sesión activa. Inicia sesión para generar el perfil IA.");

      // Armar insights (jsonb NOT NULL en tu tabla)
      const insights = {
        metodo: resp.explicacion?.metodo ?? null,
        clase_objetivo: resp.explicacion?.clase_objetivo ?? resp.perfil_clinico,
        descripcion: resp.descripcion ?? null,           // << nuevo
        guia_long: resp.guia?.long ?? null,              // << nuevo
        top_features: (resp.explicacion?.top_features ?? []).map(tf => ({
          feature: tf.feature, valor: tf.valor, aporte: tf.aporte, sentido: tf.sentido
        })),
        // Metadatos mínimos útiles:
        features_count: Object.keys(features).length,
        probabilidad: resp.probabilidad,
        version: resp.model_version,
      };

      const { data: ins, error: eIns } = await supabase
        .from("perfiles_caso")
        .insert([{
          caso_id: caso.id,
          generated_by: user.id,       // requerido por RLS/tabla
          model_version: resp.model_version,
          perfil_clinico: resp.perfil_clinico,
          probabilidad: resp.probabilidad,
          insights,                    // jsonb NOT NULL
          // generated_at: new Date().toISOString(), // si no tienes DEFAULT now()
        }])
        .select()
        .single();

      if (eIns) throw eIns;
      setPerfilGuardado(ins || null);
      setPerfilIA(resp);
    } catch (e) {
      console.error("generarPerfilCasoIA", e);
      alert(e.message ?? e);
    } finally {
      setGenerando(false);
    }
  }

  // Visualizar (no guarda)
  async function visualizarPerfilGuardado() {
    try {
      setGenerando(true);
      const features = await recolectarFeaturesCaso();
      const resp = await inferirIA(features, {
        explain: true, topK: 5, debug: true, log: true,
      });

      if (resp?.explicacion?.debug) {
        const dbg = resp.explicacion.debug;
        console.log("DEBUG.missing_numeric:", dbg.missing_numeric);
        console.log("DEBUG.unknown_inputs:", dbg.unknown_inputs);
        console.log("DEBUG.used_numeric:", dbg.used_numeric);
      }

      setPerfilIA(resp);
    } catch (e) {
      console.error("visualizarPerfilGuardado", e);
      alert(e.message ?? e);
    } finally {
      setGenerando(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
    >
      <div className="modal pruebas-modal mr-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head mr-header">
          <h3>Pruebas psicológicas</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>

        {caso && (
          <p className="muted mr-paciente">
            Paciente: <span className="mr-bold">{caso?.paciente_nombre}</span> · CI{" "}
            <span className="mr-bold">{caso?.paciente_ci || "—"}</span>
          </p>
        )}

        {loading ? (
          <div className="muted mr-pad-12">Cargando…</div>
        ) : tests.length === 0 ? (
          <div className="muted mr-pad-12">No hay pruebas finalizadas para este caso.</div>
        ) : (
          <div className="mr-grid">
            {tests.map((t) => (
              <div
                key={t.id}
                className="mr-card done"
                onClick={() => abrirDetalle(t)}
                role="button"
                title="Ver resultados de esta prueba"
              >
                <span className="mr-badge mr-badge--done">✔ Completada</span>
                <div className="mr-card__imgwrap">
                  <img className="mr-card__img" src={t.img} alt={t.codigo} />
                </div>
                <div className="mr-card__title">{t.nombre}</div>
                {t.terminado_en && (
                  <div className="mr-card__meta">
                    <small>{new Date(t.terminado_en).toLocaleString()}</small>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mr-actions">
          {!perfilGuardado ? (
            <button
              className={`btn-primary mr-btn ${generando ? "mr-btn--disabled" : ""}`}
              onClick={generarPerfilCasoIA}
              disabled={generando}
              title="Llama a la IA y guarda el resultado"
            >
              {generando ? "Generando…" : "Generar perfil IA del caso"}
            </button>
          ) : (
            <button
              className={`btn-primary mr-btn ${generando ? "mr-btn--disabled" : ""}`}
              onClick={visualizarPerfilGuardado}
              disabled={generando}
              title="Solo vuelve a inferir y mostrar (no inserta en BD)"
            >
              {generando ? "Abriendo…" : "Visualizar perfil IA"}
            </button>
          )}
        </div>

        {/* ===== Detalle de prueba ===== */}
        {detalleOpen && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) cerrarDetalle();
            }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head mr-detail-head">
                <button className="close mr-detail-close" onClick={cerrarDetalle}>✕</button>
                <h3 className="mr-detail-title">
                  {`Resultados de prueba - ${detalleTest?.codigo || ""}`}
                </h3>
              </div>

              <div className="result-body mr-detail-body">
                {puntajes.length === 0 ? (
                  <div className="muted">Cargando / sin resultados…</div>
                ) : (
                  <table className="table-mini mr-result-table">
                    <thead>
                      <tr>
                        <th>Escala</th>
                        <th>Nombre</th>
                        <th>Bruto</th>
                        <th>Puntaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {puntajes.slice(0, 400).map((r, i) => (
                        <tr key={i}>
                          <td>{r.escala}</td>
                          <td>{r.nombre || "—"}</td>
                          <td>{r.bruto ?? "—"}</td>
                          <td>{r.puntaje ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="result-actions mr-detail-actions">
                <button className="btn-soft">📄 Descargar Excel</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Perfil IA (vertical: chip arriba, descripción, tabla debajo) ===== */}
        {perfilIA && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) setPerfilIA(null);
            }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Perfil IA</h3>
                <button className="close" onClick={() => setPerfilIA(null)}>✕</button>
              </div>

              <div className="result-body perfil-wrap">
                <div className="perfil-hero">
                  <span className="perfil-chip">{perfilIA.perfil_clinico}</span>
                  <div className="conf-badge">
                    Confianza: {(perfilIA.probabilidad * 100).toFixed(1)}%
                  </div>
                </div>

                {/* Descripción corta + explicación larga */}
                {(perfilIA.descripcion || perfilIA.guia?.long) && (
                  <div style={{ marginTop: 8 }}>
                    {perfilIA.descripcion && (
                      <p className="perfil-desc" style={{ color: "#6b7280", marginBottom: 6 }}>
                        {perfilIA.descripcion}
                      </p>
                    )}
                    {perfilIA.guia?.long && (
                      <details className="perfil-long">
                        <summary style={{ cursor: "pointer", color: "#2563eb" }}>
                          Ver explicación
                        </summary>
                        <p style={{ marginTop: 6, color: "#374151" }}>
                          {perfilIA.guia.long}
                        </p>
                      </details>
                    )}
                  </div>
                )}

                <h5 className="perfil-subtitle" style={{ marginTop: 12 }}>Escalas que más aportaron</h5>

                {(() => {
                  const top = calcularPorcentajes(perfilIA.explicacion?.top_features || []);
                  return (
                    <table className="table-mini mr-result-table perfil-table">
                      <thead>
                        <tr>
                          <th>Escala</th>
                          <th>Valor</th>
                          <th>Aporte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((tf, i) => (
                          <tr key={i}>
                            <td>{tf.feature}</td>
                            <td>{tf.valor}</td>
                            <td>
                              <div className="aporte-row">
                                <div className="aporte-bar" aria-label="aporte relativo">
                                  <div
                                    className="aporte-fill"
                                    style={{ width: `${Math.max(2, Math.min(100, tf.aporte_pct))}%` }}
                                  />
                                </div>
                                <div className="aporte-pct">
                                  {tf.aporte_pct.toFixed(1)}%
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={() => setPerfilIA(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
