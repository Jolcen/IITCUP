import { v4 as uuidv4 } from "uuid";

export function buildAnexoPaths(pacienteId, tipo, filename) {
  const anexoId = uuidv4();
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;

  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  // ✅ sin "anexos/" al inicio
  const base = `pacientes/${pacienteId}/${anexoId}`;

  return {
    anexoId,
    originalPath: `${base}/original/${tipo}-${stamp}.${ext}`,
    thumbPath:    `${base}/preview/thumbnail.jpg`,
    mediumPath:   `${base}/preview/medium.jpg`,
    base,
  };
}
