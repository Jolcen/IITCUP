import "../styles/Historial.css";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 10;

// iconos/portadas para las pruebas (ajusta paths si usas otros)
const PRUEBA_IMG = {
  "PAI": "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  "CUSTOM": "static/images/testP.jpg",
};

export default function Historial() {
  // KPIs
  const [kpis, setKpis] = useState({ totalCasos: 0, totalPruebasCompletas: 0, loading: true });

  // tabla
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // mapas auxiliares (operadores y estado por caso)
  const [opMap, setOpMap] = useState({});     // { userId -> nombre/email }
  const [estadoMap, setEstadoMap] = useState({}); // { casoId -> "pendiente"|"en_proceso"|"terminado" }

  // modal pruebas
  const [showModal, setShowModal] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null); // fila de casos
  const [tests, setTests] = useState([]); // [{id,codigo,nombre,img,done}]
  const [loadingTests, setLoadingTests] = useState(false);

  // sub-modal resultados
  const [showReporte, setShowReporte] = useState(false);
  const [reportePrueba, setReportePrueba] = useState(null); // {id, codigo, nombre}
  const [reporteData, setReporteData] = useState([]); // [{clave,valor}]

  // ---------- KPIs ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 1) total de evaluaciones (casos)
        const r1 = await supabase.from("casos").select("id", { count: "exact", head: true });

        // 2) total de pruebas completadas (intentos cerrados)
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

      // 1) casos de la página
      const q = supabase
        .from("casos")
        .select("id, paciente_nombre, paciente_ci, motivacion, creado_en, asignado_a", { count: "exact" })
        .order("creado_en", { ascending: false })
        .range(from, to);

      const { data, error, count } = await q;
      if (error || !alive) return;

      setRows(data || []);
      setTotal(count || 0);

      // 2) resolver nombres de responsables (app_users) para los asignado_a de la página
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
      } else {
        setOpMap({});
      }

      // 3) estado por caso (pendiente / en proceso / terminado) usando intentos en los casos visibles
      if (data && data.length) {
        const casoIds = data.map(r => r.id);
        const { data: intents } = await supabase
          .from("intentos_prueba")
          .select("caso_id, terminado_en")
          .in("caso_id", casoIds);

        if (alive) {
          const map = {};
          (intents || []).reduce((acc, it) => {
            const key = it.caso_id;
            const arr = acc[key] || (acc[key] = []);
            arr.push(it);
            return acc;
          }, map);

          const emap = {};
          data.forEach(r => {
            const list = map[r.id] || [];
            if (list.length === 0) emap[r.id] = "pendiente";
            else if (list.some(x => x.terminado_en == null)) emap[r.id] = "en_proceso";
            else emap[r.id] = "terminado";
          });
          setEstadoMap(emap);
        }
      } else {
        setEstadoMap({});
      }
    })();

    return () => { alive = false; };
  }, [page]);

  // ---------- Modal: abrir pruebas de un caso ----------
  async function abrirModalPruebas(row) {
    setSelectedCase(row);
    setShowModal(true);

    setLoadingTests(true);
    setTests([]);

    try {
      // todas las pruebas disponibles
      const { data: pruebas } = await supabase
        .from("pruebas")
        .select("id, codigo, nombre")
        .order("nombre");

      // intentos del caso (para marcar completadas)
      const { data: intents } = await supabase
        .from("intentos_prueba")
        .select("prueba_id, terminado_en")
        .eq("caso_id", row.id);

      const terminadas = new Set(
        (intents || []).filter(i => i.terminado_en != null).map(i => i.prueba_id)
      );

      const list = (pruebas || []).map(p => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        img: PRUEBA_IMG[p.codigo] || PRUEBA_IMG.CUSTOM,
        done: terminadas.has(p.id),
      }));

      setTests(list);
    } finally {
      setLoadingTests(false);
    }
  }

  function cerrarModal() {
    setShowModal(false);
    setSelectedCase(null);
    setTests([]);
    setShowReporte(false);
    setReportePrueba(null);
    setReporteData([]);
  }

  // ---------- Sub-modal: resultados de una prueba ----------
  async function abrirResultados(prueba) {
    if (!prueba?.done || !selectedCase) return;
    setReportePrueba(prueba);
    setShowReporte(true);

    // intenta traer puntajes si los tienes
    const { data } = await supabase
      .from("puntajes")
      .select("clave, valor")
      .eq("caso_id", selectedCase.id)
      .eq("prueba_id", prueba.id)
      .order("clave");

    setReporteData(data || []);
  }
  function cerrarResultados() {
    setShowReporte(false);
    setReportePrueba(null);
    setReporteData([]);
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
                  <span className={`estado-tag ${
                    (estadoMap[r.id] || "pendiente").replace("_", "-")
                  }`}>
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

        {/* Paginación sin excedentes */}
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
              {(!loadingTests && tests.length === 0) && <div className="muted" style={{padding:12}}>No hay pruebas configuradas.</div>}
            </div>

            {/* SUB-MODAL: RESULTADOS (placeholder) */}
            {showReporte && (
              <div className="modal-overlay nested" onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) cerrarResultados(); }}>
                <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="modal-head">
                    <h3>Resultados · {reportePrueba?.codigo}</h3>
                    <button className="close" onClick={cerrarResultados}>✕</button>
                  </div>

                  <div className="result-body">
                    {reporteData.length > 0 ? (
                      <table className="table-mini">
                        <thead><tr><th>Escala</th><th>Valor</th></tr></thead>
                        <tbody>
                          {reporteData.map((r, i) => (
                            <tr key={i}><td>{r.clave}</td><td>{String(r.valor)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="muted">
                        Aún no hay resultados calculados para esta prueba. (Aquí irá tu reporte con gráficos / PDF, según el Figma.)
                      </div>
                    )}
                  </div>

                  <div className="result-actions">
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
