// src/components/ModalResultados.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "../styles/ModalResultados.css";

import { jsPDF } from "jspdf";
// autoTable lo dejamos por si luego quieres anexar tablas
import autoTable from "jspdf-autotable";


// Plantilla Excel empaquetada por Vite
import PAI_TEMPLATE_URL from "../assets/templates/Hoja-de-calculo-para-PAI-vacio.xlsx?url";

const REQUERIDAS = ["PAI", "MMPI-2", "MCMI-IV"];

const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  DEFAULT: "static/images/testP.jpg",
};

  // Orden oficial (ajústalo si lo deseas)
const PAI_VALIDES = ["INC","INF","IMN","IMP"];
const PAI_CLINICAS = ["SOM","ANS","TRA","DEP","MAN","PAR","ESQ","LIM","ANT","ALC","DRG"];
const PAI_TRAT = ["AGR","SUI","EST","FAS","RTR"];
const PAI_INTERP = ["DOM","AFA"];

// Rango y bandas (aprox. a tu plantilla)
const T_MIN = 20;
const T_MAX = 110;

// Colores
const C_GREY = [120,120,120];
const C_TEXT = [20,20,20];
const C_GREEN = [198, 228, 214]; // verde claro (40-59)
const C_GREYBAND = [230, 230, 230]; // 60-69
const C_ORANGE = [247, 227, 200]; // 70-110
const C_LINE = [30, 60, 90];      // polilínea
const C_DOT = [30, 60, 90];

// Convierte T a coordenada X
const tToX = (t, x0, width) => {
  if (t == null || isNaN(t)) return null;
  const tt = Math.max(T_MIN, Math.min(T_MAX, Number(t)));
  return x0 + ((tt - T_MIN) * width) / (T_MAX - T_MIN);
};

