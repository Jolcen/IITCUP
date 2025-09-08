// src/pages/Resultados.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Resultados.css";
import ModalResultados from "../components/ModalResultados";

const PAGE_SIZE = 10;

export default function Resultados() {
  // lista de casos con pruebas finalizadas
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // paginación + búsqueda
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const pages = useMemo(() => {
    const max = 5, start = Math.max(1, page - Math.floor(max / 2));
    const end = Math.min(totalPages, start + max - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [page, totalPages]);

  // modal de pruebas por caso
  const [openPruebas, setOpenPruebas] = useState(false);
  const [caseForPruebas, setCaseForPruebas] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      // 1) obtener todos los intentos finalizados → caseIds
      const { data: fin, error: e1 } = await supabase
        .from("intentos_prueba")
        .select("caso_id, id")
        .not("terminado_en", "is", null);

      if (e1) {
        console.error(e1);
        if (alive) { setRows([]); setTotal(0); setLoading(false); }
        return;
      }

      const caseIds = Array.from(new Set((fin || []).map(r => r.caso_id))).filter(Boolean);

      // 2) filtrar por búsqueda con join a pacientes
      let filteredCaseIds = caseIds;
      if (q.trim()) {
        const { data: allCases } = await supabase
          .from("casos")
          .select(`
            id, paciente_id, motivacion,
            pacientes:paciente_id (nombres, apellidos, doc_numero)
          `)
          .in("id", caseIds);

        const term = q.toLowerCase();
        filteredCaseIds = (allCases || [])
          .filter(c => {
            const nombre = `${c?.pacientes?.nombres || ""} ${c?.pacientes?.apellidos || ""}`.trim();
            const ci = c?.pacientes?.doc_numero || "";
            return (
              nombre.toLowerCase().includes(term) ||
              ci.toLowerCase().includes(term) ||
              (c.motivacion || "").toLowerCase().includes(term)
            );
          })
          .map(c => c.id);
      }

      const totalCount = filteredCaseIds.length;

      // 3) traer página de casos con join a pacientes
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const pageIds = filteredCaseIds.slice(from, to + 1);

      let list = [];
      if (pageIds.length > 0) {
        const { data: casos, error: e2 } = await supabase
          .from("casos")
          .select(`
            id, paciente_id, motivacion, creado_en,
            pacientes:paciente_id (nombres, apellidos, doc_numero)
          `)
          .in("id", pageIds);

        if (e2) {
          console.error(e2);
        } else {
          const map = new Map(
            (casos || []).map(c => [
              c.id,
              {
                ...c,
                paciente_nombre: `${c?.pacientes?.nombres || ""} ${c?.pacientes?.apellidos || ""}`.trim(),
                paciente_ci: c?.pacientes?.doc_numero || null,
              },
            ])
          );
          list = pageIds.map(id => map.get(id)).filter(Boolean);
        }
      }

      if (!alive) return;
      setRows(list);
      setTotal(totalCount);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [page, q]);

  function openModalPruebas(casoRow) {
    setCaseForPruebas(casoRow);
    setOpenPruebas(true);
  }

  return (
    <div className="resultado-page" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Resultados</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "10px 0 16px" }}>
        <div className="searchbox" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          🔍
          <input
            placeholder="Buscar por paciente, CI o motivo…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
        </div>
      </div>

      <div className="historial-table-container">
        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>CI</th>
              <th>Motivo</th>
              <th>Fecha de creación</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="muted">Cargando…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="muted">Sin casos con pruebas finalizadas</td></tr>
            )}
            {!loading && rows.map(r => (
              <tr key={r.id}>
                <td>{r.paciente_nombre}</td>
                <td>{r.paciente_ci || "—"}</td>
                <td title={r.motivacion || ""}>{r.motivacion || "—"}</td>
                <td>{r.creado_en ? new Date(r.creado_en).toLocaleDateString() : "—"}</td>
                <td>
                  <button className="btn-link" title="Ver pruebas finalizadas" onClick={() => openModalPruebas(r)}>
                    📋 Ver pruebas
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* paginación */}
        <div className="pagination" style={{ marginTop: 10 }}>
          <button className="pg" onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className="pg" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pages.map(n => (
            <button key={n} className={`pg ${n === page ? "active" : ""}`} onClick={() => setPage(n)}>{n}</button>
          ))}
          <button className="pg" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <button className="pg" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
        </div>
      </div>

      {/* MODAL: Pruebas finalizadas del caso → dentro uso ModalResultados para ver/generar */}
      {openPruebas && caseForPruebas && (
        <div className="exit-modal">
          <div className="modal-content" style={{ maxWidth: 860 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Pruebas finalizadas</h3>
              <div style={{ marginLeft: "auto" }}>
                <button className="btn-cancel-exit" onClick={() => { setOpenPruebas(false); setCaseForPruebas(null); }}>
                  Cerrar
                </button>
              </div>
            </div>
            <p style={{ marginTop: 0 }}>
              <strong>Paciente:</strong> {caseForPruebas.paciente_nombre}
              &nbsp; <small>CI: {caseForPruebas.paciente_ci || "—"}</small>
            </p>

            {/* Reuso el modal de resultados para detalle + perfil */}
            <ModalResultados
              open={true}
              onClose={() => { setOpenPruebas(false); setCaseForPruebas(null); }}
              caso={caseForPruebas}
            />
          </div>
        </div>
      )}
    </div>
  );
}
