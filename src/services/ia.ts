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
  explicacion?: {
    metodo: string;
    clase_objetivo: string;
    top_features: TopFeature[];
    // El backend la envía solo si pediste debug: true
    debug?: IaDebug;
  };
};

// Usa la URL de .env y cae a localhost si no está definida
const IA_BASE =
  (import.meta.env.VITE_IA_BASE_URL as string) ?? "http://127.0.0.1:8000";

type InferOpts = {
  explain?: boolean;
  topK?: number;
  debug?: boolean; // para que el backend devuelva vector_raw_dict, alias_map, etc.
  log?: boolean;   // loggea payload y respuesta en consola
};

/**
 * Llama a POST /inferir del servicio de IA.
 * - `features`: diccionario escala->valor (puede usar códigos de tu BD: SOM, 4A, F-r, etc.)
 * - `opts.debug`: si true, el backend devuelve vectores y mapeos para auditar.
 * - `opts.log`: si true, imprime en consola el payload y la respuesta.
 */
export async function inferirIA(
  features: Record<string, number>,
  opts: InferOpts = { explain: true, topK: 5, debug: false, log: false }
): Promise<InferResponse> {
  const payload = {
    features,
    explain: opts.explain ?? true,
    top_k: opts.topK ?? 5,
    debug: opts.debug ?? false,
  };

  if (opts.log) {
    console.log("IA payload ->", payload);
  }

  const res = await fetch(`${IA_BASE}/inferir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include", // por si habilitas CORS con credenciales
  });

  if (!res.ok) {
    const text = await res.text();
    if (opts.log) console.error("IA error ->", res.status, text);
    throw new Error(`IA /inferir ${res.status}: ${text}`);
  }

  const json = (await res.json()) as InferResponse;

  if (opts.log) {
    console.log("IA response ->", json);
  }

  return json;
}

/* 
  Atajos de uso (si te gusta la vieja firma “inferirIA(features, true, 5, true)”):

  export async function inferirIADebug(
    features: Record<string, number>,
  ): Promise<InferResponse> {
    return inferirIA(features, { explain: true, topK: 5, debug: true, log: true });
  }
*/
