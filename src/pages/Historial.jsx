// src/pages/Historial.jsx
import "../styles/Historial.css";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalResultados from "../components/ModalResultados";

const PAGE_SIZE = 10;

export default function Historial() {
  // KPIs
  const [kpis, setKpis] = useState({
    totalCasos: 0,
    totalPruebasCompletas: 0,
    loading: true,
  });

  // tabla
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  // filtros
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos"); // todos | pendiente | en_evaluacion | evaluado

  // fallback de nombres si RLS bloquea el embed
  const [userMap, setUserMap] = useState({});

  // Modal simple de resultados
  const [showResultados, setShowResultados] = useState(false);
  const [resultadoCase, setResultadoCase] = useState(null);
  const abrirModalResultados = (row) => {
    setResultadoCase(row);
    setShowResultados(true);
  };
  const cerrarModalResultados = () => {
    setShowResultados(false);
    setResultadoCase(null);
  };

  // ---------- KPIs ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r1 = await supabase.from("casos").select("id", {
          count: "exact",
          head: true,
        });
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
        if (alive)
          setKpis((k) => ({
            ...k,
            loading: false,
          }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---------- Carga de tabla ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("casos")
        .select(
          `
          id,
          paciente_nombre,
          paciente_ci,
          motivacion,
          creado_en,
          estado,
          asignado_a,
          responsable:app_users!casos_asignado_a_fkey (id, nombre, email)
        `,
          { count: "exact" }
        )
        .order("creado_en", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("❌ Error cargando casos:", error);
        setRows([]);
        setTotal(0);
        return;
      }

      let list = data || [];

      // Filtro búsqueda (cliente)
      if (q.trim()) {
        const term = q.toLowerCase();
        list = list.filter(
          (r) =>
            (r.paciente_nombre || "").toLowerCase().includes(term) ||
            (r.paciente_ci || "").toLowerCase().includes(term) ||
            (r.motivacion || "").toLowerCase().includes(term)
        );
      }

      // Filtro estado (cliente)
      if (status !== "todos") {
        list = list.filter((r) => (r.estado || "pendiente") === status);
      }

      // Fallback por RLS: obtener nombres faltantes por asignado_a
      const missingIds = Array.from(
        new Set(
          (list || [])
            .filter(
              (r) =>
                r.asignado_a &&
                (!r.responsable ||
                  (Array.isArray(r.responsable) && r.responsable.length === 0))
            )
            .map((r) => r.asignado_a)
        )
      );

      if (missingIds.length > 0) {
        const { data: users, error: uerr } = await supabase
          .from("app_users")
          .select("id, nombre, email")
          .in("id", missingIds);

        if (!uerr && users) {
          const map = {};
          users.forEach((u) => {
            map[u.id] = u.nombre || u.email || u.id;
          });
          if (alive) setUserMap((prev) => ({ ...prev, ...map }));
        } else if (uerr) {
          console.warn("⚠️ Fallback users fetch error:", uerr);
        }
      }

      if (!alive) return;
      setRows(list);
      setTotal(list.length);
    })();

    return () => {
      alive = false;
    };
  }, [page, q, status]);

  // ---------- Helpers ----------
  const pages = useMemo(() => {
    const max = 5;
    const start = Math.max(1, page - Math.floor(max / 2));
    const end = Math.min(totalPages, start + max - 1);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  const renderResponsable = (r) => {
    if (Array.isArray(r.responsable)) {
      const u = r.responsable[0];
      if (u) return u.nombre || u.email || "—";
    } else if (r.responsable) {
      return r.responsable.nombre || r.responsable.email || "—";
    }
    if (r.asignado_a && userMap[r.asignado_a]) return userMap[r.asignado_a];
    return "—";
  };

  const renderEstado = (estado) => {
    const s = estado || "pendiente"; // valores reales: pendiente | en_evaluacion | evaluado
    const cls = s.replace("_", "-"); // => en-evaluacion
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

          <div className="actions-right">
            <div className="searchbox">
              🔍
              <input
                placeholder="Buscar por nombre, CI o motivo…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
              />
            </div>

            <select
              className="filtro"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
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
              <tr>
                <td colSpan={6} className="muted">
                  Sin registros
                </td>
              </tr>
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
                <td>
                  {r.creado_en ? new Date(r.creado_en).toLocaleDateString() : "—"}
                </td>
                <td>{renderResponsable(r)}</td>
                <td>{renderEstado(r.estado)}</td>

                <td>
                  <button
                    className="btn-link"
                    onClick={() => abrirModalResultados(r)}
                    title="Ver resultados"
                  >
                    📄
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginación */}
        <div className="pagination">
          <button
            className="pg"
            onClick={() => setPage(1)}
            disabled={page === 1}
          >
            «
          </button>
          <button
            className="pg"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ‹
          </button>
          {pages.map((n) => (
            <button
              key={n}
              className={`pg ${n === page ? "active" : ""}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            className="pg"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            ›
          </button>
          <button
            className="pg"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
          >
            »
          </button>
        </div>
      </div>

      {/* MODAL RESULTADOS */}
      {showResultados && (
        <ModalResultados
          open={showResultados}
          onClose={cerrarModalResultados}
          caso={resultadoCase}
        />
      )}
    </div>
  );
}