// Dibuja la regla horizontal con marcas
function drawAxis(doc, x0, y, w) {
  doc.setDrawColor(...C_GREY);
  doc.setLineWidth(0.6);
  doc.line(x0, y, x0 + w, y);

  const ticks = [20,40,50,60,70,80,90,100,110];
  doc.setFont("helvetica","normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GREY);
  ticks.forEach(t => {
    const xx = tToX(t, x0, w);
    doc.line(xx, y-3, xx, y+3);
    doc.text(String(t), xx-6, y+14);
  });
  doc.setTextColor(...C_TEXT);
}

// Dibuja bandas de fondo: 40-59 (verde), 60-69 (gris), 70-110 (naranja)
function drawBands(doc, x0, yTop, h, w) {
  // verde 40-59
  let xA = tToX(40, x0, w);
  let xB = tToX(59, x0, w);
  doc.setFillColor(...C_GREEN);
  doc.rect(xA, yTop, xB-xA, h, "F");

  // gris 60-69
  xA = tToX(60, x0, w);
  xB = tToX(69, x0, w);
  doc.setFillColor(...C_GREYBAND);
  doc.rect(xA, yTop, xB-xA, h, "F");

  // naranja 70-110
  xA = tToX(70, x0, w);
  xB = tToX(110, x0, w);
  doc.setFillColor(...C_ORANGE);
  doc.rect(xA, yTop, xB-xA, h, "F");
}


export default function ModalResultados({ open, onClose, caso }) {
  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState([]);
  const [attemptsByCode, setAttemptsByCode] = useState({});
  const allReady = useMemo(
    () => REQUERIDAS.every((c) => attemptsByCode[c]?.intentoId),
    [attemptsByCode]
  );

  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleTest, setDetalleTest] = useState(null);
  const [puntajes, setPuntajes] = useState([]);
  const [puntajesLoading, setPuntajesLoading] = useState(false);

  const [showPerfil, setShowPerfil] = useState(false);

  useEffect(() => {
    if (!open || !caso?.id) return;
    (async () => {
      setLoading(true);
      setTests([]);
      setAttemptsByCode({});
      try {
        const { data: pruebas } = await supabase
          .from("pruebas")
          .select("id,codigo,nombre")
          .in("codigo", REQUERIDAS)
          .order("nombre");

        const { data: intents } = await supabase
          .from("intentos_prueba")
          .select("id,prueba_id,terminado_en")
          .eq("caso_id", caso.id)
          .order("terminado_en", { ascending: false, nullsLast: true });

        const lastDoneByPrueba = {};
        (intents || []).forEach((it) => {
          if (!it.terminado_en) return;
          if (!lastDoneByPrueba[it.prueba_id]) lastDoneByPrueba[it.prueba_id] = it;
        });

        const list = (pruebas || []).map((p) => {
          const intento = lastDoneByPrueba[p.id];
          return {
            id: p.id,
            codigo: p.codigo,
            nombre: p.nombre,
            img: PRUEBA_IMG[p.codigo] || PRUEBA_IMG.DEFAULT,
            done: !!intento,
            intentoId: intento?.id || null,
          };
        });

        const attempts = {};
        list.forEach((t) => {
          if (t.done) attempts[t.codigo] = { intentoId: t.intentoId };
        });

        setTests(list);
        setAttemptsByCode(attempts);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, caso?.id]);

  const abrirDetalle = async (t) => {
    if (!t?.done || !t?.intentoId) return;
    setDetalleTest(t);
    setShowDetalle(true);
    setPuntajes([]);
    setPuntajesLoading(true);
    try {
      const { data } = await supabase
        .from("puntajes")
        .select("escala, puntaje_conv")
        .eq("intento_id", t.intentoId)
        .order("escala");
      setPuntajes(data || []);
    } finally {
      setPuntajesLoading(false);
    }
  };

  const cerrarDetalle = () => {
    setShowDetalle(false);
    setDetalleTest(null);
    setPuntajes([]);
  };

  // --------- Helpers exportación ----------
  const toIndex = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (/^[0-3]$/.test(s)) return Number(s);
    if (/^[1-4]$/.test(s)) return Number(s) - 1;
    if (/^[a-d]$/.test(s)) return s.charCodeAt(0) - 97;
    const m = { nada: 0, poco: 1, algo: 2, mucho: 3, af: 0, lc: 1, pc: 2, mc: 3 };
    if (m.hasOwnProperty(s)) return m[s];
    if (/absolut(a|amente)\s*falso/.test(s)) return 0;
    if (/liger(amente)?/.test(s)) return 1;
    if (/principal(mente)?/.test(s)) return 2;
    if (/muy\s*cierto/.test(s)) return 3;
    return null;
  };

  async function exportarExcelPAI(t, caso) {
    try {
      if (!t?.intentoId) {
        alert("No hay intento para exportar.");
        return;
      }

      // 1) Traer TODAS las respuestas del intento con el orden del ítem
      const { data: rows, error } = await supabase
        .from("respuestas")
        .select(`
          item_id,
          valor,
          items_prueba!inner(orden)
        `)
        .eq("intento_id", t.intentoId)
        .order("orden", { ascending: true, foreignTable: "items_prueba" });

      if (error) throw error;

      // 2) Plantilla
      const resp = await fetch(PAI_TEMPLATE_URL);
      if (!resp.ok) throw new Error("No pude cargar la plantilla del Excel.");
      const ab = await resp.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws =
        wb.Sheets["Hoja de Captura"] ||
        wb.Sheets["Hoja de captura"] ||
        wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("La plantilla no tiene la hoja 'Hoja de Captura'.");

      // 3) Cabecera (opcional)
      if (caso) {
        ws["A1"] = { t: "s", v: caso.paciente_nombre || "" };
        ws["A2"] = { t: "s", v: caso.paciente_ci || "" };
      }

      // 4) Construir índice: número de ítem (col A) → fila exacta
      const idxByItem = new Map(); // itemNo:number -> row:number
      const MAX_SCAN = 2000;       // rango generoso
      for (let r = 1; r <= MAX_SCAN; r++) {
        const cell = ws["A" + r];
        if (!cell || cell.v == null) continue;
        let v = cell.v;
        if (typeof v === "string") v = v.trim();
        const n = parseInt(v, 10);
        if (!Number.isNaN(n)) {
          // guarda solo si es un número de ítem plausible
          if (n >= 1 && n <= 1000 && !idxByItem.has(n)) {
            idxByItem.set(n, r);
          }
        }
      }

      // 5) Escribir "x" por cada respuesta, usando la fila encontrada
      const COLS = ["C", "D", "E", "F"];
      let maxRowTouched = 1;

      rows.forEach((r, i) => {
        const ord = Number(r?.items_prueba?.orden) || (i + 1);
        const row = idxByItem.get(ord); // ← fila real en la plantilla
        if (!row) return;               // si no está, no marcamos (plantilla incompleta)

        // limpia C..F de esa fila antes de marcar
        COLS.forEach((col) => delete ws[`${col}${row}`]);

        const index = toIndex(r.valor);
        if (index != null && index >= 0 && index <= 3) {
          ws[`${COLS[index]}${row}`] = { t: "s", v: "x", w: "x" };
          if (row > maxRowTouched) maxRowTouched = row;
        }
      });

      // 6) Ajustar rango visible de la hoja
      const ref = ws["!ref"] || "A1:H1";
      const m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
      ws["!ref"] = m ? `${m[1]}${m[2]}:${m[3]}${Math.max(maxRowTouched, Number(m[4]) || 1)}`
                     : `A1:H${Math.max(maxRowTouched, 1)}`;

      // 7) Descargar archivo
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const nombre = `PAI_${caso?.paciente_ci || ""}_${t.intentoId.slice(0, 6)}.xlsx`;
      saveAs(blob, nombre);
    } catch (e) {
      console.error(e);
      alert(e.message || "No pude exportar el Excel.");
    }
  }

  return open ? (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
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

        <div className="mr-actions">
          <button
            className={allReady ? "btn-primary mr-btn" : "btn-soft mr-btn mr-btn--disabled"}
            disabled={!allReady}
            onClick={() => setShowPerfil(true)}
            title={allReady ? "Generar perfil" : "Completa PAI + MMPI-2 + MCMI-IV para habilitar"}
          >
            Generar perfil
          </button>
        </div>

        {showDetalle && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) cerrarDetalle();
            }}
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
                    <thead>
                      <tr><th>Escala</th><th>Valor</th></tr>
                    </thead>
                    <tbody>
                      {puntajes.slice(0, 12).map((r, i) => (
                        <tr key={i}><td>{r.escala}</td><td>{String(r.puntaje_conv)}</td></tr>
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
                <button className="btn-soft" onClick={() => alert("Exportar PDF (pendiente)")}>
                  📄 Exportar PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {showPerfil && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) setShowPerfil(false);
            }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Informe final (borrador)</h3>
                <button className="close" onClick={() => setShowPerfil(false)}>✕</button>
              </div>

              <div className="result-body" style={{ display: "block" }}>
                <p className="muted" style={{ marginBottom: 8 }}>
                  Paciente: <strong>{caso?.paciente_nombre}</strong> · CI{" "}
                  <strong>{caso?.paciente_ci || "—"}</strong>
                </p>

                <div className="card" style={{ marginTop: 6 }}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Resumen</p>
                  <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                    <li>PAI: {attemptsByCode["PAI"] ? "completado ✅" : "pendiente"}</li>
                    <li>MMPI-2: {attemptsByCode["MMPI-2"] ? "completado ✅" : "pendiente"}</li>
                    <li>MCMI-IV: {attemptsByCode["MCMI-IV"] ? "completado ✅" : "pendiente"}</li>
                  </ul>
                  <p className="muted" style={{ marginTop: 8 }}>
                    (Aquí irá el perfil generado por IA con formatos y gráficos — pendiente.)
                  </p>
                </div>
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={() => alert("Exportar PDF del informe (pendiente)")}>
                  📄 Exportar informe PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;
}
