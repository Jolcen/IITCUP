// src/components/ModalResultados.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { inferirIA } from "../services/ia";
import * as XLSX from "xlsx";
import "../styles/ModalResultados.css";

// Plantillas existentes
import paiTemplateUrl from "../assets/templates/PAI.xls?url";
import mcmiTemplateUrl from "../assets/templates/MCMI-IV.xlsm?url";

const PRUEBA_IMG = {
  PAI: "static/images/pai.jpg",
  "MCMI-IV": "static/images/mcmi-iv.jpg",
  "MMPI-2": "static/images/mmpi-2.jpg",
  DEFAULT: "static/images/testP.jpg",
};

/* ===== Helpers XLSX ===== */
function getCell(ws, r, c) {
  const addr = XLSX.utils.encode_cell({ r, c });
  return ws[addr];
}
function setCell(ws, r, c, v) {
  const addr = XLSX.utils.encode_cell({ r, c });
  ws[addr] = { t: typeof v === "number" ? "n" : "s", v };
}
function ensureRange(ws, r, c) {
  const ref = ws["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  if (r > range.e.r) range.e.r = r;
  if (c > range.e.c) range.e.c = c;
  ws["!ref"] = XLSX.utils.encode_range(range);
}
function findRowByOrden(ws, ordenColIndex, startRow0, ordenBuscado) {
  const ref = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = startRow0; r <= ref.e.r; r++) {
    const cell = getCell(ws, r, ordenColIndex);
    const val = (cell?.v ?? "").toString().trim();
    if (!val) continue;
    if (String(val) === String(ordenBuscado)) return r;
  }
  return -1;
}

/* ===== Config de plantillas ===== */
// PAI (ítems desde fila 3, marcar con X según raw 0..3 → C..F)
const PAI_TEMPLATE = {
  sheetName: "Hoja de Captura",
  dataStartRow0: 2,
  colOrden: 0, // A
  colAF: 2,    // C (raw 0)
  colLC: 3,    // D (raw 1)
  colPC: 4,    // E (raw 2)
  colMC: 5,    // F (raw 3)
  mark: "X",
};
// MCMI (ítems desde fila 13, Verdadero/Falso con "1")
const MCMI_TEMPLATE = {
  sheetName: null,   // primera hoja
  dataStartRow0: 12, // fila 13 (1-based)
  colOrden: 0, // A
  colC: 2,     // C (raw 0 → Falso)
  colD: 3,     // D (raw 1 → Verdadero)
  mark: "1",
};

/* ===== Helpers IA/UI ===== */
// Normaliza "aportes" a porcentaje (0..100). Si no hay suma, reparte parejo.
function calcularPorcentajes(topFeaturesRaw = []) {
  const rows = (topFeaturesRaw || []).map((t) => ({
    feature: t.feature ?? t.nombre ?? "",
    valor: t.valor ?? t.value ?? "",
    aporte: Number.isFinite(t.aporte) ? t.aporte : (Number(t.aporte) || 0),
    sentido: t.sentido ?? t.sign ?? null,
  }));
  const total = rows.reduce((acc, r) => acc + Math.abs(r.aporte || 0), 0);
  if (total > 0) {
    return rows.map((r) => ({ ...r, aporte_pct: (Math.abs(r.aporte) * 100) / total }));
  }
  // si todo es 0 o vacío, repartir igual
  const n = rows.length || 1;
  return rows.map((r) => ({ ...r, aporte_pct: 100 / n }));
}

