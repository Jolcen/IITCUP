// src/pages/Historial.jsx
import "../styles/Historial.css";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 10;

export default function Historial() {
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

  // Modal de firma
  const [showFirma, setShowFirma] = useState(false);
  const [firmaSel, setFirmaSel] = useState(null); // { url, paciente, firmado_en }

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

  // Helper: URL firmada (con fallback a pública)
  async function getFileUrl(bucket, path, expiresSec = 3600) {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresSec);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch (_) { /* ignore */ }
    try {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (_) {
      return null;
    }
  }

  // ---------- Tabla ----------
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // 1) Intentos
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
        const intentoIds = Array.from(new Set((intentos || []).map((x) => x.id)));

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

        // 3) Pacientes
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

        // 5) Firmas (última por intento)
        let firmasByIntento = {};
        if (intentoIds.length) {
          const { data: firmas, error: errF } = await supabase
            .from("firmas_intento")
            .select("id,intento_id,firma_bucket,firma_path,firma_mime,firmado_en")
            .in("intento_id", intentoIds)
            .order("firmado_en", { ascending: false });
          if (errF) throw errF;

          (firmas || []).forEach((f) => {
            if (!firmasByIntento[f.intento_id]) firmasByIntento[f.intento_id] = f;
          });

          const intentosConFirma = Object.values(firmasByIntento);
          for (const f of intentosConFirma) {
            if (f?.firma_bucket && f?.firma_path) {
              f.url = await getFileUrl(f.firma_bucket, f.firma_path, 3600);
            } else {
              f.url = null;
            }
          }
        }

        // 6) Armar lista final
        let list = (intentos || []).map((r) => {
          const c = casosById[r.caso_id] || {};
          const p = c.paciente_id ? pacientesById[c.paciente_id] || {} : {};
          const pr = pruebasById[r.prueba_id] || {};
          const firma = firmasByIntento[r.id] || null;

          const paciente_nombre = [p.nombres, p.apellidos].filter(Boolean).join(" ") || "—";
          const documento = [p.doc_tipo, p.doc_numero, p.doc_expedido].filter(Boolean).join(" ") || "—";

          const estado =
            r.terminado_en || r.finalizado_en
              ? "evaluado"
              : r.iniciado_en || r.empezado_en
              ? "en_evaluacion"
              : "pendiente";

          const creado_en = c.creado_en ?? r.iniciado_en ?? null;

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
            estado, // ya no se muestra en la tabla, pero lo conservamos por si filtras
            paciente_nombre,
            paciente_doc: documento,
            motivacion: c.motivacion ?? "—",
            prueba_codigo: pr.codigo ?? "—",
            creado_en,
            asignado_a: c.asignado_a ?? null,
            responsable: null,
            duracion_minutos: durMin,

            // Firma
            firma_url: firma?.url || null,
            firma_bucket: firma?.firma_bucket || null,
            firma_path: firma?.firma_path || null,
            firmado_en: firma?.firmado_en || null,
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
          setUserMap((prev) => ({ ...prev, ...map }));
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

  // Modal firma
  const openFirmaModal = (row) => {
    if (!row?.firma_url) return;
    setFirmaSel({
      url: row.firma_url,
      paciente: row.paciente_nombre,
      firmado_en: row.firmado_en,
    });
    setShowFirma(true);
  };
  const closeFirmaModal = () => {
    setShowFirma(false);
    setFirmaSel(null);
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
              <th>Responsable</th>
              {/* Estado eliminado */}
              <th>Duración</th>
              <th>Firma</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">Sin registros</td>
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
                {/* Estado eliminado */}
                <td>
                  {r.terminado_en || r.finalizado_en
                    ? (r.duracion_minutos === "<1" ? "<1 min" : `${r.duracion_minutos} min`)
                    : "—"}
                </td>
                <td className="firma-cell">
                  {r.firma_url ? (
                    <img
                      className="firma-thumb"
                      src={r.firma_url}
                      alt={`Firma de ${r.paciente_nombre || "paciente"}`}
                      onClick={() => openFirmaModal(r)}
                    />
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

      {/* Modal de firma (imagen grande) */}
      {showFirma && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target.classList.contains("modal-overlay")) closeFirmaModal();
          }}
        >
          <div className="modal firma-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Firma del paciente</h3>
              <button className="close" onClick={closeFirmaModal}>✕</button>
            </div>
            <div className="firma-modal-body">
              {firmaSel?.firmado_en && (
                <p className="muted firma-meta">
                  Firmado: {new Date(firmaSel.firmado_en).toLocaleString()}
                </p>
              )}
              <div className="firma-modal-imgwrap">
                <img className="firma-modal-img" src={firmaSel?.url || ""} alt="Firma" />
              </div>
            </div>
            <div className="result-actions">
              <a className="btn-soft" href={firmaSel?.url || "#"} target="_blank" rel="noreferrer">Abrir en nueva pestaña</a>
              <button className="btn-soft" onClick={closeFirmaModal}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
