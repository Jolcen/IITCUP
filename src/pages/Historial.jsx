// src/pages/Historial.jsx
import "../styles/Historial.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 10;

export default function Historial() {
  const navigate = useNavigate();

  // KPIs
  const [kpis, setKpis] = useState({ totalIntentos: 0, totalCompletas: 0, loading: true });

  // Tabla
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // Filtros
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos"); // todos | pendiente | en_evaluacion | evaluado

  // Cache responsables
  const [userMap, setUserMap] = useState({});

  // ---------- KPIs ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r1 = await supabase
          .from("intentos_prueba")
          .select("id", { count: "exact", head: true });

        const r2 = await supabase
          .from("intentos_prueba")
          .select("id", { count: "exact", head: true })
          .not("terminado_en", "is", null);

        if (!alive) return;
        setKpis({
          totalIntentos: r1.count || 0,
          totalCompletas: r2.count || 0,
          loading: false,
        });
      } catch (err) {
        console.error("KPIs error:", err?.message || err);
        if (alive) setKpis((k) => ({ ...k, loading: false }));
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---------- Tabla ----------
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // 1) Intentos (sin joins)
        const { data: intentos, error: errI, count } = await supabase
          .from("intentos_prueba")
          .select(
            `
            id,
            caso_id,
            prueba_id,
            estado,
            iniciado_en,
            empezado_en,
            terminado_en,
            finalizado_en,
            duracion_segundos
          `,
            { count: "exact" }
          )
          .order("iniciado_en", { ascending: false })
          .range(from, to);

        if (errI) throw errI;

        const casoIds = Array.from(new Set((intentos || []).map((x) => x.caso_id).filter(Boolean)));
        const pruebaIds = Array.from(new Set((intentos || []).map((x) => x.prueba_id).filter(Boolean)));

        // 2) Casos
        let casosById = {};
        if (casoIds.length) {
          const { data: casos, error: errC } = await supabase
            .from("casos")
            .select("id, paciente_id, motivacion, creado_en, asignado_a")
            .in("id", casoIds);
          if (errC) throw errC;
          casosById = Object.fromEntries((casos || []).map((c) => [c.id, c]));
        }

        // 3) Pacientes (campos reales)
        const pacienteIds = Array.from(
          new Set(Object.values(casosById).map((c) => c.paciente_id).filter(Boolean))
        );
        let pacientesById = {};
        if (pacienteIds.length) {
          const { data: pacientes, error: errP } = await supabase
            .from("pacientes")
            .select(
              `
              id,
              nombres,
              apellidos,
              doc_tipo,
              doc_numero,
              doc_expedido,
              foto_carnet_path,
              foto_carnet_bucket
            `
            )
            .in("id", pacienteIds);
          if (errP) throw errP;
          pacientesById = Object.fromEntries((pacientes || []).map((p) => [p.id, p]));
        }

        // 4) Pruebas
        let pruebasById = {};
        if (pruebaIds.length) {
          const { data: pruebas, error: errPr } = await supabase
            .from("pruebas")
            .select("id, codigo")
            .in("id", pruebaIds);
          if (errPr) throw errPr;
          pruebasById = Object.fromEntries((pruebas || []).map((p) => [p.id, p]));
        }

        // 5) Armar lista final
        let list = (intentos || []).map((r) => {
          const c = casosById[r.caso_id] || {};
          const p = c.paciente_id ? pacientesById[c.paciente_id] || {} : {};
          const pr = pruebasById[r.prueba_id] || {};

          // Nombre y documento del paciente
          const paciente_nombre = [p.nombres, p.apellidos].filter(Boolean).join(" ") || "—";
          const documento = [p.doc_tipo, p.doc_numero, p.doc_expedido].filter(Boolean).join(" ") || "—";

          // Estado
          const estado =
            r.terminado_en || r.finalizado_en
              ? "evaluado"
              : r.iniciado_en || r.empezado_en
              ? "en_evaluacion"
              : "pendiente";

          // Fecha base
          const creado_en = c.creado_en ?? r.iniciado_en ?? null;

          // Duración (minutos)
          let durSeg =
            typeof r.duracion_segundos === "number" ? r.duracion_segundos : null;

          if ((durSeg === null || isNaN(durSeg)) && (r.terminado_en || r.finalizado_en)) {
            const end = new Date(r.terminado_en || r.finalizado_en).getTime();
            const startRaw = r.iniciado_en || r.empezado_en || creado_en;
            const start = startRaw ? new Date(startRaw).getTime() : null;
            if (start && end && end > start) {
              durSeg = Math.floor((end - start) / 1000);
            }
          }
          let durMin = null;
          if (typeof durSeg === "number") {
            const m = Math.round(durSeg / 60);
            durMin = m < 1 ? "<1" : m;
          }

          return {
            ...r,
            estado,
            paciente_nombre,
            paciente_doc: documento,
            motivacion: c.motivacion ?? "—",
            prueba_codigo: pr.codigo ?? "—",
            creado_en,
            asignado_a: c.asignado_a ?? null,
            responsable: null,        // se completa abajo con userMap
            duracion_minutos: durMin, // para UI
            // Datos del paciente por si luego quieres usarlos:
            foto_carnet_path: p.foto_carnet_path || null,
            foto_carnet_bucket: p.foto_carnet_bucket || null,
          };
        });

        // Filtros cliente-side
        if (q.trim()) {
          const term = q.toLowerCase();
          list = list.filter((r) =>
            (r.paciente_nombre || "").toLowerCase().includes(term) ||
            (r.paciente_doc || "").toLowerCase().includes(term) ||
            (r.motivacion || "").toLowerCase().includes(term) ||
            (r.prueba_codigo || "").toLowerCase().includes(term)
          );
        }
        if (status !== "todos") {
          list = list.filter((r) => (r.estado || "pendiente") === status);
        }

        // Responsables (app_users)
        const missingIds = Array.from(
          new Set(
            (list || [])
              .map((r) => r.asignado_a)
              .filter(Boolean)
              .filter((id) => !userMap[id])
          )
        );
        if (missingIds.length) {
          const { data: users, error: errU } = await supabase
            .from("app_users")
            .select("id, nombre, email")
            .in("id", missingIds);
          if (errU) throw errU;
          const map = {};
          (users || []).forEach((u) => (map[u.id] = u.nombre || u.email || u.id));
          if (alive) setUserMap((prev) => ({ ...prev, ...map }));
        }

        list = list.map((r) => ({
          ...r,
          responsable: r.asignado_a ? (userMap[r.asignado_a] ?? "—") : "—",
        }));

        if (!alive) return;
        setRows(list);
        setTotal(count ?? list.length);
      } catch (err) {
        console.error("❌ Error cargando intentos:", err?.message || err);
        if (alive) {
          setRows([]);
          setTotal(0);
        }
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, status, userMap]);

  // ---------- Helpers ----------
  const pages = useMemo(() => {
    const max = 5;
    const start = Math.max(1, page - Math.floor(max / 2));
    const end = Math.min(totalPages, start + max - 1);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  const renderEstado = (estado) => {
    const s = estado || "pendiente";
    const cls = s.replace("_", "-");
    return (
      <span className={`estado-tag ${cls}`}>
        {s === "en_evaluacion" && "En evaluación"}
        {s === "evaluado" && "Evaluado"}
        {(s === "pendiente" || !s) && "Pendiente"}
      </span>
    );
  };

  // ---------- Render ----------
  return (
    <div className="historial-page">
      <h2>Historial de Evaluaciones</h2>

      {/* KPIs */}
      <div className="stats-cards">
        <div className="card">
          <p>Intentos totales</p>
          <h3>{kpis.loading ? "…" : kpis.totalIntentos}</h3>
        </div>
        <div className="card">
          <p>Pruebas completadas</p>
          <h3>{kpis.loading ? "…" : kpis.totalCompletas}</h3>
        </div>
      </div>

      {/* Tabla */}
      <div className="historial-table-container">
        <div className="table-header">
          <h4>🧾 Bitácora de intentos</h4>

          <div className="actions-right">
            <div className="searchbox">
              🔍
              <input
                placeholder="Buscar por paciente, documento, motivo o prueba…"
                value={q}
                onChange={(e) => { setPage(1); setQ(e.target.value); }}
              />
            </div>

            <select
              className="filtro"
              value={status}
              onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_evaluacion">En evaluación</option>
              <option value="evaluado">Evaluado</option>
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Documento</th>
              <th>Motivo</th>
              <th>Prueba</th>
              <th>Fecha</th>
              <th>Resp.</th>
              <th>Estado</th>
              <th>Duración</th>
              <th>Firma</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="muted">Sin registros</td>
              </tr>
            )}

            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.paciente_nombre}</td>
                <td>{r.paciente_doc}</td>
                <td title={r.motivacion || ""}>{r.motivacion || "—"}</td>
                <td>{r.prueba_codigo}</td>
                <td>
                  {r.iniciado_en
                    ? new Date(r.iniciado_en).toLocaleString()
                    : r.creado_en
                    ? new Date(r.creado_en).toLocaleString()
                    : "—"}
                </td>
                <td>{r.responsable || "—"}</td>
                <td>{renderEstado(r.estado)}</td>
                <td>
                  {r.terminado_en || r.finalizado_en
                    ? (r.duracion_minutos === "<1" ? "<1 min" : `${r.duracion_minutos} min`)
                    : "—"}
                </td>
                <td>—{/* si luego quieres mostrar firma, se reemplaza */}</td>
                <td>
                  {r.terminado_en || r.finalizado_en ? (
                    <button
                      className="btn-link"
                      onClick={() => navigate(`/resultados/${r.id}?caso=${r.caso_id}`)}
                      title="Ver resultado"
                    >
                      📄
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginación */}
        <div className="pagination">
          <button className="pg" onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className="pg" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pages.map((n) => (
            <button key={n} className={`pg ${n === page ? "active" : ""}`} onClick={() => setPage(n)}>{n}</button>
          ))}
          <button className="pg" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <button className="pg" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
        </div>
      </div>
    </div>
  );
}
