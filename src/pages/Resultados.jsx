import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Resultados.css";
import ModalResultados from "../components/ModalResultados";

const PAGE_SIZE = 10;

export default function Resultados() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // paginación + búsqueda
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const pages = useMemo(() => {
    const max = 5;
    const start = Math.max(1, page - Math.floor(max / 2));
    const end = Math.min(totalPages, start + max - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [page, totalPages]);

  // modal
  const [openPruebas, setOpenPruebas] = useState(false);
  const [caseForPruebas, setCaseForPruebas] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // lista
        const { data: list, error: e1 } = await supabase.rpc("api_resultados_listar", {
          p_term: q?.trim() ? q : null,
          p_page: page,
          p_page_size: PAGE_SIZE,
        });
        if (e1) throw e1;

        // total
        const { data: totalCount, error: e2 } = await supabase.rpc("api_resultados_total", {
          p_term: q?.trim() ? q : null,
        });
        if (e2) throw e2;

        if (!alive) return;
        setRows(list || []);
        setTotal(Number(totalCount || 0));
      } catch (err) {
        console.error(err);
        if (!alive) return;
        setRows([]);
        setTotal(0);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
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
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
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
              <tr>
                <td colSpan={5} className="muted">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Sin casos con pruebas finalizadas
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.paciente_nombre}</td>
                  <td>{r.paciente_ci || "—"}</td>
                  <td title={r.motivacion || ""}>{r.motivacion || "—"}</td>
                  <td>{r.creado_en ? new Date(r.creado_en).toLocaleDateString() : "—"}</td>
                  <td>
                    <button
                      className="btn-link"
                      title="Ver pruebas finalizadas"
                      onClick={() => openModalPruebas(r)}
                    >
                      📋 Ver pruebas
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {/* paginación */}
        <div className="pagination" style={{ marginTop: 10 }}>
          <button className="pg" onClick={() => setPage(1)} disabled={page === 1}>
            «
          </button>
          <button className="pg" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ‹
          </button>
          {pages.map((n) => (
            <button key={n} className={`pg ${n === page ? "active" : ""}`} onClick={() => setPage(n)}>
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
          <button className="pg" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            »
          </button>
        </div>
      </div>

      {/* Modal de pruebas */}
      {openPruebas && caseForPruebas && (
        <div className="exit-modal">
          <div className="modal-content" style={{ maxWidth: 860 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Pruebas finalizadas</h3>
              <div style={{ marginLeft: "auto" }}>
                <button
                  className="btn-cancel-exit"
                  onClick={() => {
                    setOpenPruebas(false);
                    setCaseForPruebas(null);
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
            <p style={{ marginTop: 0 }}>
              <strong>Paciente:</strong> {caseForPruebas.paciente_nombre}
              &nbsp; <small>CI: {caseForPruebas.paciente_ci || "—"}</small>
            </p>

            <ModalResultados
              open={true}
              onClose={() => {
                setOpenPruebas(false);
                setCaseForPruebas(null);
              }}
              caso={caseForPruebas}
            />
          </div>
        </div>
      )}
    </div>
  );
}
