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
          .select("id, model_version, perfil_clinico, probabilidad, generated_at")
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

  // Armado de features del caso (con banderas)
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

      for (const r of data || []) {
        const code = r.escala_codigo;
        const val = r.puntaje_convertido ?? r.puntaje_t ?? r.puntaje_bruto ?? null;
        if (code && typeof val === "number" && Number.isFinite(val)) {
          features[code] = Number(val);
        }
      }
    }
    return features;
  }

  // Generar y guardar
  async function generarPerfilCasoIA() {
    try {
      setGenerando(true);
      const features = await recolectarFeaturesCaso();
      const resp = await inferirIA(features, { explain: true, topK: 5, debug: true, log: true });

      const { data: ins, error: eIns } = await supabase
        .from("perfiles_caso")
        .insert([{
          caso_id: caso.id,
          model_version: resp.model_version,
          perfil_clinico: resp.perfil_clinico,
          probabilidad: resp.probabilidad,
        }])
        .select()
        .single();

      if (!eIns) setPerfilGuardado(ins || null);
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
      const resp = await inferirIA(features, { explain: true, topK: 5, debug: true, log: true });
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
            >
              {generando ? "Generando…" : "Generar perfil IA del caso"}
            </button>
          ) : (
            <button
              className={`btn-primary mr-btn ${generando ? "mr-btn--disabled" : ""}`}
              onClick={visualizarPerfilGuardado}
              disabled={generando}
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

        {/* ===== Perfil IA (vertical: chip arriba, tabla debajo) ===== */}
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

                <h5 className="perfil-subtitle">Escalas que más aportaron</h5>

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
