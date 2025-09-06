// src/pages/Resultados.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Resultados.css"

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

  // modales
  const [openPruebas, setOpenPruebas] = useState(false);
  const [caseForPruebas, setCaseForPruebas] = useState(null);

  const [openResultado, setOpenResultado] = useState(false);
  const [intentoForResultado, setIntentoForResultado] = useState(null);

  const [openPerfil, setOpenPerfil] = useState(false); // WIP

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      // 1) obtener casos con pruebas finalizadas (obtenemos primero los caso_id)
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // todos los intentos finalizados (solo ids de caso)
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

      // conteo total (para paginación)
      let filteredCaseIds = caseIds;
      // si hay búsqueda, necesitamos filtrar por datos del caso
      if (q.trim()) {
        const { data: allCases } = await supabase
          .from("casos")
          .select("id, paciente_nombre, paciente_ci, motivacion")
          .in("id", caseIds);

        const term = q.toLowerCase();
        filteredCaseIds = (allCases || [])
          .filter(c =>
            (c.paciente_nombre || "").toLowerCase().includes(term) ||
            (c.paciente_ci || "").toLowerCase().includes(term) ||
            (c.motivacion || "").toLowerCase().includes(term)
          )
          .map(c => c.id);
      }

      const totalCount = filteredCaseIds.length;

      // 2) traer página de casos
      const pageIds = filteredCaseIds.slice(from, to + 1);

      let list = [];
      if (pageIds.length > 0) {
        const { data: casos, error: e2 } = await supabase
          .from("casos")
          .select("id, paciente_nombre, paciente_ci, motivacion, creado_en")
          .in("id", pageIds);

        if (e2) {
          console.error(e2);
        } else {
          // ordenar según el orden de pageIds
          const map = new Map(casos.map(c => [c.id, c]));
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

      {/* MODAL 1: Pruebas finalizadas del caso */}
      {openPruebas && caseForPruebas && (
        <ModalPruebasCaso
          caso={caseForPruebas}
          onClose={() => { setOpenPruebas(false); setCaseForPruebas(null); }}
          onVerResultado={(intento) => { setIntentoForResultado(intento); setOpenResultado(true); }}
          onGenerarPerfil={() => setOpenPerfil(true)}
        />
      )}

      {/* MODAL 2: Resultado de una prueba */}
      {openResultado && intentoForResultado && (
        <ModalResultadoPrueba
          intento={intentoForResultado}
          onClose={() => { setOpenResultado(false); setIntentoForResultado(null); }}
        />
      )}

      {/* MODAL 3: Generar perfil (WIP) */}
      {openPerfil && (
        <ModalPerfilWIP onClose={() => setOpenPerfil(false)} />
      )}
    </div>
  );
}

