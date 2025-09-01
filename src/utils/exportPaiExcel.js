// src/utils/exportPaiExcel.js
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
// 👇 Vite devuelve la URL final del asset (no necesitas renombrar el archivo)
import plantillaUrl from "../assets/templates/Hoja-de-calculo-para-PAI-vacio.xlsx?url";

/**
 * Exporta a Excel para PAI llenando la hoja "Hoja de Captura"
 * con las respuestas del intento.
 *
 * @param {Object} params
 * @param {string} params.intentoId
 * @param {Object} params.caso            // {paciente_nombre, paciente_ci}
 * @param {Array<{item_id:string, valor:string|number}>} params.respuestas
 * @param {Object} [params.opciones]
 * @param {number} [params.opciones.START_ROW=8]  // fila donde empieza el primer ítem (1-based)
 * @param {string} [params.opciones.ANSWER_COL="C"] // columna de respuestas
 */
export async function exportPaiExcel({ intentoId, caso, respuestas, opciones = {} }) {
  // 1) Descarga la plantilla (funciona en dev/prod y con base path)
  const r = await fetch(plantillaUrl);
  if (!r.ok) throw new Error(`No se pudo cargar la plantilla (${r.status}).`);
  const ab = await r.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });

  // 2) Toma la hoja donde se capturan respuestas
  const ws = wb.Sheets["Hoja de Captura"];
  if (!ws) throw new Error("La plantilla no tiene la hoja 'Hoja de Captura'.");

  // Configurables según tu plantilla
  const START_ROW = opciones.START_ROW ?? 8;     // primera fila real de respuestas
  const ANSWER_COL = opciones.ANSWER_COL ?? "C"; // columna de respuestas

  // 3) Normaliza respuestas a número (ajusta si usas otra codificación)
  const mapTexto = new Map([
    ["Nada", 0],
    ["Poco", 1],
    ["Algo", 2],
    ["Mucho", 3],
  ]);

  const toNum = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    const t = String(v).trim();
    if (mapTexto.has(t)) return mapTexto.get(t);
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  // 4) Escribe una respuesta por fila (si tu plantilla lleva otro offset, ajusta START_ROW)
  respuestas.forEach((r, idx) => {
    const row = START_ROW + idx; // fila 8 = item1, 9 = item2, ...
    const adr = `${ANSWER_COL}${row}`;
    const val = toNum(r.valor);
    if (val != null) {
      ws[adr] = { t: "n", v: val }; // numérico
    } else {
      ws[adr] = { t: "s", v: String(r.valor ?? "") }; // texto si no mapeó
    }
  });

  // (Opcional) Escribe encabezados con datos del paciente si tu plantilla los tiene
  // Ejemplo: ws["C4"] = { t:"s", v: caso?.paciente_nombre || "" };

  // 5) Genera y descarga
  const nombre = (caso?.paciente_nombre || "paciente").replace(/[\\/:*?"<>|]+/g, "_");
  const fileName = `PAI_${nombre}_${(intentoId || "").slice(0, 8)}.xlsx`;

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, fileName);
}
