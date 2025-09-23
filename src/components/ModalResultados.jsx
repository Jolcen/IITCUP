// src/components/ModalResultados.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/ModalResultados.css";

// Imágenes para tarjetas de pruebas (opcional)
const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  DEFAULT: "static/images/testP.jpg",
};

// Clases EXACTAS que enviaste
const CLASES = [
  "No_clinico",
  "Ansiedad",
  "Depresivo",
  "Uso_Sustancias",
  "Antisocial",
  "Paranoide",
  "Psicótico/Esquizofrenia",
  "Bipolar",
  "Límite",
];

export default function ModalResultados({ open, onClose, caso }) {
  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState([]);

  // Perfil simple
  const [showPerfil, setShowPerfil] = useState(false);
  const [perfilSeleccionado, setPerfilSeleccionado] = useState(null);

  // Detalle de resultados por prueba
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleTest, setDetalleTest] = useState(null);
  const [puntajes, setPuntajes] = useState([]);
  const [puntajesLoading, setPuntajesLoading] = useState(false);

  useEffect(() => {
    if (!open || !caso?.id) return;

    (async () => {
      setLoading(true);
      setTests([]);
      try {
        // Solo PRUEBAS FINALIZADAS del caso (RPC existente)
        const { data: fin, error: eFin } = await supabase.rpc(
          "api_pruebas_finalizadas_por_caso",
          { p_caso: caso.id }
        );
        if (eFin) throw eFin;

        const list = (fin || []).map((p) => ({
          id: p?.codigo || p?.prueba_id,
          codigo: p?.codigo,
          nombre: p?.codigo,
          img: PRUEBA_IMG[p?.codigo] || PRUEBA_IMG.DEFAULT,
          done: true,
          intentoId: p?.intento_id || null,
          terminado_en: p?.terminado_en || null,
        }));

        setTests(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, caso?.id]);

  // Abrir detalle de una prueba finalizada y cargar sus puntajes
  async function abrirDetalle(t) {
    if (!t?.done || !t?.intentoId) return;
    setDetalleTest(t);
    setShowDetalle(true);
    setPuntajes([]);
    setPuntajesLoading(true);
    try {
      const { data, error } = await supabase.rpc("api_puntajes_por_intento", {
        p_intento: t.intentoId,
      });
      if (error) throw error;
      const norm = (data || []).map((r) => ({
        escala: r?.escala_codigo || r?.escala_id,
        puntaje: r?.puntaje_convertido ?? null,
      }));
      setPuntajes(norm);
    } catch (e) {
      console.error(e);
    } finally {
      setPuntajesLoading(false);
    }
  }
  function cerrarDetalle() {
    setShowDetalle(false);
    setDetalleTest(null);
    setPuntajes([]);
  }

  // Generar perfil simple (aleatorio entre las clases dadas)
  function generarPerfilSimple() {
    const idx = Math.floor(Math.random() * CLASES.length);
    setPerfilSeleccionado(CLASES[idx]);
    setShowPerfil(true);
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

        {loading && <div className="muted" style={{ padding: 12 }}>Cargando…</div>}

        {!loading && (
          <div className="mr-grid">
            {tests.map((t) => (
              <div
                key={t.id}
                className="mr-card done"
                onClick={() => abrirDetalle(t)}
                title="Ver resultados de esta prueba"
                role="button"
              >
                <span className="mr-badge mr-badge--done">✔ Completada</span>
                <div className="mr-card__imgwrap">
                  <img src={t.img} alt={t.codigo} className="mr-card__img" />
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

        {/* Solo 1 botón: Generar perfil (como pediste) */}
        <div className="mr-actions" style={{ gap: 8 }}>
          <button
            className="btn-primary mr-btn"
            onClick={generarPerfilSimple}
            title="Generar perfil (simulado)"
          >
            Generar perfil
          </button>
        </div>

        {/* Modal de detalle de resultados por prueba */}
        {showDetalle && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) cerrarDetalle();
            }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>
                  Resultado · {detalleTest?.codigo}
                  {detalleTest?.intentoId ? ` · intento ${String(detalleTest.intentoId).slice(0, 8)}…` : ""}
                </h3>
                <button className="close" onClick={cerrarDetalle}>✕</button>
              </div>

              <div className="result-body" style={{ display: "block" }}>
                {puntajesLoading && <div className="muted">Cargando puntajes…</div>}
                {!puntajesLoading && puntajes.length === 0 && (
                  <div className="muted">Aún no hay resultados calculados para esta prueba.</div>
                )}
                {!puntajesLoading && puntajes.length > 0 && (
                  <table className="table-mini" style={{ width: "100%" }}>
                    <thead>
                      <tr><th>Escala</th><th>Valor</th></tr>
                    </thead>
                    <tbody>
                      {puntajes.slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          <td>{r.escala}</td>
                          <td>{r.puntaje ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={cerrarDetalle}>Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de perfil simple (descarga deshabilitada) */}
        {showPerfil && (
          <PerfilSimpleModal
            caso={caso}
            perfil={perfilSeleccionado}
            onClose={() => setShowPerfil(false)}
          />
        )}
      </div>
    </div>
  );
}

function PerfilSimpleModal({ caso, perfil, onClose }) {
  return (
    <div
      className="modal-overlay nested"
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
    >
      <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Perfil simulado</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>

        <div className="result-body" style={{ display: "block" }}>
          <div className="card" style={{ marginTop: 6 }}>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
              Paciente: <strong>{caso?.paciente_nombre || "—"}</strong> · CI{" "}
              <strong>{caso?.paciente_ci || "—"}</strong>
            </p>
            <h4 style={{ margin: "10px 0 6px" }}>
              Clasificación seleccionada:&nbsp;
              <span style={{ color: "#0f766e" }}>{perfil || "—"}</span>
            </h4>
          </div>
        </div>

        <div className="result-actions">
          <button className="btn-soft" disabled title="Pronto">
            📄 Descargar perfil
          </button>
          <button className="btn-soft" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