/* ----------------------------- Modal 1 ----------------------------- */
function ModalPruebasCaso({ caso, onClose, onVerResultado, onGenerarPerfil }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const sel = `
        id, caso_id, prueba_id, terminado_en, duracion_segundos, firma_base64,
        pruebas:prueba_id (codigo, nombre)
      `;
      const { data, error } = await supabase
        .from("intentos_prueba")
        .select(sel)
        .eq("caso_id", caso.id)
        .not("terminado_en", "is", null)
        .order("terminado_en", { ascending: false });

      if (!error && alive) {
        setItems((data || []).map(r => ({
          ...r,
          prueba: r.pruebas?.nombre || r.pruebas?.codigo || "—",
        })));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [caso?.id]);

  return (
    <div className="exit-modal">
      <div className="modal-content" style={{ maxWidth: 820 }}>
        <h3 style={{ marginTop: 0 }}>Pruebas finalizadas</h3>
        <p style={{ marginTop: 0 }}>
          <strong>Paciente:</strong> {caso.paciente_nombre} &nbsp; <small>CI: {caso.paciente_ci || "—"}</small>
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="btn-confirm-exit" onClick={onGenerarPerfil}>🧩 Generar perfil (WIP)</button>
          <div style={{ marginLeft: "auto" }} />
          <button className="btn-cancel-exit" onClick={onClose}>Cerrar</button>
        </div>

        <div className="historial-table-container">
          <table>
            <thead>
              <tr>
                <th>Prueba</th>
                <th>Fecha fin</th>
                <th>Duración</th>
                <th>Firma</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="muted">Cargando…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={5} className="muted">Sin pruebas finalizadas</td></tr>}
              {!loading && items.map(it => (
                <tr key={it.id}>
                  <td>{it.prueba}</td>
                  <td>{it.terminado_en ? new Date(it.terminado_en).toLocaleString() : "—"}</td>
                  <td>{formatDur(it.duracion_segundos)}</td>
                  <td>{it.firma_base64 ? "✔" : "—"}</td>
                  <td>
                    <button className="btn-link" onClick={() => onVerResultado(it)} title="Ver resultado">📄 Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

/* ----------------------------- Modal 2 ----------------------------- */
function ModalResultadoPrueba({ intento, onClose }) {
  const [meta, setMeta] = useState(null);
  const [resps, setResps] = useState([]);
  const printRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Metadatos e info de caso/prueba
      const sel = `
        id, caso_id, prueba_id, iniciado_en, terminado_en, duracion_segundos, firma_base64,
        casos:caso_id (paciente_nombre, paciente_ci, motivacion),
        pruebas:prueba_id (codigo, nombre)
      `;
      const { data: intentoFull } = await supabase
        .from("intentos_prueba")
        .select(sel)
        .eq("id", intento.id)
        .maybeSingle();

      // Respuestas con enunciado y orden
      const { data: res } = await supabase
        .from("respuestas")
        .select(`
          id, valor, invertido,
          item:items_prueba(enunciado, orden)
        `)
        .eq("intento_id", intento.id)
        .order("id", { ascending: true });

      if (!alive) return;
      setMeta(intentoFull || intento);
      setResps((res || []).map(r => ({
        orden: r.item?.orden ?? null,
        enunciado: r.item?.enunciado ?? "",
        valor: r.valor,
        invertido: r.invertido,
      })));
    })();
    return () => { alive = false; };
  }, [intento?.id]);

  function exportCSV() {
    // CSV simple (Excel lo abre)
    const headers = ["orden", "enunciado", "valor", "invertido"];
    const rows = resps.map(r => [
      r.orden ?? "",
      '"' + (String(r.enunciado || "").replace(/"/g, '""')) + '"',
      '"' + (String(r.valor || "").replace(/"/g, '""')) + '"',
      r.invertido ? "1" : "0",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const prueba = meta?.pruebas?.nombre || meta?.pruebas?.codigo || "prueba";
    a.href = url;
    a.download = `resultado_${prueba}_${meta?.id || ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    // Truco: abre diálogo de impresión del contenido del modal (sirve para PDF)
    const node = printRef.current;
    if (!node) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    // estilos mínimos
    printWindow.document.write(`
      <html><head><title>Resultado</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 18px; }
        h2,h3 { margin: 0 0 6px; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
        th { background: #f6f6f6; text-align: left; }
        .muted { color: #777; }
      </style>
      </head><body>${node.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <div className="exit-modal">
      <div className="modal-content" style={{ maxWidth: 980 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Resultado de la prueba</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn-confirm-exit" onClick={exportPDF}>Exportar PDF</button>
            <button className="btn-confirm-exit" onClick={exportCSV}>Exportar Excel</button>
            <button className="btn-cancel-exit" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div ref={printRef}>
          <div style={{ marginBottom: 8 }}>
            <strong>Paciente:</strong> {meta?.casos?.paciente_nombre || "—"}
            &nbsp; <small>CI: {meta?.casos?.paciente_ci || "—"}</small>
          </div>
          <div><strong>Motivo:</strong> {meta?.casos?.motivacion || "—"}</div>
          <div><strong>Prueba:</strong> {meta?.pruebas?.nombre || meta?.pruebas?.codigo || "—"}</div>
          <div><strong>Inicio:</strong> {meta?.iniciado_en ? new Date(meta.iniciado_en).toLocaleString() : "—"}</div>
          <div><strong>Fin:</strong> {meta?.terminado_en ? new Date(meta.terminado_en).toLocaleString() : "—"}</div>
          <div><strong>Duración:</strong> {formatDur(meta?.duracion_segundos)}</div>
          <div><strong>Firma pac.:</strong> {meta?.firma_base64 ? "✔" : "—"}</div>

          <h4 style={{ margin: "12px 0 6px" }}>Respuestas</h4>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Enunciado</th>
                <th>Respuesta</th>
                <th>Invertida</th>
              </tr>
            </thead>
            <tbody>
              {resps.length === 0 && (
                <tr><td colSpan={4} className="muted">Sin respuestas</td></tr>
              )}
              {resps.map((r, i) => (
                <tr key={i}>
                  <td style={{ width: 48 }}>{r.orden ?? i + 1}</td>
                  <td>{r.enunciado}</td>
                  <td style={{ width: 160 }}>{r.valor}</td>
                  <td style={{ width: 100 }}>{r.invertido ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Aquí luego se podrán renderizar las escalas/perfiles */}
          <div className="muted" style={{ marginTop: 10 }}>
            <em>Panel de escalas/interpretación (en desarrollo).</em>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Modal 3 (WIP) ----------------------------- */
function ModalPerfilWIP({ onClose }) {
  return (
    <div className="exit-modal">
      <div className="modal-content" style={{ maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>Generar perfil (en trabajo)</h3>
        <p className="muted">
          Aquí mostraremos el perfil interpretativo agregado a partir de las pruebas finalizadas del caso.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn-cancel-exit" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- util ----------------------------- */
function formatDur(sec) {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
