// src/utils/xlsxExport.js
import * as XLSX from "xlsx";

// Importa las plantillas como URL (Vite resuelve el asset final)
import paiTemplateUrl from "../assets/templates/PAI.xls?url";
import mcmiTemplateUrl from "../assets/templates/MCMI-IV.xlsm?url";

/* -------------- Helpers XLSX -------------- */
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
  const ref = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  for (let r = startRow0; r <= ref.e.r; r++) {
    const cell = getCell(ws, r, ordenColIndex);
    const val = (cell?.v ?? "").toString().trim();
    if (!val) continue;
    if (String(val) === String(ordenBuscado)) return r;
  }
  return -1;
}
const safe = (s) => (s || "").replace(/[\\/:*?"<>|]+/g, "_");

/* -------------- Config de plantillas -------------- */
// PAI: hoja “Hoja de Captura”, ítems desde fila 3 (0-based=2). A=0,B=1,C=2,D=3,E=4,F=5
// raw 0..3 → C..F y se marca con "X".
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

// MCMI-IV: primera hoja, ítems desde fila 13 (0-based=12). A=0, C=2 (Falso), D=3 (Verdadero)
// raw 0..1 → C..D y se marca con "1".
const MCMI_TEMPLATE = {
  sheetName: null,   // primera hoja
  dataStartRow0: 12, // fila 13 1-based
  colOrden: 0,       // A
  colC: 2,           // C (raw 0 → Falso)
  colD: 3,           // D (raw 1 → Verdadero)
  mark: "1",
};

/* -------------- Export PAI -------------- */
/**
 * @param {{ caso?: {paciente_nombre?:string}, intentoId?:string, filas:Array }} args
 * filas: resultado de RPC `api_respuestas_excel_por_intento`, cada item debe traer:
 *   - item_orden (o item_codigo)
 *   - respuesta_json.{raw, opcion_txt|texto} ó respuesta_texto
 */
export async function exportarPAIenPlantilla({ caso, intentoId, filas }) {
  // 1) Carga plantilla
  const buf = await fetch(paiTemplateUrl).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar PAI.xls (${r.status})`);
    return r.arrayBuffer();
  });
  const wb = XLSX.read(buf, { type: "array" });

  // 2) Selecciona hoja
  const sheetName = (PAI_TEMPLATE.sheetName && wb.SheetNames.includes(PAI_TEMPLATE.sheetName))
    ? PAI_TEMPLATE.sheetName
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`No se encontró la hoja "${sheetName}" en PAI.xls`);

  // 3) Marca respuestas
  for (const row of filas || []) {
    const orden = row.item_orden ?? row.item_codigo;
    if (orden == null) continue;

    const r0 = findRowByOrden(ws, PAI_TEMPLATE.colOrden, PAI_TEMPLATE.dataStartRow0, orden);
    if (r0 < 0) continue;

    // raw: 0..3 según tu backend
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
      // Si vino texto libre, lo ponemos en la siguiente columna vacía
      const ref = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
      const lastCol = ref.e.c + 1;
      const txt =
        (row.respuesta_json && (row.respuesta_json.opcion_txt || row.respuesta_json.texto)) ??
        row.respuesta_texto ?? "";
      setCell(ws, r0, lastCol, txt);
      ensureRange(ws, r0, lastCol);
    }
  }

  // 4) Descarga
  const nombre = safe(caso?.paciente_nombre);
  const filename = `PAI_${nombre || "paciente"}_${(intentoId || "").slice(0, 8)}.xls`;
  XLSX.writeFile(wb, filename);
}

/* -------------- Export MCMI-IV -------------- */
export async function exportarMCMIenPlantilla({ caso, intentoId, filas }) {
  const buf = await fetch(mcmiTemplateUrl).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar MCMI-IV.xlsm (${r.status})`);
    return r.arrayBuffer();
  });
  const wb = XLSX.read(buf, { type: "array" });

  const sheetName = (MCMI_TEMPLATE.sheetName && wb.SheetNames.includes(MCMI_TEMPLATE.sheetName))
    ? MCMI_TEMPLATE.sheetName
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`No se encontró la hoja "${sheetName}" en MCMI-IV.xlsm`);

  for (const row of filas || []) {
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

  const nombre = safe(caso?.paciente_nombre);
  const filename = `MCMI-IV_${nombre || "paciente"}_${(intentoId || "").slice(0, 8)}.xlsm`;
  XLSX.writeFile(wb, filename);
}

/* -------------- Export MMPI-2 (sin plantilla) -------------- */
export async function exportarMMPIHoja({ caso, intentoId, filas }) {
  const aoa = [];
  aoa.push([`MMPI-2 - ${caso?.paciente_nombre || ""}`]);
  aoa.push([`Generado: ${new Date().toLocaleString()}`]);
  aoa.push([]);
  aoa.push(["Ítem", "Enunciado", "V", "F"]);

  for (const r of filas || []) {
    const orden = r.item_orden ?? r.item_codigo ?? "";
    const enunciado = r.item_enunciado ?? "";
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

  const nombre = safe(caso?.paciente_nombre);
  const filename = `MMPI-2_${nombre || "paciente"}_${(intentoId || "").slice(0, 8)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
