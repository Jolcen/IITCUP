// src/pages/Historial.jsx
import "../styles/Historial.css";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 10;
const IA_API = import.meta.env.VITE_IA_URL || "http://localhost:8001";



// Portadas (ajusta paths si usas otros)
const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  CUSTOM: "static/images/testP.jpg",
};



// Códigos requeridos para el procesamiento combinado
const REQUERIDAS = ["PAI", "MMPI-2", "MCMI-IV"];

export default function Historial() {
  useEffect(() => {
  console.log("IA_API =", IA_API);
  fetch(`${IA_API}/ping`)
    .then(r => r.json())
    .then(j => console.log("PING backend:", j))
    .catch(e => console.error("PING falló:", e));
}, []);

  // KPIs
  const [kpis, setKpis] = useState({ totalCasos: 0, totalPruebasCompletas: 0, loading: true });

  // tabla
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // mapas auxiliares
  const [opMap, setOpMap] = useState({});
  const [estadoMap, setEstadoMap] = useState({});

  // modal pruebas
  const [showModal, setShowModal] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [tests, setTests] = useState([]); // [{id,codigo,nombre,img,done}]
  const [loadingTests, setLoadingTests] = useState(false);

  // intentos por prueba (último COMPLETADO)
  // attemptsByCode: { "PAI": {pruebaId, intentoId}, ... }
  const [attemptsByCode, setAttemptsByCode] = useState({});

  // sub-modal resultados por prueba
  const [showReporte, setShowReporte] = useState(false);
  const [reportePrueba, setReportePrueba] = useState(null);
  const [reporteData, setReporteData] = useState([]);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [ultimoIntentoId, setUltimoIntentoId] = useState(null);

  // resultado combinado del modelo
  const [predicting, setPredicting] = useState(false);
  const [pred, setPred] = useState(null); // { label, probs }

  // ---------- KPIs ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r1 = await supabase.from("casos").select("id", { count: "exact", head: true });
        const r2 = await supabase
          .from("intentos_prueba")
          .select("id", { count: "exact", head: true })
          .not("terminado_en", "is", null);

        if (!alive) return;
        setKpis({
          totalCasos: r1.count || 0,
          totalPruebasCompletas: r2.count || 0,
          loading: false,
        });
      } catch {
        if (alive) setKpis((k) => ({ ...k, loading: false }));
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---------- Carga de tabla paginada ----------
  useEffect(() => {
    let alive = true;

    (async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("casos")
        .select("id, paciente_nombre, paciente_ci, motivacion, creado_en, asignado_a", { count: "exact" })
        .order("creado_en", { ascending: false })
        .range(from, to);

      if (error || !alive) return;

      setRows(data || []);
      setTotal(count || 0);

      const userIds = Array.from(new Set((data || []).map(r => r.asignado_a).filter(Boolean)));
      if (userIds.length) {
        const { data: users } = await supabase
          .from("app_users")
          .select("id, nombre, email")
          .in("id", userIds);
        if (alive && users) {
          const map = {};
          users.forEach(u => { map[u.id] = u.nombre || u.email; });
          setOpMap(map);
        }
      } else setOpMap({});

      if (data && data.length) {
        const casoIds = data.map(r => r.id);
        const { data: intents } = await supabase
          .from("intentos_prueba")
          .select("caso_id, terminado_en")
          .in("caso_id", casoIds);

        if (alive) {
          const byCaso = {};
          (intents || []).forEach(it => { (byCaso[it.caso_id] ||= []).push(it); });
          const emap = {};
          data.forEach(r => {
            const list = byCaso[r.id] || [];
            if (list.length === 0) emap[r.id] = "pendiente";
            else if (list.some(x => x.terminado_en == null)) emap[r.id] = "en_proceso";
            else emap[r.id] = "terminado";
          });
          setEstadoMap(emap);
        }
      } else setEstadoMap({});
    })();

    return () => { alive = false; };
  }, [page]);

  // ---------- Modal: abrir pruebas de un caso ----------
  async function abrirModalPruebas(row) {
    setSelectedCase(row);
    setShowModal(true);
    setPred(null); // limpia resultado combinado

    setLoadingTests(true);
    setTests([]);
    setAttemptsByCode({});

    try {
      // catálogo de pruebas
      const { data: pruebas } = await supabase
        .from("pruebas")
        .select("id, codigo, nombre")
        .order("nombre");

      // intentos del caso, con estado
      const { data: intents } = await supabase
        .from("intentos_prueba")
        .select("id, prueba_id, terminado_en")
        .eq("caso_id", row.id)
        .order("terminado_en", { ascending: false, nullsLast: true });

      // índice pruebas por id
      const byId = {};
      (pruebas || []).forEach(p => { byId[p.id] = p; });

      // último intento COMPLETADO por prueba
      const lastCompletedByPrueba = {};
      (intents || []).forEach(it => {
        if (it.terminado_en == null) return;
        if (!lastCompletedByPrueba[it.prueba_id]) lastCompletedByPrueba[it.prueba_id] = it;
      });

      // construir cards
      const list = (pruebas || []).map(p => {
        const intento = lastCompletedByPrueba[p.id];
        return {
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          img: PRUEBA_IMG[p.codigo] || PRUEBA_IMG.CUSTOM,
          done: !!intento,
          intentoId: intento?.id || null,
        };
      });

      // map por código requerido -> intentoId
      const attempts = {};
      list.forEach(t => {
        if (t.done) attempts[t.codigo] = { pruebaId: t.id, intentoId: t.intentoId };
      });

      setTests(list);
      setAttemptsByCode(attempts);
    } finally {
      setLoadingTests(false);
    }
  }

  function cerrarModal() {
    setShowModal(false);
    setSelectedCase(null);
    setTests([]);
    setAttemptsByCode({});
    setShowReporte(false);
    setReportePrueba(null);
    setReporteData([]);
    setUltimoIntentoId(null);
    setPred(null);
  }

  // ---------- Procesar las 3 pruebas (PAI + MMPI-2 + MCMI-IV) ----------
  const listoParaProcesar = REQUERIDAS.every(code => attemptsByCode[code]?.intentoId);

  async function procesarTresPruebas() {
    if (!selectedCase) return;
    if (!listoParaProcesar) return;

    setPredicting(true);
    setPred(null);

    try {
      // 1) Ejecutar scoring por cada intento (3 llamadas)
      for (const code of REQUERIDAS) {
        const intentoId = attemptsByCode[code].intentoId;
        await fetch(`${IA_API}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intento_id: intentoId }),
        });
      }

      // 2) Ejecutar predicción combinada por caso (el backend arma el vector desde 'puntajes')
      //    Si todavía no tienes este endpoint, puedes comentarlo; las escalas ya quedarán guardadas.
      const res = await fetch(`${IA_API}/predict-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caso_id: selectedCase.id }),
      });
      if (res.ok) {
        const json = await res.json();
        // Esperado: { label: "Bajo|Medio|Alto", probs: {Bajo:0.2,Medio:0.5,Alto:0.3} }
        setPred(json);
      } else {
        // Si el endpoint aún no existe, solo mostramos un aviso
        setPred({ label: "—", probs: null, note: "Escalas calculadas. Falta /predict-case en backend." });
      }
    } catch (e) {
      console.error(e);
      setPred({ label: "Error", probs: null });
    } finally {
      setPredicting(false);
    }
  }

  // ---------- Sub-modal: resultados por prueba (lee puntajes del intento) ----------
  async function abrirResultados(prueba) {
    if (!prueba?.done || !selectedCase) return;

    setReportePrueba(prueba);
    setShowReporte(true);
    setReporteData([]);
    setUltimoIntentoId(prueba.intentoId || null);

    if (!prueba.intentoId) return;

    // asegurar escalas actualizadas (no bloquea si el backend tarda)
    try {
      setScoreLoading(true);
      await fetch(`${IA_API}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intento_id: prueba.intentoId }),
      });
    } catch (e) {
      console.warn("score falló (se sigue con lectura de puntajes):", e);
    } finally {
      setScoreLoading(false);
    }

    // leer puntajes por intento
    const { data: pRows, error } = await supabase
      .from("puntajes")
      .select("escala, puntaje_conv")
      .eq("intento_id", prueba.intentoId)
      .order("escala");

    if (error) {
      console.error(error);
      setReporteData([{ clave: "Error", valor: "No se pudieron cargar puntajes" }]);
      return;
    }

    setReporteData((pRows || []).map(r => ({ clave: r.escala, valor: r.puntaje_conv })));
  }

  function cerrarResultados() {
    setShowReporte(false);
    setReportePrueba(null);
    setReporteData([]);
    setUltimoIntentoId(null);
  }

  // ---------- Render ----------
  const pages = useMemo(() => {
    const max = 5;
    const start = Math.max(1, page - Math.floor(max / 2));
    const end = Math.min(totalPages, start + max - 1);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  return (
    <div className="historial-page">
      <h2>Historial de Evaluados</h2>

      {/* KPIs */}
      <div className="stats-cards">
        <div className="card">
          <p>Evaluaciones totales</p>
          <h3>{kpis.loading ? "…" : kpis.totalCasos}</h3>
        </div>
        <div className="card">
          <p>Pruebas completadas</p>
          <h3>{kpis.loading ? "…" : kpis.totalPruebasCompletas}</h3>
        </div>
      </div>

      {/* Tabla */}
      <div className="historial-table-container">
        <div className="table-header">
          <h4>🧾 Historial de evaluados</h4>
        </div>

        <table>
          <thead>
            <tr>
              <th>Identificación</th>
              <th>Caso</th>
              <th>Fecha</th>
              <th>Responsable</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted">Sin registros</td></tr>
            )}

            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="identificacion">
                    <span className="icon">🧑‍⚖️</span>
                    <div>
                      {r.paciente_nombre}
                      <div className="id-text">CI: {r.paciente_ci || "—"}</div>
                    </div>
                  </div>
                </td>

                <td title={r.motivacion || ""}>{r.motivacion || "—"}</td>
                <td>{r.creado_en ? new Date(r.creado_en).toLocaleDateString() : "—"}</td>
                <td>{r.asignado_a ? (opMap[r.asignado_a] || r.asignado_a) : "—"}</td>

                <td>
                  <span className={`estado-tag ${(estadoMap[r.id] || "pendiente").replace("_", "-")}`}>
                    {estadoMap[r.id] === "en_proceso" && "En proceso"}
                    {estadoMap[r.id] === "terminado" && "Terminado"}
                    {(!estadoMap[r.id] || estadoMap[r.id] === "pendiente") && "Pendiente"}
                  </span>
                </td>

                <td>
                  <button className="btn-link" onClick={() => abrirModalPruebas(r)} title="Ver pruebas">📄</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginación */}
        <div className="pagination">
          <button className="pg" onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className="pg" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pages.map(n => (
            <button key={n} className={`pg ${n === page ? "active" : ""}`} onClick={() => setPage(n)}>{n}</button>
          ))}
          <button className="pg" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <button className="pg" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
        </div>
      </div>

      {/* MODAL: PRUEBAS DEL CASO */}
      {showModal && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) cerrarModal(); }}>
          <div className="modal pruebas-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Pruebas psicológicas</h3>
              <button className="close" onClick={cerrarModal}>✕</button>
            </div>

            {selectedCase && (
              <p className="muted">
                Paciente: <strong>{selectedCase.paciente_nombre}</strong> · CI <strong>{selectedCase.paciente_ci || "—"}</strong>
              </p>
            )}

            {loadingTests && <div className="muted" style={{padding:12}}>Cargando…</div>}

            <div className="tests-row">
              {tests.map(t => (
                <div
                  key={t.id}
                  className={`test-card ${t.done ? "done" : ""}`}
                  onClick={() => abrirResultados(t)}
                  title={t.done ? "Ver resultados" : "Aún no completada"}
                >
                  <img src={t.img} alt={t.codigo} />
                  <div className="test-title">{t.nombre}</div>
                  {t.done && <span className="badge-done">✓ Completada</span>}
                </div>
              ))}
              {!loadingTests && tests.length === 0 && (
                <div className="muted" style={{padding:12}}>No hay pruebas configuradas.</div>
              )}
            </div>

            {/* BOTÓN: PROCESAR 3 PRUEBAS */}
            <div className="process-actions">
              <button
                className="btn-primary"
                disabled={!listoParaProcesar || predicting}
                onClick={procesarTresPruebas}
                title={listoParaProcesar ? "Calcular escalas y ejecutar IA" : "Requiere PAI + MMPI-2 + MCMI-IV completadas"}
              >
                {predicting ? "Procesando…" : "Procesar (PAI + MMPI-2 + MCMI-IV)"}
              </button>
              {!listoParaProcesar && (
                <div className="muted tiny">Requiere tener las 3 pruebas completadas.</div>
              )}
              {pred && (
                <div className="pred-chip">
                  <strong>Resultado IA:</strong>{" "}
                  {pred.label || "—"}
                  {pred.probs && (
                    <span className="muted">
                      {"  "}· Prob.:{" "}
                      {Object.entries(pred.probs).map(([k,v]) => `${k}: ${Number(v).toFixed(2)}`).join("  ")}
                    </span>
                  )}
                  {pred.note && <div className="muted tiny">{pred.note}</div>}
                </div>
              )}
            </div>

            {/* SUB-MODAL: RESULTADOS POR PRUEBA */}
            {showReporte && (
              <div className="modal-overlay nested" onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) cerrarResultados(); }}>
                <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="modal-head">
                    <h3>Resultados · {reportePrueba?.codigo} {ultimoIntentoId ? `· intento ${ultimoIntentoId.slice(0,8)}…` : ""}</h3>
                    <button className="close" onClick={cerrarResultados}>✕</button>
                  </div>

                  <div className="result-body">
                    {scoreLoading && <div className="muted">Calculando…</div>}

                    {reporteData.length > 0 ? (
                      <table className="table-mini">
                        <thead><tr><th>Escala</th><th>Valor</th></tr></thead>
                        <tbody>
                          {reporteData.map((r, i) => (
                            <tr key={i}><td>{r.clave}</td><td>{String(r.valor)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    ) : !scoreLoading ? (
                      <div className="muted">Aún no hay resultados calculados para esta prueba.</div>
                    ) : null}
                  </div>

                  <div className="result-actions">
                    <button
                      className="btn-soft"
                      disabled={!ultimoIntentoId || scoreLoading}
                      onClick={async () => {
                        if (!ultimoIntentoId) return;
                        setScoreLoading(true);
                        try {
                          await fetch(`${IA_API}/score`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ intento_id: ultimoIntentoId }),
                          });
                          const { data: pRows } = await supabase
                            .from("puntajes")
                            .select("escala, puntaje_conv")
                            .eq("intento_id", ultimoIntentoId)
                            .order("escala");
                          setReporteData((pRows || []).map(r => ({ clave: r.escala, valor: r.puntaje_conv })));
                        } finally {
                          setScoreLoading(false);
                        }
                      }}
                    >
                      {scoreLoading ? "Calculando…" : "Recalcular puntajes"}
                    </button>

                    <button className="btn-soft" onClick={() => alert("Exportar Excel (pendiente)")}>📁 Exportar Excel</button>
                    <button className="btn-soft" onClick={() => alert("Exportar PDF (pendiente)")}>📄 Exportar PDF</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
