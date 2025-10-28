// src/services/ia.js

// 1) Base URL desde .env con fallback local, y sin barras finales
export const IA_BASE = (
  (import.meta?.env?.VITE_IA_BASE_URL ?? "http://127.0.0.1:8000")
)
  .toString()
  .replace(/\/+$/, "");

// Exponer la URL para pruebas desde la consola del navegador:
//   fetch(__IA_BASE + "/health").then(r=>r.json()).then(console.log)
window.__IA_BASE = IA_BASE;

/**
 * Llama al endpoint /inferir del microservicio de IA.
 *
 * @param {Object} features  Mapa escala->valor (ej. { "MCMI_1": 73, "PAI_DEP": 65, ... })
 * @param {Object} opts      Opcionales:
 *   - explain   (boolean)  -> default: false (enfocado en velocidad)
 *   - topK      (number)   -> default: 5 (solo si explain=true)
 *   - debug     (boolean)  -> default: false
 *   - log       (boolean)  -> default: false (imprime payload/respuesta en consola)
 *   - timeoutMs (number)   -> default: 60000
 *
 * @returns {Promise<Object>} { model_version, perfil_clinico, probabilidad, descripcion?, guia?, explicacion? }
 */
export async function inferirIA(
  features,
  opts = {}
) {
  const {
    explain = false,
    topK = 5,
    debug = false,
    log = false,
    timeoutMs = 60000,
  } = opts;

  const payload = {
    features,
    explain: !!explain,
    top_k: Number(topK) || 5,
    debug: !!debug,
  };

  if (log) {
    console.log("IA BASE ->", IA_BASE);
    console.log("IA payload ->", payload);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${IA_BASE}/inferir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      signal: ctrl.signal,
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`IA /inferir ${res.status}: ${text || res.statusText}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`IA /inferir 200 pero JSON inválido: ${text?.slice(0, 200)}...`);
    }

    if (!data || !data.perfil_clinico) {
      throw new Error('Respuesta IA inválida: falta "perfil_clinico".');
    }

    if (log) {
      console.log("IA response ->", data);
      if (data?.explicacion?.debug) {
        const dbg = data.explicacion.debug;
        console.log("DEBUG.missing_numeric:", dbg?.missing_numeric);
        console.log("DEBUG.unknown_inputs:", dbg?.unknown_inputs);
        console.log("DEBUG.used_numeric:", dbg?.used_numeric);
      }
    }

    return data;
  } catch (err) {
    // IMPORTANTE: no tocar err.message (DOMException es read-only)
    if (err?.name === "AbortError") {
      throw new Error(`IA timeout (${timeoutMs}ms).`);
    }
    console.error("inferirIA error:", err);
    throw err;
  } finally {
    clearTimeout(t);
  }
}