export default function ModalResultados({ open, onClose, caso }) {
  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState([]);

  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleTest, setDetalleTest] = useState(null);
  const [puntajes, setPuntajes] = useState([]);

  const [generando, setGenerando] = useState(false);
  const [perfilIA, setPerfilIA] = useState(null);
  const [perfilGuardado, setPerfilGuardado] = useState(null);

  const [exportando, setExportando] = useState(false);

  // Carga tarjetas y último perfil
  useEffect(() => {
    if (!open || !caso?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: fin, error } = await supabase.rpc(
          "api_pruebas_finalizadas_por_caso",
          { p_caso: caso.id }
        );
        if (error) throw error;

        const list = (fin || []).map((p) => ({
          id: p?.prueba_id || p?.id,
          codigo: p?.codigo,
          nombre: p?.nombre || p?.codigo,
          img: PRUEBA_IMG[p?.codigo] || PRUEBA_IMG.DEFAULT,
          intentoId: p?.intento_id || null,
          terminado_en: p?.terminado_en || null,
        }));
        setTests(list);

        const { data: last, error: e2 } = await supabase
          .from("perfiles_caso")
          .select("id, model_version, perfil_clinico, probabilidad, generated_at, generated_by, insights")
          .eq("caso_id", caso.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!e2) setPerfilGuardado(last || null);
      } catch (e) {
        console.error("carga inicial", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, caso?.id]);

  // Detalle prueba
  async function abrirDetalle(t) {
    if (!t?.intentoId) return;
    setDetalleTest(t);
    setDetalleOpen(true);
    setPuntajes([]);
    try {
      const { data, error } = await supabase.rpc("api_puntajes_por_intento", {
        p_intento_id: t.intentoId,
        p_solo_validos: false,
      });
      if (error) throw error;

      const rows = (data || []).map((r) => ({
        escala: r.escala_codigo,
        nombre: r.escala_nombre ?? r.escala_codigo,
        bruto: r.puntaje_bruto ?? null,
        puntaje: r.puntaje_convertido ?? r.puntaje_t ?? r.puntaje_bruto ?? null,
      }));
      setPuntajes(rows);
    } catch (e) {
      console.error("api_puntajes_por_intento", e);
      setPuntajes([]);
    }
  }
  function cerrarDetalle() {
    setDetalleOpen(false);
    setDetalleTest(null);
    setPuntajes([]);
  }

  // Aliases para features IA
  const ALIAS = {
    "Fp-r": "Fpsi-r",
    "FBS-r": "FVS-r",
    RCd: "CRd",
    RC1: "CR1", RC2: "CR2", RC3: "CR3", RC4: "CR4",
    RC6: "CR6", RC7: "CR7", RC8: "CR8", RC9: "CR9",
    "AE-PI": "AE/PI",
    "AC-PE": "AC/PE",
  };

  async function recolectarFeaturesCaso() {
    const { data: fin, error } = await supabase.rpc(
      "api_pruebas_finalizadas_por_caso",
      { p_caso: caso.id }
    );
    if (error) throw error;

    const intentos = (fin || [])
      .map((p) => ({ codigo: p?.codigo, intentoId: p?.intento_id }))
      .filter((x) => x.intentoId);

    const presentes = new Set(intentos.map((i) => i.codigo));
    const features = {
      tiene_PAI: presentes.has("PAI") ? 1 : 0,
      tiene_MCMI: presentes.has("MCMI-IV") ? 1 : 0,
      tiene_MMPI: presentes.has("MMPI-2") ? 1 : 0,
    };

    for (const it of intentos) {
      const { data, error: e2 } = await supabase.rpc("api_puntajes_por_intento", {
        p_intento_id: it.intentoId,
        p_solo_validos: false,
      });
      if (e2) throw e2;

      const pref =
        it.codigo === "PAI" ? "PAI_" :
        it.codigo === "MCMI-IV" ? "MCMI_" :
        it.codigo === "MMPI-2" ? "MMPI_" : "";

      for (const r of data || []) {
        const rawCode = String(r.escala_codigo || "").trim();
        const fixed = ALIAS[rawCode] ?? rawCode;
        const finalKey = pref ? (pref + fixed) : fixed;

        const val =
          typeof r.puntaje_convertido === "number" ? r.puntaje_convertido :
          typeof r.puntaje_t === "number" ? r.puntaje_t :
          typeof r.puntaje_bruto === "number" ? r.puntaje_bruto : null;

        if (Number.isFinite(val)) {
          features[finalKey] = Number(val);
        }
      }
    }
    return features;
  }

  async function generarPerfilCasoIA() {
    try {
      setGenerando(true);
      const features = await recolectarFeaturesCaso();

      const resp = await inferirIA(features, {
        explain: true, topK: 5, debug: true, log: true,
      });

      const { data: udata, error: eAuth } = await supabase.auth.getUser();
      if (eAuth) throw eAuth;
      const user = udata?.user;
      if (!user?.id) throw new Error("No hay sesión activa. Inicia sesión para generar el perfil IA.");

      const insights = {
        metodo: resp.explicacion?.metodo ?? null,
        clase_objetivo: resp.explicacion?.clase_objetivo ?? resp.perfil_clinico,
        descripcion: resp.descripcion ?? null,
        guia_long: resp.guia?.long ?? null,
        top_features: (resp.explicacion?.top_features ?? []).map(tf => ({
          feature: tf.feature, valor: tf.valor, aporte: tf.aporte, sentido: tf.sentido
        })),
        features_count: Object.keys(features).length,
        probabilidad: resp.probabilidad,
        version: resp.model_version,
      };

      const { data: ins, error: eIns } = await supabase
        .from("perfiles_caso")
        .insert([{
          caso_id: caso.id,
          generated_by: user.id,
          model_version: resp.model_version,
          perfil_clinico: resp.perfil_clinico,
          probabilidad: resp.probabilidad,
          insights,
        }])
        .select()
        .single();

      if (eIns) throw eIns;
      setPerfilGuardado(ins || null);
      setPerfilIA(resp);
    } catch (e) {
      console.error("generarPerfilCasoIA", e);
      alert(e.message ?? e);
    } finally {
      setGenerando(false);
    }
  }

  // Ahora SÍ muestra el perfil guardado sin re-inferir
  async function visualizarPerfilGuardado() {
    try {
      if (!perfilGuardado) {
        // fallback: si no hubiera guardado por alguna razón, re-inferir
        setGenerando(true);
        const features = await recolectarFeaturesCaso();
        const resp = await inferirIA(features, { explain: true, topK: 5, debug: true, log: true });
        setPerfilIA(resp);
        return;
      }

      const ins = perfilGuardado.insights || {};
      const respAdaptado = {
        perfil_clinico: perfilGuardado.perfil_clinico,
        probabilidad: Number(perfilGuardado.probabilidad ?? ins.probabilidad ?? 0),
        descripcion: ins.descripcion ?? null,
        guia: ins.guia_long ? { long: ins.guia_long } : null,
        model_version: perfilGuardado.model_version || ins.version || null,
        explicacion: {
          metodo: ins.metodo || null,
          clase_objetivo: ins.clase_objetivo || perfilGuardado.perfil_clinico,
          top_features: Array.isArray(ins.top_features) ? ins.top_features : [],
        },
      };
      setPerfilIA(respAdaptado);
    } catch (e) {
      console.error("visualizarPerfilGuardado", e);
      alert(e.message ?? e);
    } finally {
      setGenerando(false);
    }
  }

  /* ====== Exportación PAI (marca X) ====== */
  async function exportarPAIenPlantilla() {
    if (!detalleTest?.intentoId) return;
    try {
      setExportando(true);

      const { data, error } = await supabase.rpc("api_respuestas_excel_por_intento", {
        p_intento_id: detalleTest.intentoId,
      });
      if (error) throw error;

      const buf = await fetch(paiTemplateUrl).then((r) => r.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });

      const sheetName =
        (PAI_TEMPLATE.sheetName && wb.SheetNames.includes(PAI_TEMPLATE.sheetName))
          ? PAI_TEMPLATE.sheetName
          : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error(`No se encontró la hoja "${sheetName}" en la plantilla PAI.`);

      for (const row of data || []) {
        const orden = row.item_orden ?? row.item_codigo;
        if (orden == null) continue;

        const r0 = findRowByOrden(ws, PAI_TEMPLATE.colOrden, PAI_TEMPLATE.dataStartRow0, orden);
        if (r0 < 0) continue;

        const raw = (row.respuesta_json && row.respuesta_json.raw !== undefined)
          ? Number(row.respuesta_json.raw)
          : null;

        let c = null;
        if (Number.isFinite(raw)) {
          if (raw === 0) c = PAI_TEMPLATE.colAF;
          else if (raw === 1) c = PAI_TEMPLATE.colLC;
          else if (raw === 2) c = PAI_TEMPLATE.colPC;
          else if (raw === 3) c = PAI_TEMPLATE.colMC;
        }

        if (c != null) {
          setCell(ws, r0, c, PAI_TEMPLATE.mark);
          ensureRange(ws, r0, c);
        } else {
          const ref = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
          const lastCol = ref.e.c + 1;
          const txt =
            (row.respuesta_json && (row.respuesta_json.opcion_txt || row.respuesta_json.texto)) ??
            row.respuesta_texto ?? "";
          setCell(ws, r0, lastCol, txt);
          ensureRange(ws, r0, lastCol);
        }
      }

      const safe = (s) => (s || "").replace(/[\\/:*?"<>|]+/g, "_");
      const filename = `PAI_${safe(caso?.paciente_nombre)}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error("exportarPAIenPlantilla", e);
      alert(e.message ?? e);
    } finally {
      setExportando(false);
    }
  }

  /* ====== Exportación MCMI-IV (marca 1) ====== */
  async function exportarMCMIenPlantilla() {
    if (!detalleTest?.intentoId) return;
    try {
      setExportando(true);

      const { data, error } = await supabase.rpc("api_respuestas_excel_por_intento", {
        p_intento_id: detalleTest.intentoId,
      });
      if (error) throw error;

      const buf = await fetch(mcmiTemplateUrl).then((r) => r.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });

      const sheetName =
        (MCMI_TEMPLATE.sheetName && wb.SheetNames.includes(MCMI_TEMPLATE.sheetName))
          ? MCMI_TEMPLATE.sheetName
          : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error(`No se encontró la hoja "${sheetName}" en la plantilla MCMI.`);

      for (const row of data || []) {
        const orden = row.item_orden ?? row.item_codigo;
        if (orden == null) continue;

        const r0 = findRowByOrden(ws, MCMI_TEMPLATE.colOrden, MCMI_TEMPLATE.dataStartRow0, orden);
        if (r0 < 0) continue;

        const raw = (row.respuesta_json && row.respuesta_json.raw !== undefined)
          ? Number(row.respuesta_json.raw)
          : null;

        let c = null;
        if (Number.isFinite(raw)) {
          if (raw === 0) c = MCMI_TEMPLATE.colC;   // Falso
          else if (raw === 1) c = MCMI_TEMPLATE.colD; // Verdadero
        }

        if (c != null) {
          setCell(ws, r0, c, MCMI_TEMPLATE.mark);
          ensureRange(ws, r0, c);
        } else {
          const ref = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
          const lastCol = ref.e.c + 1;
          const txt =
            (row.respuesta_json && (row.respuesta_json.opcion_txt || row.respuesta_json.texto)) ??
            row.respuesta_texto ?? "";
          setCell(ws, r0, lastCol, txt);
          ensureRange(ws, r0, lastCol);
        }
      }

      const safe = (s) => (s || "").replace(/[\\/:*?"<>|]+/g, "_");
      const filename = `MCMI-IV_${safe(caso?.paciente_nombre)}_${new Date().toISOString().slice(0,10)}.xlsm`;
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error("exportarMCMIenPlantilla", e);
      alert(e.message ?? e);
    } finally {
      setExportando(false);
    }
  }

  /* ====== Exportación MMPI-2 (sin plantilla, hoja generada V/F) ====== */
  async function exportarMMPIHoja() {
    if (!detalleTest?.intentoId) return;
    try {
      setExportando(true);

      const { data, error } = await supabase.rpc("api_respuestas_excel_por_intento", {
        p_intento_id: detalleTest.intentoId,
      });
      if (error) throw error;

      const aoa = [];
      aoa.push([`MMPI-2 - ${caso?.paciente_nombre || ""}`]);
      aoa.push([`Generado: ${new Date().toLocaleString()}`]);
      aoa.push([]);
      aoa.push(["Ítem", "Enunciado", "V", "F"]);

      for (const r of data || []) {
        const orden = r.item_orden ?? r.item_codigo ?? "";
        const enunciado = r.item_enunciado ?? "";
        // raw: 0 -> Falso, 1 -> Verdadero
        const raw = (r.respuesta_json && r.respuesta_json.raw !== undefined)
          ? Number(r.respuesta_json.raw)
          : null;

        const markV = Number.isFinite(raw) && raw === 1 ? "1" : "";
        const markF = Number.isFinite(raw) && raw === 0 ? "1" : "";

        aoa.push([orden, enunciado, markV, markF]);
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 6 }, { wch: 80 }, { wch: 4 }, { wch: 4 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "MMPI-2");

      const safe = (s) => (s || "").replace(/[\\/:*?"<>|]+/g, "_");
      const filename = `MMPI-2_${safe(caso?.paciente_nombre)}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error("exportarMMPIHoja", e);
      alert(e.message ?? e);
    } finally {
      setExportando(false);
    }
  }

  if (!open) return null;

  return (
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
            Paciente: <span className="mr-bold">{caso?.paciente_nombre}</span> · CI{" "}
            <span className="mr-bold">{caso?.paciente_ci || "—"}</span>
          </p>
        )}

        {loading ? (
          <div className="muted mr-pad-12">Cargando…</div>
        ) : tests.length === 0 ? (
          <div className="muted mr-pad-12">No hay pruebas finalizadas para este caso.</div>
        ) : (
          <div className="mr-grid">
            {tests.map((t) => (
              <div
                key={t.id}
                className="mr-card done"
                onClick={() => abrirDetalle(t)}
                role="button"
                title="Ver resultados de esta prueba"
              >
                <span className="mr-badge mr-badge--done">✔ Completada</span>
                <div className="mr-card__imgwrap">
                  <img className="mr-card__img" src={t.img} alt={t.codigo} />
                </div>
                <div className="mr-card__title">{t.nombre}</div>
                {t.terminado_en && (
                  <div className="mr-card__meta">
                    <small>{new Date(t.terminado_en).toLocaleString()}</small>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mr-actions">
          {!perfilGuardado ? (
            <button
              className={`btn-primary mr-btn ${generando ? "mr-btn--disabled" : ""}`}
              onClick={generarPerfilCasoIA}
              disabled={generando}
              title="Llama a la IA y guarda el resultado"
            >
              {generando ? "Generando…" : "Generar perfil IA del caso"}
            </button>
          ) : (
            <button
              className={`btn-primary mr-btn ${generando ? "mr-btn--disabled" : ""}`}
              onClick={visualizarPerfilGuardado}
              disabled={generando}
              title="Solo muestra el perfil IA guardado (no inserta en BD)"
            >
              {generando ? "Abriendo…" : "Visualizar perfil IA"}
            </button>
          )}
        </div>

        {/* ===== Detalle de prueba ===== */}
        {detalleOpen && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) cerrarDetalle();
            }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head mr-detail-head">
                <button className="close mr-detail-close" onClick={cerrarDetalle}>✕</button>
                <h3 className="mr-detail-title">
                  {`Resultados de prueba - ${detalleTest?.codigo || ""}`}
                </h3>
              </div>

              <div className="result-body mr-detail-body">
                {puntajes.length === 0 ? (
                  <div className="muted">Cargando / sin resultados…</div>
                ) : (
                  <table className="table-mini mr-result-table">
                    <thead>
                      <tr>
                        <th>Escala</th>
                        <th>Nombre</th>
                        <th>Bruto</th>
                        <th>Puntaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {puntajes.slice(0, 400).map((r, i) => (
                        <tr key={i}>
                          <td>{r.escala}</td>
                          <td>{r.nombre || "—"}</td>
                          <td>{r.bruto ?? "—"}</td>
                          <td>{r.puntaje ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="result-actions mr-detail-actions">
                {detalleTest?.codigo === "PAI" && (
                  <button
                    className="btn-primary"
                    onClick={exportarPAIenPlantilla}
                    disabled={exportando}
                    title="Rellena la plantilla PAI marcando las respuestas (X)"
                  >
                    {exportando ? "Rellenando…" : "📄 Descargar Excel PAI"}
                  </button>
                )}

                {detalleTest?.codigo === "MCMI-IV" && (
                  <button
                    className="btn-primary"
                    onClick={exportarMCMIenPlantilla}
                    disabled={exportando}
                    title="Rellena la plantilla MCMI-IV marcando las respuestas (1)"
                    style={{ marginLeft: 8 }}
                  >
                    {exportando ? "Rellenando…" : "📄 Descargar Excel MCMI-IV"}
                  </button>
                )}

                {detalleTest?.codigo === "MMPI-2" && (
                  <button
                    className="btn-primary"
                    onClick={exportarMMPIHoja}
                    disabled={exportando}
                    title="Genera hoja MMPI-2 (V/F) y marca respuestas (1)"
                    style={{ marginLeft: 8 }}
                  >
                    {exportando ? "Generando…" : "📄 Descargar Excel MMPI-2"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== Perfil IA ===== */}
        {perfilIA && (
          <div
            className="modal-overlay nested"
            onMouseDown={(e) => {
              if (e.target.classList.contains("modal-overlay")) setPerfilIA(null);
            }}
          >
            <div className="modal result-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Perfil IA</h3>
                <button className="close" onClick={() => setPerfilIA(null)}>✕</button>
              </div>

              <div className="result-body perfil-wrap">
                <div className="perfil-hero">
                  <span className="perfil-chip">{perfilIA.perfil_clinico}</span>
                  <div className="conf-badge">
                    Confianza: {Number.isFinite(perfilIA.probabilidad) ? (perfilIA.probabilidad * 100).toFixed(1) : "—"}%
                  </div>
                </div>

                {(perfilIA.descripcion || perfilIA.guia?.long) && (
                  <div style={{ marginTop: 8 }}>
                    {perfilIA.descripcion && (
                      <p className="perfil-desc" style={{ color: "#6b7280", marginBottom: 6 }}>
                        {perfilIA.descripcion}
                      </p>
                    )}
                    {perfilIA.guia?.long && (
                      <details className="perfil-long">
                        <summary style={{ cursor: "pointer", color: "#2563eb" }}>
                          Ver explicación
                        </summary>
                        <p style={{ marginTop: 6, color: "#374151" }}>
                          {perfilIA.guia.long}
                        </p>
                      </details>
                    )}
                  </div>
                )}

                <h5 className="perfil-subtitle" style={{ marginTop: 12 }}>Escalas que más aportaron</h5>

                {(() => {
                  const top = calcularPorcentajes(perfilIA.explicacion?.top_features || []);
                  return (
                    <table className="table-mini mr-result-table perfil-table">
                      <thead>
                        <tr>
                          <th>Escala</th>
                          <th>Valor</th>
                          <th>Aporte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((tf, i) => (
                          <tr key={i}>
                            <td>{tf.feature}</td>
                            <td>{tf.valor}</td>
                            <td>
                              <div className="aporte-row">
                                <div className="aporte-bar" aria-label="aporte relativo">
                                  <div
                                    className="aporte-fill"
                                    style={{ width: `${Math.max(2, Math.min(100, tf.aporte_pct))}%` }}
                                  />
                                </div>
                                <div className="aporte-pct">
                                  {tf.aporte_pct.toFixed(1)}%
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              <div className="result-actions">
                <button className="btn-soft" onClick={() => setPerfilIA(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
