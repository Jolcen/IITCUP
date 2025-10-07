// src/services/ia.ts

export type TopFeature = {
  feature: string;
  valor: number;
  aporte: number;
  sentido: "↑" | "↓";
};

export type IaDebug = {
  alias_map: Record<string, string>;
  used_numeric: string[];
  missing_numeric: string[];
  flags: Record<string, number>;
  unknown_inputs: string[];
  vector_raw_dict: Record<string, number>;
  vector_scaled_65: number[];
};

export type InferResponse = {
  model_version: string;
  perfil_clinico: string;
  probabilidad: number;

  /** NUEVO: texto corto con significado del perfil */
  descripcion?: string;

  /** NUEVO: campo con explicación larga */
  guia?: {
    long?: string;
  };

  explicacion?: {
    metodo: string;
    clase_objetivo: string;
    top_features: TopFeature[];
    debug?: IaDebug; // solo si debug=true
  };
};

// 1) Base URL desde .env con fallback local, y sin barras finales
export const IA_BASE = (
  (import.meta as any)?.env?.VITE_IA_BASE_URL ?? "http://127.0.0.1:8000"
)
  .toString()
  .replace(/\/+$/, "");

// 2) Exponer URL para probar desde consola del navegador
//    -> en Console puedes hacer:  fetch(__IA_BASE + "/health").then(r=>r.text()).then(console.log)
;(window as any).__IA_BASE = IA_BASE;

type InferOpts = {
  explain?: boolean;
  topK?: number;
  debug?: boolean;   // para que el backend devuelva vectores/mapeos
  log?: boolean;     // loggea payload y respuesta en consola
  timeoutMs?: number; // default 20s
};

/**
 * Llama a POST /inferir del servicio de IA.
 * - `features`: diccionario escala->valor (usa las claves que espera el modelo)
 * - `opts.debug`: si true, el backend devuelve vector_raw_dict, alias_map, etc.
 * - `opts.log`: si true, imprime payload y respuesta.
 */
export async function inferirIA(
  features: Record<string, number>,
  opts: InferOpts = {
    explain: true,
    topK: 5,
    debug: false,
    log: false,
    timeoutMs: 20000,
  }
): Promise<InferResponse> {
  const payload = {
    features,
    explain: opts.explain ?? true,
    top_k: opts.topK ?? 5,
    debug: opts.debug ?? false,
  };

  if (opts.log) {
    console.log("IA BASE ->", IA_BASE);
    console.log("IA payload ->", payload);
  }

  // Timeout y mejor manejo de errores
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);

  try {
    const res = await fetch(`${IA_BASE}/inferir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Durante pruebas evita credenciales (CORS estricto suele bloquear).
      // Si luego necesitas sesión/cookies, cambia a "include" y ajusta CORS en el backend.
      credentials: "omit",
      signal: ctrl.signal,
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`IA /inferir ${res.status}: ${text || res.statusText}`);
    }

    let data: InferResponse;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `IA /inferir 200 pero JSON inválido: ${text?.slice(0, 200)}...`
      );
    }

    if (!data?.perfil_clinico) {
      throw new Error('Respuesta IA inválida: falta "perfil_clinico".');
    }

    if (opts.log) {
      console.log("IA response ->", data);
      // si hay debug desde el backend
      if ((data as any)?.explicacion?.debug) {
        const dbg = (data as any).explicacion.debug as IaDebug;
        console.log("DEBUG.missing_numeric:", dbg.missing_numeric);
        console.log("DEBUG.unknown_inputs:", dbg.unknown_inputs);
        console.log("DEBUG.used_numeric:", dbg.used_numeric);
      }
    }

    return data;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      err.message = `IA timeout (${opts.timeoutMs ?? 20000}ms).`;
    }
    console.error("inferirIA error:", err);
    throw err;
  } finally {
    clearTimeout(to);
  }
}

/** Atajo para debug detallado */
export async function inferirIADebug(
  features: Record<string, number>
): Promise<InferResponse> {
  return inferirIA(features, {
    explain: true,
    topK: 5,
    debug: true,
    log: true,
  });
}
