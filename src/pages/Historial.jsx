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

  // tabla
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // filtros
  const [q, setQ] = useState("");                     // texto (paciente/CI/motivo/prueba)
  const [status, setStatus] = useState("todos");      // todos | pendiente | en_evaluacion | evaluado

  // fallback nombres (si RLS bloquea embeds)
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
      } catch {
        if (alive) setKpis((k) => ({ ...k, loading: false }));
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---------- Carga de tabla (bitácora de intentos) ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Traemos intentos + joins (si RLS lo permite)
      const sel = `
        id,
        caso_id,
        prueba_id,
        iniciado_en,
        terminado_en,
        duracion_segundos,
        firma_base64,
        casos:caso_id (
          paciente_nombre,
          paciente_ci,
          motivacion,
          creado_en,
          asignado_a,
          responsable:app_users!casos_asignado_a_fkey (id, nombre, email)
        ),
        pruebas:prueba_id (codigo)
      `;

      const { data, error, count } = await supabase
        .from("intentos_prueba")
        .select(sel, { count: "exact" })
        .order("iniciado_en", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("❌ Error cargando intentos:", error);
        setRows([]);
        setTotal(0);
        return;
      }

      let list = (data || []).map((r) => {
        const estado = r.terminado_en
          ? "evaluado"
          : r.iniciado_en
          ? "en_evaluacion"
          : "pendiente";

        const paciente_nombre =
          r.casos?.paciente_nombre ?? "—";
        const paciente_ci =
          r.casos?.paciente_ci ?? "—";
        const motivacion =
          r.casos?.motivacion ?? "—";
        const prueba_codigo =
          r.pruebas?.codigo ?? "—";

        // responsable (puede venir como array por el embed)
        let responsable = "—";
        const emb = r.casos?.responsable;
        if (Array.isArray(emb) && emb[0]) {
          responsable = emb[0].nombre || emb[0].email || "—";
        } else if (emb) {
          responsable = emb.nombre || emb.email || "—";
        }

        return {
          ...r,
          estado,
          paciente_nombre,
          paciente_ci,
          motivacion,
          prueba_codigo,
          responsable,
          creado_en: r.casos?.creado_en ?? r.iniciado_en ?? null,
        };
      });

      // Filtro búsqueda (cliente-side)
      if (q.trim()) {
        const term = q.toLowerCase();
        list = list.filter((r) =>
          (r.paciente_nombre || "").toLowerCase().includes(term) ||
          (r.paciente_ci || "").toLowerCase().includes(term) ||
          (r.motivacion || "").toLowerCase().includes(term) ||
          (r.prueba_codigo || "").toLowerCase().includes(term)
        );
      }

      // Filtro estado (cliente-side)
      if (status !== "todos") {
        list = list.filter((r) => (r.estado || "pendiente") === status);
      }

      // Fallback por RLS (responsable por asignado_a)
      const missingIds = Array.from(
        new Set(
          (list || [])
            .filter((r) => !r.responsable || r.responsable === "—")
            .map((r) => r.casos?.asignado_a)
            .filter(Boolean)
        )
      );
      if (missingIds.length > 0) {
        const { data: users, error: uerr } = await supabase
          .from("app_users")
          .select("id, nombre, email")
          .in("id", missingIds);

        if (!uerr && users) {
          const map = {};
          users.forEach((u) => (map[u.id] = u.nombre || u.email || u.id));
          if (alive) setUserMap((prev) => ({ ...prev, ...map }));
        }
      }

      // Aplicar fallback de nombres si procede
      list = list.map((r) => {
        if ((!r.responsable || r.responsable === "—") && r.casos?.asignado_a && userMap[r.casos.asignado_a]) {
          return { ...r, responsable: userMap[r.casos.asignado_a] };
        }
        return r;
      });

      if (!alive) return;
      setRows(list);
      setTotal(count ?? list.length); // si count está, úsalo
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

  function formatDur(sec) {
    if (!sec && sec !== 0) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

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
                placeholder="Buscar por paciente, CI, motivo o prueba…"
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
              <th>CI</th>
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
                <td>{r.paciente_ci}</td>
                <td title={r.motivacion || ""}>{r.motivacion || "—"}</td>
                <td>{r.prueba_codigo}</td>
                <td>{r.iniciado_en ? new Date(r.iniciado_en).toLocaleString() : (r.creado_en ? new Date(r.creado_en).toLocaleString() : "—")}</td>
                <td>{r.responsable || "—"}</td>
                <td>{renderEstado(r.estado)}</td>
                <td>{r.terminado_en ? formatDur(r.duracion_segundos) : "—"}</td>
                <td>{r.firma_base64 ? "✔" : "—"}</td>
                <td>
                  {r.terminado_en ? (
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
