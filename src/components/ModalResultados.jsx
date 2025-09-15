// src/components/ModalResultados.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "../styles/ModalResultados.css";
import { generarPDF_PAI } from "../pdf/ReportePAI";  // ⬅️ generador PDF PAI (ya lo tenías)
import { getCurrentUserRole, canGenerateProfile } from "../lib/roles";
import { jsPDF } from "jspdf"; // ⬅️ NUEVO: para exportar PDF del perfil (npm i jspdf)

// Plantilla Excel empaquetada por Vite (PAI)
import PAI_TEMPLATE_URL from "../assets/templates/Hoja-de-calculo-para-PAI-vacio.xlsx?url";

const REQUERIDAS = ["PAI", "MMPI-2", "MCMI-IV"];

const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  DEFAULT: "static/images/testP.jpg",
};

// ===== Clases (map según tu documento) =====
const CLASES = [
  "No_clínico",
  "Ansiedad",
  "Depresivo",
  "Uso de Sustancias",
  "Antisocial",
  "Paranoide",
  "Psicótico/Esquizofrenia",
  "Bipolar",
  "Límite",
];

// ====== Mapeos de escalas PAI para armar el JSON ======
const CODES_CLINICAS = ["SOM","ANS","TRA","DEP","MAN","PAR","ESQ","LIM","ANT","ALC","DRG"];
const CODES_TRAT     = ["AGR","SUI","EST","FAS","RTR"];
const CODES_INTERP   = ["DOM","AFA"];

// Ayudas
const toIndex = (raw) => {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (/^[0-3]$/.test(s)) return Number(s);
  if (/^[1-4]$/.test(s)) return Number(s) - 1;
  if (/^[a-d]$/.test(s)) return s.charCodeAt(0) - 97;
  const m = { nada:0, poco:1, algo:2, mucho:3, af:0, lc:1, pc:2, mc:3 };
  if (Object.prototype.hasOwnProperty.call(m, s)) return m[s];
  if (/absolut(a|amente)\s*falso/.test(s)) return 0;
  if (/liger(amente)?/.test(s)) return 1;
  if (/principal(mente)?/.test(s)) return 2;
  if (/muy\s*cierto/.test(s)) return 3;
  return null;
};

