import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/ModalResultados.css"; // <-- estilos separados

// Requeridas para habilitar “Generar perfil”
const REQUERIDAS = ["PAI", "MMPI-2", "MCMI-IV"];

// Portadas
const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  DEFAULT: "static/images/testP.jpg",
};

export default function ModalResultados({ open, onClose, caso }) {
  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState([]);      // {id,codigo,nombre,img,done,intentoId}
  const [attemptsByCode, setAttemptsByCode] = useState({});
  const allReady = useMemo(
    () => REQUERIDAS.every((c) => attemptsByCode[c]?.intentoId),
    [attemptsByCode]
  );

  // Sub-modal: resultados por prueba
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleTest, setDetalleTest] = useState(null);
  const [puntajes, setPuntajes] = useState([]);
  const [puntajesLoading, setPuntajesLoading] = useState(false);

  // Sub-modal: informe final (placeholder)
  const [showPerfil, setShowPerfil] = useState(false);

  useEffect(() => {
    if (!open || !caso?.id) return;
    (async () => {
      setLoading(true);
      setTests([]);
      setAttemptsByCode({});
      try {
        // SOLO requeridas
        const { data: pruebas } = await supabase
          .from("pruebas")
          .select("id,codigo,nombre")
          .in("codigo", REQUERIDAS)
          .order("nombre");

        // Intentos del caso
        const { data: intents } = await supabase
          .from("intentos_prueba")
          .select("id,prueba_id,terminado_en")
          .eq("caso_id", caso.id)
          .order("terminado_en", { ascending: false, nullsLast: true });

        const lastDoneByPrueba = {};
        (intents || []).forEach((it) => {
          if (!it.terminado_en) return;
          if (!lastDoneByPrueba[it.prueba_id]) lastDoneByPrueba[it.prueba_id] = it;
        });

        const list = (pruebas || []).map((p) => {
          const intento = lastDoneByPrueba[p.id];
          return {
            id: p.id,
            codigo: p.codigo,
            nombre: p.nombre,
            img: PRUEBA_IMG[p.codigo] || PRUEBA_IMG.DEFAULT,
            done: !!intento,
            intentoId: intento?.id || null,
          };
        });

        const attempts = {};
        list.forEach((t) => {
          if (t.done) attempts[t.codigo] = { intentoId: t.intentoId };
        });

        setTests(list);
        setAttemptsByCode(attempts);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, caso?.id]);

  // Abrir detalle de una prueba (solo si está completa)
  const abrirDetalle = async (t) => {
    if (!t?.done || !t?.intentoId) return; // inhabilitada si no está completa
    setDetalleTest(t);
    setShowDetalle(true);
    setPuntajes([]);
    setPuntajesLoading(true);
    try {
      const { data } = await supabase
        .from("puntajes")
        .select("escala, puntaje_conv")
        .eq("intento_id", t.intentoId)
        .order("escala");
      setPuntajes(data || []);
    } finally {
      setPuntajesLoading(false);
    }
  };

  const cerrarDetalle = () => {
    setShowDetalle(false);
    setDetalleTest(null);
    setPuntajes([]);
  };

  return open ? (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
    >
      <div
        className="modal pruebas-modal mr-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head mr-header">
          <h3>Pruebas psicológicas</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>

        {/* Info del paciente */}
        {caso && (
          <p className="muted mr-paciente">
            Paciente: <span className="mr-bold">{caso.paciente_nombre}</span> · CI{" "}
            <span className="mr-bold">{caso.paciente_ci || "—"}</span>
          </p>
        )}

        {/* Grid de pruebas */}
        {loading && <div className="muted" style={{ padding: 12 }}>Cargando…</div>}

        {!loading && (
          <div className="mr-grid">
            {tests.map((t) => (
              <div
                key={t.id}
                className={`mr-card ${t.done ? "done" : "pending"}`}
                onClick={() => abrirDetalle(t)}
                title={t.done ? "Ver resultados" : "Aún no completada"}
              >
                {/* Etiqueta arriba izquierda */}
                {t.done ? (
                  <span className="mr-badge mr-badge--done">✔ Completada</span>
                ) : (
                  <span className="mr-badge mr-badge--pending">Pendiente</span>
                )}

                {/* Imagen */}
                <div className="mr-card__imgwrap">
                  <img src={t.img} alt={t.codigo} className="mr-card__img" />
                </div>

                {/* Título */}
                <div className="mr-card__title">{t.nombre}</div>
              </div>
            ))}
          </div>
        )}

        {/* Acciones */}
        <div className="mr-actions">
          <button
            className={allReady ? "btn-primary mr-btn" : "btn-soft mr-btn mr-btn--disabled"}
            disabled={!allReady}
            onClick={() => setShowPerfil(true)}
            title={allReady ? "Generar perfil" : "Completa PAI + MMPI-2 + MCMI-IV para habilitar"}
          >
            Generar perfil
          </button>
        </div>

        {/* SUB-MODAL: Detalle de prueba */}
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
                  {detalleTest?.intentoId ? ` · intento ${detalleTest.intentoId.slice(0, 8)}…` : ""}
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
                      <tr>
                        <th>Escala</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {puntajes.slice(0, 12).map((r, i) => (
                        <tr key={i}>
                          <td>{r.escala}</td>
                          <td>{String(r.puntaje_conv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={() => alert("Exportar a Excel (pendiente)")}>
                  📁 Exportar Excel
                </button>
                <button className="btn-soft" onClick={() => alert("Exportar a PDF (pendiente)")}>
                  📄 Exportar PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL: Informe final (placeholder) */}
        {showPerfil && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) setShowPerfil(false);
            }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Informe final (borrador)</h3>
                <button className="close" onClick={() => setShowPerfil(false)}>✕</button>
              </div>

              <div className="result-body" style={{ display: "block" }}>
                <p className="muted" style={{ marginBottom: 8 }}>
                  Paciente: <strong>{caso?.paciente_nombre}</strong> · CI{" "}
                  <strong>{caso?.paciente_ci || "—"}</strong>
                </p>

                <div className="card" style={{ marginTop: 6 }}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Resumen</p>
                  <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                    <li>PAI: completado ✅</li>
                    <li>MMPI-2: completado ✅</li>
                    <li>MCMI-IV: completado ✅</li>
                  </ul>
                  <p className="muted" style={{ marginTop: 8 }}>
                    (Aquí irá el perfil generado por IA con formatos y gráficos — pendiente.)
                  </p>
                </div>
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={() => alert("Exportar PDF del informe (pendiente)")}>
                  📄 Exportar informe PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;
}
