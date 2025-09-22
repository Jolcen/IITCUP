import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "../styles/ModalResultados.css";
import { generarPDF_PAI } from "../pdf/ReportePAI";
import { getCurrentUserRole, canGenerateProfile } from "../lib/roles";
import { jsPDF } from "jspdf";

// Plantillas Excel
import PAI_TEMPLATE_URL from "../assets/templates/PAI.xls";
import MCMI_TEMPLATE_URL from "../assets/templates/MCMI-IV.xlsm";


const REQUERIDAS = ["PAI", "MMPI-2", "MCMI-IV"];

const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  DEFAULT: "static/images/testP.jpg",
};

// ===== Clases mock para generador local (sin backend) =====
const CLASES = [
  "No_clínico","Ansiedad","Depresivo","Uso de Sustancias","Antisocial","Paranoide",
  "Psicótico/Esquizofrenia","Bipolar","Límite",
];

// Mapeos PAI → construir JSON de PDF
const CODES_CLINICAS = ["SOM","ANS","TRA","DEP","MAN","PAR","ESQ","LIM","ANT","ALC","DRG"];
const CODES_TRAT     = ["AGR","SUI","EST","FAS","RTR"];
const CODES_INTERP   = ["DOM","AFA"];

// Helpers PAI
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

// ====== MCMI helpers ======
function normalizaVF(valor) {
  // valor puede venir como jsonb o texto: { opcion:"Verdadero" } | "V" | true | 1 | "Falso" | false | 0
  try {
    if (valor && typeof valor === "object") {
      const v = (valor.opcion ?? valor.value ?? valor.v)?.toString().toLowerCase();
      if (v === "verdadero" || v === "v" || v === "true" || v === "1") return "V";
      if (v === "falso" || v === "f" || v === "false" || v === "0") return "F";
    } else if (typeof valor === "string") {
      const s = valor.trim().toLowerCase();
      if (["v","verdadero","true","1","sí","si"].includes(s)) return "V";
      if (["f","falso","false","0","no"].includes(s)) return "F";
    } else if (typeof valor === "boolean") {
      return valor ? "V" : "F";
    } else if (typeof valor === "number") {
      return valor === 1 ? "V" : valor === 0 ? "F" : null;
    }
  } catch { /* ignore */ }
  return null;
}

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

  // generador local de perfil (simulado)
  const [showGen, setShowGen] = useState(false);
  const [prediccion, setPrediccion] = useState(null);

  function simularPerfil() {
    const rnd = CLASES.map(() => Math.random() ** 2);
    const sum = rnd.reduce((a, b) => a + b, 0) || 1;
    const p = rnd.map(v => v / sum);
    let bestIdx = 0; p.forEach((v, i) => { if (v > p[bestIdx]) bestIdx = i; });
    const sorted = p.map((v, i) => ({ clase: CLASES[i], p: v })).sort((a, b) => b.p - a.p);
    setPrediccion({ clase: CLASES[bestIdx], top3: sorted.slice(0, 3) });
    setShowGen(true);
  }

  function exportarPDFPerfil() {
    if (!prediccion) return;
    const doc = new jsPDF({ unit: "pt" });
    const pad = 48;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Informe de Perfil Criminológico", pad, 60);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const fecha = new Date().toLocaleString();
    doc.text(`Fecha: ${fecha}`, pad, 82);
    doc.text(`Paciente: ${caso?.paciente_nombre || "—"}`, pad, 98);
    doc.text(`CI: ${caso?.paciente_ci || "—"}`, pad, 114);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Resultado principal", pad, 150);
    doc.setFont("helvetica", "normal"); doc.setFontSize(12);
    doc.text(`Clasificación: ${prediccion.clase}`, pad, 170);
    doc.setFont("helvetica", "bold"); doc.text("Top-3 probabilidades", pad, 204);
    doc.setFont("helvetica", "normal");
    const startY = 224, rowH = 18;
    doc.text("Clase", pad, startY); doc.text("Probabilidad", pad + 280, startY);
    prediccion.top3.forEach((r, idx) => {
      const y = startY + rowH * (idx + 1);
      doc.text(r.clase, pad, y);
      doc.text(`${(r.p * 100).toFixed(2)} %`, pad + 280, y);
    });
    const nombre = `Perfil_${(caso?.paciente_ci || "caso")}.pdf`;
    doc.save(nombre);
  }

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
        // Pruebas finalizadas de este caso (último intento por prueba)
        const { data: fin } = await supabase.rpc("api_pruebas_finalizadas_por_caso", { p_caso: caso.id });
        const doneByCode = {};
        (fin || []).forEach(p => {
          const code = p?.codigo || "";
          doneByCode[code] = { intentoId: p.intento_id, terminado_en: p.terminado_en };
        });

        // Mostrar tarjetas en orden fijo (REQUERIDAS), marcando las finalizadas
        const list = REQUERIDAS.map(code => ({
          id: code,
          codigo: code,
          nombre: code,
          img: PRUEBA_IMG[code] || PRUEBA_IMG.DEFAULT,
          done: !!doneByCode[code],
          intentoId: doneByCode[code]?.intentoId || doneByCode[code]?.intento_id || null,
          terminado_en: doneByCode[code]?.terminado_en || null,
        }));
        setTests(list);
        setAttemptsByCode(Object.fromEntries(list.filter(t => t.done).map(t => [t.codigo, { intentoId: t.intentoId }])));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, caso?.id]);

  // Detalle + puntajes
  const abrirDetalle = async (t) => {
    if (!t?.done || !t?.intentoId) return;
    setDetalleTest(t); setShowDetalle(true); setPuntajes([]); setPuntajesLoading(true);
    try {
      const { data, error } = await supabase.rpc("api_puntajes_por_intento", { p_intento: t.intentoId });
      if (error) throw error;
      const norm = (data || []).map(r => ({
        escala: r?.escala_codigo || r?.escala_id,
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
      if (!resp.ok) throw new Error("No pude cargar la plantilla del Excel PAI.");
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

      const out = XLSX.write(wb, { type:"array", bookType:"xlsx" });
      const blob = new Blob([out], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const nombre = `PAI_${caso?.paciente_ci || ""}_${t.intentoId.slice(0,6)}.xlsx`;
      saveAs(blob, nombre);
    } catch (e) {
      console.error(e); alert(e.message || "No pude exportar el Excel PAI.");
    }
  }

  // ================== EXPORTAR EXCEL (MCMI-IV) ==================
  async function exportarExcelMCMI(t, caso) {
    try {
      if (!t?.intentoId) { alert("No hay intento para exportar."); return; }

      const { data: rows, error } = await supabase
        .from("respuestas")
        .select(`item_id, valor, items_prueba!inner(orden)`)
        .eq("intento_id", t.intentoId)
        .order("orden", { ascending: true, foreignTable: "items_prueba" });
      if (error) throw error;

      const resp = await fetch(MCMI_TEMPLATE_URL);
      if (!resp.ok) throw new Error("No pude cargar la plantilla del Excel MCMI-IV.");
      const ab = await resp.arrayBuffer();
      const wb = XLSX.read(ab, { cellDates: true });
      const ws = wb.Sheets["aplicacion"] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("La plantilla no tiene la hoja 'aplicacion'.");

      // Datos cabecera (si quieres usar otras celdas, ajusta aquí)
      if (caso) {
        // Ejemplo: poner nombre en B6, CI en B7 (ajusta a tu plantilla si deseas)
        // ws["B6"] = { t: "s", v: caso.paciente_nombre || "" };
        // ws["B7"] = { t: "s", v: caso.paciente_ci || "" };
      }

      // Respuestas: C=Verdadero, D=Falso; filas 13..207
      const ROW_START = 13;
      rows.forEach((r, i) => {
        const row = ROW_START + i;              // según orden secuencial
        const vf = normalizaVF(r?.valor);
        delete ws[`C${row}`]; delete ws[`D${row}`];
        if (vf === "V") ws[`C${row}`] = { t: "s", v: "1", w: "1" };
        if (vf === "F") ws[`D${row}`] = { t: "s", v: "1", w: "1" };
      });

      const out = XLSX.write(wb, { type: "array", bookType: "xlsm" });
      const blob = new Blob([out], { type: "application/vnd.ms-excel.sheet.macroEnabled.12" });
      const nombre = `MCMI-IV_${caso?.paciente_ci || ""}_${t.intentoId.slice(0,6)}.xlsm`;
      saveAs(blob, nombre);
    } catch (e) {
      console.error(e); alert(e.message || "No pude exportar el Excel MCMI-IV.");
    }
  }

  // ================== PDF PAI directo (no en detalle) ==================
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
      informe: { titulo: "Perfil PAI", institucion: "Sistema de Evaluación Psicológica", fecha: new Date().toISOString().slice(0,10) },
      evaluado: { nombre: caso?.paciente_nombre || "", edad: caso?.paciente_edad ?? "", sexo: caso?.paciente_sexo || "", id: caso?.paciente_ci || "" },
      secciones: [
        { titulo: "CLÍNICA",        subescalas: mkSubs(CODES_CLINICAS),   graficoT: serie(CODES_CLINICAS) },
        { titulo: "TRATAMIENTO",    subescalas: mkSubs(CODES_TRAT),       graficoT: serie(CODES_TRAT) },
        { titulo: "INTERPERSONAL",  subescalas: mkSubs(CODES_INTERP),     graficoT: serie(CODES_INTERP) },
      ],
    };
  }
  const onExportPdfPAI = () => {
    if (detalleTest?.codigo !== "PAI") {
      alert("Por ahora el PDF está implementado para PAI."); return;
    }
    if (!puntajes || puntajes.length === 0) {
      alert("No hay puntajes calculados para esta prueba."); return;
    }
    const json = buildPaiJson(caso, puntajes);
    generarPDF_PAI(json);
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) onClose?.(); }}>
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
                key={t.codigo}
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
          <button
            className={allReady && canGenerateProfile(rol) ? "btn-primary mr-btn" : "btn-soft mr-btn mr-btn--disabled"}
            disabled={!allReady || !canGenerateProfile(rol)}
            onClick={async () => {
              try {
                if (!canGenerateProfile(rol)) return;
                const { data, error } = await supabase.rpc("generate_case_profile", { p_caso_id: caso.id });
                if (error) throw error;
                setShowPerfil(true);
                if (data?.signed_url) window.open(data.signed_url, "_blank");
              } catch (e) {
                console.error(e); alert(e.message || "No fue posible generar el perfil.");
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

          <button className="btn-primary mr-btn" onClick={simularPerfil} title="Generar perfil (simulado local)">
            Generar perfil
          </button>
        </div>

        {/* Detalle por prueba */}
        {showDetalle && (
          <div className="modal-overlay nested" onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) cerrarDetalle(); }}>
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
                      {puntajes.slice(0, 50).map((r, i) => (
                        <tr key={i}><td>{r.escala}</td><td>{r.puntaje ?? "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="result-actions">
                {/* EXCEL según prueba */}
                {detalleTest?.codigo === "PAI" && (
                  <button className="btn-soft" onClick={() => exportarExcelPAI(detalleTest, caso)}>
                    📁 Exportar Excel
                  </button>
                )}
                {detalleTest?.codigo === "MCMI-IV" && (
                  <button className="btn-soft" onClick={() => exportarExcelMCMI(detalleTest, caso)}>
                    📁 Exportar Excel
                  </button>
                )}

                {/* PDF PAI (se mantiene, pero... */}
                {/* 🔒 pedido: ocultar botón PDF en la vista previa de prueba */}
                <span style={{ display: "none" }}>
                  <button className="btn-soft" onClick={onExportPdfPAI}>📄 Exportar PDF (PAI)</button>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Modal del perfil generado (simulado) */}
        {showGen && (
          <div className="modal-overlay nested" onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) setShowGen(false); }}>
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
                        <tr key={i}><td>{r.clase}</td><td>{(r.p * 100).toFixed(2)} %</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={exportarPDFPerfil}>📄 Exportar PDF</button>
                <button className="btn-cancel-exit" onClick={() => setShowGen(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {/* Informe backend existente */}
        {showPerfil && (
          <PerfilGenerado casoId={caso?.id} onClose={() => setShowPerfil(false)} />
        )}
      </div>
    </div>
  );
}

// ===== Informe backend existente (sin cambios funcionales) =====
function PerfilGenerado({ casoId, onClose }) {
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
        const { data: urlData } = await supabase.storage.from(row.bucket).createSignedUrl(row.path, 60 * 5);
        setSigned(urlData?.signedUrl || null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [casoId]);

  return (
    <div className="modal-overlay nested" onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) onClose?.(); }}>
      <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Informe final</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>

        <div className="result-body" style={{ display: "block" }}>
          {loading && <div className="muted">Buscando perfil…</div>}
          {!loading && !perfil && <div className="muted">Aún no hay perfiles generados para este caso.</div>}
          {!loading && perfil && (
            <div className="card" style={{ marginTop: 6 }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Perfil disponible</p>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                <li><strong>Generado:</strong> {perfil.generated_at ? new Date(perfil.generated_at).toLocaleString() : "—"}</li>
                <li><strong>Archivo:</strong> {perfil.path}</li>
                <li><strong>Tamaño:</strong> {perfil.size_bytes ? `${perfil.size_bytes} bytes` : "—"}</li>
              </ul>
              <div style={{ marginTop: 8 }}>
                <a className="btn-confirm-exit" href={signed || "#"} target="_blank" rel="noreferrer" onClick={(e) => { if (!signed) e.preventDefault(); }}>
                  📄 Descargar PDF
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="result-actions">
          <button className="btn-soft" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