// =================== COMPONENTE ===================
export default function ModalResultados({ open, onClose, caso }) {
  const [rol, setRol] = useState(null);

  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState([]);
  const [attemptsByCode, setAttemptsByCode] = useState({});
  const allReady = useMemo(() => REQUERIDAS.every((c) => attemptsByCode[c]?.intentoId), [attemptsByCode]);

  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleTest, setDetalleTest] = useState(null);
  const [puntajes, setPuntajes] = useState([]);
  const [puntajesLoading, setPuntajesLoading] = useState(false);

  const [showPerfil, setShowPerfil] = useState(false);

  // NUEVO: modal del generador de perfil (siempre habilitado)
  const [showGen, setShowGen] = useState(false);
  const [prediccion, setPrediccion] = useState(null);
  const [probs, setProbs] = useState([]);

  // ===== util: simulación local del perfil =====
  function simularPerfil() {
    // Probabilidades de ejemplo (suman 1). Ajusta si quieres otro patrón.
    // Genera una distribución suave y elige top-3 para mostrar.
    const rnd = CLASES.map(() => Math.random() ** 2); // sesgo a valores pequeños
    const sum = rnd.reduce((a, b) => a + b, 0) || 1;
    const p = rnd.map(v => v / sum);

    // Top-1 como clase final
    let bestIdx = 0;
    p.forEach((v, i) => { if (v > p[bestIdx]) bestIdx = i; });

    return {
      clase: CLASES[bestIdx],
      probs: p.map((v, i) => ({ clase: CLASES[i], p: v })),
    };
  }

  function abrirGeneradorPerfil() {
    const { clase, probs } = simularPerfil();
    // Ordenar de mayor a menor para mostrar top-3
    const sorted = [...probs].sort((a, b) => b.p - a.p);
    setPrediccion({ clase, top3: sorted.slice(0, 3) });
    setProbs(sorted);
    setShowGen(true);
  }

  function exportarPDFPerfil() {
    if (!prediccion) return;
    const doc = new jsPDF({ unit: "pt" });
    const pad = 48;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Informe de Perfil Criminológico", pad, 60);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const fecha = new Date().toLocaleString();
    doc.text(`Fecha: ${fecha}`, pad, 82);
    doc.text(`Paciente: ${caso?.paciente_nombre || "—"}`, pad, 98);
    doc.text(`CI: ${caso?.paciente_ci || "—"}`, pad, 114);

    // Resultado principal
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Resultado principal", pad, 150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Clasificación: ${prediccion.clase}`, pad, 170);

    // Tabla top-3
    doc.setFont("helvetica", "bold");
    doc.text("Top-3 probabilidades", pad, 204);
    doc.setFont("helvetica", "normal");
    const startY = 224;
    const rowH = 18;
    doc.text("Clase", pad, startY);
    doc.text("Probabilidad", pad + 280, startY);

    prediccion.top3.forEach((r, idx) => {
      const y = startY + rowH * (idx + 1);
      doc.text(r.clase, pad, y);
      doc.text(`${(r.p * 100).toFixed(2)} %`, pad + 280, y);
    });

    // Nota
    const noteY = startY + rowH * (prediccion.top3.length + 2);
    doc.setFontSize(10);
    doc.text(
      "Nota: este reporte fue generado desde el módulo de integración. Sustituir con la inferencia real cuando esté disponible.",
      pad,
      noteY,
      { maxWidth: 500 }
    );

    const nombre = `Perfil_${(caso?.paciente_ci || "caso")}.pdf`;
    doc.save(nombre);
  }

  // Carga rol + pruebas + últimos intentos terminados
  useEffect(() => {
    if (!open || !caso?.id) return;

    (async () => {
      const r = await getCurrentUserRole();
      setRol(r);
    })();

    (async () => {
      setLoading(true);
      setTests([]); setAttemptsByCode({});
      try {
        const { data: pruebas } = await supabase
          .from("pruebas").select("id,codigo,nombre")
          .in("codigo", REQUERIDAS).order("nombre");

        const { data: intents } = await supabase
          .from("intentos_prueba")
          .select("id,prueba_id,terminado_en")
          .eq("caso_id", caso.id)
          .order("terminado_en", { ascending: false, nullsLast: true });

        const lastDone = {};
        (intents || []).forEach((it) => {
          if (!it.terminado_en) return;
          if (!lastDone[it.prueba_id]) lastDone[it.prueba_id] = it;
        });

        const list = (pruebas || []).map((p) => {
          const intento = lastDone[p.id];
          return {
            id: p.id, codigo: p.codigo, nombre: p.nombre,
            img: PRUEBA_IMG[p.codigo] || PRUEBA_IMG.DEFAULT,
            done: !!intento, intentoId: intento?.id || null,
          };
        });

        const attempts = {};
        list.forEach((t) => { if (t.done) attempts[t.codigo] = { intentoId: t.intentoId }; });

        setTests(list); setAttemptsByCode(attempts);
      } finally { setLoading(false); }
    })();
  }, [open, caso?.id]);

  // Abrir detalle y cargar puntajes del intento
  const abrirDetalle = async (t) => {
    if (!t?.done || !t?.intentoId) return;
    setDetalleTest(t); setShowDetalle(true); setPuntajes([]); setPuntajesLoading(true);
    try {
      const { data } = await supabase
        .from("puntajes")
        .select(`
          escala_id,
          puntaje_convertido,
          escalas:escala_id ( codigo )
        `)
        .eq("intento_id", t.intentoId)
        .order("escala_id");

      const norm = (data || []).map(r => ({
        escala: r?.escalas?.codigo || r.escala_id,
        puntaje: r?.puntaje_convertido ?? null,
      }));

      setPuntajes(norm);
    } finally { setPuntajesLoading(false); }
  };
  const cerrarDetalle = () => { setShowDetalle(false); setDetalleTest(null); setPuntajes([]); };

  // ================== EXPORTAR EXCEL (PAI) ==================
  async function exportarExcelPAI(t, caso) {
    try {
      if (!t?.intentoId) { alert("No hay intento para exportar."); return; }

      const { data: rows, error } = await supabase
        .from("respuestas")
        .select(`item_id, valor, items_prueba!inner(orden)`)
        .eq("intento_id", t.intentoId)
        .order("orden", { ascending: true, foreignTable: "items_prueba" });
      if (error) throw error;

      const resp = await fetch(PAI_TEMPLATE_URL);
      if (!resp.ok) throw new Error("No pude cargar la plantilla del Excel.");
      const ab = await resp.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets["Hoja de Captura"] || wb.Sheets["Hoja de captura"] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("La plantilla no tiene la hoja 'Hoja de Captura'.");

      if (caso) {
        ws["A1"] = { t: "s", v: caso.paciente_nombre || "" };
        ws["A2"] = { t: "s", v: caso.paciente_ci || "" };
      }

      const idxByItem = new Map();
      for (let r = 1; r <= 2000; r++) {
        const cell = ws["A"+r]; if (!cell || cell.v == null) continue;
        const n = parseInt(String(cell.v).trim(),10);
        if (!Number.isNaN(n) && n>=1 && n<=1000 && !idxByItem.has(n)) idxByItem.set(n,r);
      }

      const COLS = ["C","D","E","F"];
      let maxRowTouched = 1;
      rows.forEach((r, i) => {
        const ord = Number(r?.items_prueba?.orden) || (i+1);
        const row = idxByItem.get(ord); if (!row) return;
        COLS.forEach((c)=> delete ws[`${c}${row}`]);
        const index = toIndex(r.valor);
        if (index!=null && index>=0 && index<=3) {
          ws[`${COLS[index]}${row}`] = { t:"s", v:"x", w:"x" };
          if (row>maxRowTouched) maxRowTouched=row;
        }
      });

      const ref = ws["!ref"] || "A1:H1";
      const m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
      ws["!ref"] = m ? `${m[1]}${m[2]}:${m[3]}${Math.max(maxRowTouched, Number(m[4]) || 1)}`
                     : `A1:H${Math.max(maxRowTouched,1)}`;

      const out = XLSX.write(wb, { type:"array", bookType:"xlsx" });
      const blob = new Blob([out], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const nombre = `PAI_${caso?.paciente_ci || ""}_${t.intentoId.slice(0,6)}.xlsx`;
      saveAs(blob, nombre);
    } catch (e) {
      console.error(e); alert(e.message || "No pude exportar el Excel.");
    }
  }

  // ================== EXPORTAR PDF (PAI) ==================
  function buildPaiJson(caso, puntajes) {
    const byCode = {};
    (puntajes || []).forEach(p => {
      if (!p) return;
      const code = String(p.escala || "").toUpperCase();
      const val = p.puntaje != null ? Number(p.puntaje) : null;
      if (code) byCode[code] = val;
    });
    const mkSubs = (codes) =>
      codes.filter(c => byCode[c] != null).map(c => ({ nombre: c, bruto: "", t: byCode[c] }));
    const serie = (codes) => mkSubs(codes).slice(0, 6).map(s => s.t);

    return {
      informe: {
        titulo: "Perfil PAI",
        institucion: "Sistema de Evaluación Psicológica",
        fecha: new Date().toISOString().slice(0,10),
      },
      evaluado: {
        nombre: caso?.paciente_nombre || "",
        edad: caso?.paciente_edad ?? "",
        sexo: caso?.paciente_sexo || "",
        id: caso?.paciente_ci || "",
      },
      secciones: [
        { titulo: "CLÍNICA",        subescalas: mkSubs(CODES_CLINICAS),   graficoT: serie(CODES_CLINICAS) },
        { titulo: "TRATAMIENTO",    subescalas: mkSubs(CODES_TRAT),       graficoT: serie(CODES_TRAT) },
        { titulo: "INTERPERSONAL",  subescalas: mkSubs(CODES_INTERP),     graficoT: serie(CODES_INTERP) },
      ],
    };
  }

  const onExportPdfPAI = () => {
    if (detalleTest?.codigo !== "PAI") {
      alert("Por ahora el PDF está implementado para PAI.");
      return;
    }
    if (!puntajes || puntajes.length === 0) {
      alert("No hay puntajes calculados para esta prueba.");
      return;
    }
    const json = buildPaiJson(caso, puntajes);
    generarPDF_PAI(json); // ⬅️ genera y descarga el PDF PAI
  };

  // ================== RENDER ==================
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) onClose?.(); }}
    >
      <div className="modal pruebas-modal mr-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head mr-header">
          <h3>Pruebas psicológicas</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>

        {caso && (
          <p className="muted mr-paciente">
            Paciente: <span className="mr-bold">{caso.paciente_nombre}</span> · CI{" "}
            <span className="mr-bold">{caso.paciente_ci || "—"}</span>
          </p>
        )}

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
                {t.done ? (
                  <span className="mr-badge mr-badge--done">✔ Completada</span>
                ) : (
                  <span className="mr-badge mr-badge--pending">Pendiente</span>
                )}
                <div className="mr-card__imgwrap">
                  <img src={t.img} alt={t.codigo} className="mr-card__img" />
                </div>
                <div className="mr-card__title">{t.nombre}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mr-actions" style={{ gap: 8 }}>
          {/* Botón clásico (tu RPC). Lo dejo, pero puedes ocultarlo si quieres */}
          <button
            className={allReady && canGenerateProfile(rol) ? "btn-primary mr-btn" : "btn-soft mr-btn mr-btn--disabled"}
            disabled={!allReady || !canGenerateProfile(rol)}
            onClick={async () => {
              try {
                if (!canGenerateProfile(rol)) return;
                const { data, error } = await supabase.rpc("generate_case_profile", { p_caso_id: caso.id });
                if (error) throw error;
                setShowPerfil(true);
                if (data?.signed_url) {
                  window.open(data.signed_url, "_blank");
                }
              } catch (e) {
                console.error(e);
                alert(e.message || "No fue posible generar el perfil.");
              }
            }}
            title={
              !canGenerateProfile(rol)
                ? "Tu rol no puede generar perfiles (solo ver/exportar)"
                : allReady
                  ? "Generar perfil (backend)"
                  : "Completa PAI + MMPI-2 + MCMI-IV para habilitar"
            }
          >
            Generar perfil (backend)
          </button>

          {/* NUEVO: SIEMPRE HABILITADO */}
          <button
            className="btn-primary mr-btn"
            onClick={abrirGeneradorPerfil}
            title="Generar perfil (simulado local)"
          >
            Generar perfil
          </button>
        </div>

        {/* Detalle por prueba */}
        {showDetalle && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) cerrarDetalle(); }}
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
                    <thead><tr><th>Escala</th><th>Valor</th></tr></thead>
                    <tbody>
                      {puntajes.slice(0, 20).map((r, i) => (
                        <tr key={i}><td>{r.escala}</td><td>{r.puntaje ?? "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="result-actions">
                <button
                  className="btn-soft"
                  onClick={() => {
                    if (detalleTest?.codigo !== "PAI") {
                      alert("Por ahora el exportador está implementado para PAI.");
                      return;
                    }
                    exportarExcelPAI(detalleTest, caso);
                  }}
                >
                  📁 Exportar Excel
                </button>

                <button className="btn-soft" onClick={onExportPdfPAI}>
                  📄 Exportar PDF (PAI)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal del perfil generado (siempre habilitado) */}
        {showGen && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) setShowGen(false); }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Generación de perfil</h3>
                <button className="close" onClick={() => setShowGen(false)}>✕</button>
              </div>

              <div className="result-body">
                <p className="muted" style={{ marginTop: 0 }}>
                  Paciente: <strong>{caso?.paciente_nombre || "—"}</strong> · CI{" "}
                  <strong>{caso?.paciente_ci || "—"}</strong>
                </p>

                <div className="card" style={{ marginTop: 6 }}>
                  <p className="muted" style={{ margin: 0 }}>Resultado principal</p>
                  <h2 style={{ margin: "6px 0 4px" }}>{prediccion?.clase || "—"}</h2>
                </div>

                <div className="card" style={{ marginTop: 10 }}>
                  <p className="muted" style={{ margin: 0 }}>Top-3 probabilidades</p>
                  <table className="table-mini" style={{ width: "100%", marginTop: 6 }}>
                    <thead><tr><th>Clase</th><th>Prob.</th></tr></thead>
                    <tbody>
                      {prediccion?.top3?.map((r, i) => (
                        <tr key={i}>
                          <td>{r.clase}</td>
                          <td>{(r.p * 100).toFixed(2)} %</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={exportarPDFPerfil}>
                  📄 Exportar PDF
                </button>
                <button className="btn-cancel-exit" onClick={() => setShowGen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de perfil generado por backend (tu flujo actual) */}
        {showPerfil && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) setShowPerfil(false); }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Informe final</h3>
                <button className="close" onClick={() => setShowPerfil(false)}>✕</button>
              </div>

              <div className="result-body" style={{ display: "block" }}>
                <p className="muted" style={{ marginBottom: 8 }}>
                  Paciente: <strong>{caso?.paciente_nombre}</strong> · CI{" "}
                  <strong>{caso?.paciente_ci || "—"}</strong>
                </p>
                <PerfilDescargable casoId={caso?.id} />
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={() => setShowPerfil(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PerfilDescargable({ casoId }) {
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState(null);
  const [signed, setSigned] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("perfiles_caso")
        .select("id, bucket, path, generated_at, mime_type, size_bytes")
        .eq("caso_id", casoId)
        .order("generated_at", { ascending: false })
        .limit(1);

      const row = (data || [])[0] || null;
      if (!alive) return;
      setPerfil(row || null);

      if (row?.bucket && row?.path) {
        const { data: urlData, error } = await supabase
          .storage
          .from(row.bucket)
          .createSignedUrl(row.path, 60 * 5); // 5 minutos
        if (!error) setSigned(urlData?.signedUrl || null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [casoId]);

  if (loading) return <div className="muted">Buscando perfil…</div>;
  if (!perfil) return <div className="muted">Aún no hay perfiles generados para este caso.</div>;

  return (
    <div className="card" style={{ marginTop: 6 }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Perfil disponible</p>
      <ul style={{ marginTop: 8, paddingLeft: 18 }}>
        <li><strong>Generado:</strong> {perfil.generated_at ? new Date(perfil.generated_at).toLocaleString() : "—"}</li>
        <li><strong>Archivo:</strong> {perfil.path}</li>
        <li><strong>Tamaño:</strong> {perfil.size_bytes ? `${perfil.size_bytes} bytes` : "—"}</li>
      </ul>
      <div style={{ marginTop: 8 }}>
        <a
          className="btn-confirm-exit"
          href={signed || "#"}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => { if (!signed) e.preventDefault(); }}
        >
          📄 Descargar PDF
        </a>
      </div>
    </div>
  );
}
