# backend/app_scoring.py
import os
import json
import datetime as dt
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

# ====== Config básica ======
from dotenv import load_dotenv
load_dotenv()  # lee backend/.env

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # service role
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Faltan SUPABASE_URL / SUPABASE_KEY en backend/.env")

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Scoring Psicológico (MMPI/PAI/MCMI)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"  # en dev, cómodo; en prod, restrínge
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====== Archivos auxiliares (orden de features / min-max) ======
HERE = os.path.dirname(__file__)
FEATURES_PATH = os.path.join(HERE, "features_order.json")
SCALER_PATH   = os.path.join(HERE, "scaler_minmax.json")

try:
    with open(FEATURES_PATH, "r", encoding="utf-8") as f:
        ORDERED_FEATURES: List[str] = json.load(f)
except Exception:
    ORDERED_FEATURES = []
    print("[WARN] No se pudo cargar features_order.json")

try:
    with open(SCALER_PATH, "r", encoding="utf-8") as f:
        SCALER: Dict[str, Dict[str, float]] = json.load(f)  # {"Escala":{"min":..,"max":..}}
except Exception:
    SCALER = {}
    print("[WARN] No se pudo cargar scaler_minmax.json")

# ====== Modelo Keras para /predict-case ======
DEFAULT_MODEL_FILENAME = "modelo_ia normalizado.h5"
MODEL_PATH = os.getenv("MODEL_PATH") or os.path.join(HERE, DEFAULT_MODEL_FILENAME)

model = None
try:
    import tensorflow as tf
    model = tf.keras.models.load_model(MODEL_PATH)
    print("[INFO] Modelo cargado:", MODEL_PATH)
except Exception as e:
    print("[WARN] No se cargó el modelo:", e, "- /predict-case dará 500 hasta que exista.")

LABELS = ["Bajo", "Medio", "Alto"]  # ajusta al orden real de tu entrenamiento
REQUERIDAS = ["PAI", "MMPI-2", "MCMI-IV"]  # códigos en tu tabla 'pruebas'

# ====== Helpers de negocio ======
def age_band(fecha_nacimiento: Optional[str]) -> str:
    """Mapea fecha de nacimiento a banda de edad usada en normativas."""
    try:
        y = dt.date.fromisoformat(str(fecha_nacimiento)).year
        age = dt.date.today().year - y
    except Exception:
        return "18-34"
    if age < 35: return "18-34"
    if age < 55: return "35-54"
    return "55+"

def clip01(x: Optional[float], vmin: Optional[float], vmax: Optional[float]) -> float:
    if x is None or vmin is None or vmax is None or vmin == vmax:
        return 0.5
    z = (float(x) - float(vmin)) / (float(vmax) - float(vmin))
    return float(max(0.0, min(1.0, z)))

# nombres exactos de tus columnas en 'puntajes'
PUNTAJE_CONV_COL = os.getenv("PUNTAJE_CONV_COL", "puntaje_convertido")
NORMATIVA_VER_COL = os.getenv("NORMATIVA_VER_COL", "normativa_version")

# ====== Entrada de /score y /predict-case ======
class ScoreIn(BaseModel):
    intento_id: Optional[str] = None
    caso_id:   Optional[str] = None
    prueba_id: Optional[str] = None

class PredictCaseIn(BaseModel):
    caso_id: str

# ====== Lectura de datos ======
def pick_intento(intento_id: Optional[str], caso_id: Optional[str], prueba_id: Optional[str]) -> dict:
    """Devuelve el intento a procesar. Preferimos intento_id explícito."""
    if intento_id:
        r = sb.table("intentos_prueba").select("*").eq("id", intento_id).single().execute()
        if not r.data:
            raise HTTPException(404, "intento_id no encontrado")
        return r.data
    if not (caso_id and prueba_id):
        raise HTTPException(400, "Provee intento_id o (caso_id + prueba_id)")
    r = (sb.table("intentos_prueba")
           .select("*")
           .eq("caso_id", caso_id)
           .eq("prueba_id", prueba_id)
           .order("empezado_en", desc=True)
           .limit(1)
           .execute())
    if not r.data:
        raise HTTPException(404, "No hay intentos para ese caso/prueba")
    return r.data[0]

def get_caso(caso_id: str) -> dict:
    r = sb.table("casos").select("id, fecha_nacimiento, genero").eq("id", caso_id).single().execute()
    if not r.data:
        raise HTTPException(404, "caso no encontrado")
    return r.data

def read_respuestas(intento_id: str) -> Dict[str, str]:
    r = sb.table("respuestas").select("item_id, valor").eq("intento_id", intento_id).execute()
    rows = r.data or []
    return {row["item_id"]: row["valor"] for row in rows}

def load_claves(prueba_id: str) -> Dict[str, List[dict]]:
    """
    Espera 'claves_escalas' con columnas:
      prueba_id, escala, item_id, peso, invertido, tipo_respuesta ('VF'|'LIKERT'|'NUM'), likert_max
    """
    r = (sb.table("claves_escalas")
           .select("escala,item_id,peso,invertido,tipo_respuesta,likert_max")
           .eq("prueba_id", prueba_id)
           .execute())
    claves: Dict[str, List[dict]] = {}
    for row in r.data or []:
        claves.setdefault(row["escala"], []).append(row)
    if not claves:
        raise HTTPException(404, "No hay claves_escalas para esa prueba")
    return claves

def recode(valor, tipo: str):
    if valor is None: return None
    v = str(valor).strip()
    t = (tipo or "VF").upper()
    if t == "VF":
        return 1.0 if v.upper() in ("V","T","TRUE","SI","SÍ","1") else 0.0
    if t == "LIKERT":
        try: return float(v)
        except: return None
    if t == "NUM":
        try: return float(v)
        except: return None
    return None

def compute_raw_scores(claves: Dict[str, List[dict]], respuestas: Dict[str, str]) -> Dict[str, Optional[float]]:
    """
    Suma ponderada por escala. Maneja invertidos (VF y LIKERT).
    """
    raw: Dict[str, Optional[float]] = {}
    for escala, items in claves.items():
        s = 0.0; n = 0
        # si hay LIKERT, usamos el max declarado
        likert_max = 1.0
        for it in items:
            lm = it.get("likert_max")
            if lm is not None:
                try: likert_max = max(likert_max, float(lm))
                except: pass
        for it in items:
            item_id = it["item_id"]
            tipo    = it.get("tipo_respuesta","VF")
            w       = float(it.get("peso", 1.0) or 1.0)
            inv     = bool(it.get("invertido", False))
            v = recode(respuestas.get(item_id), tipo)
            if v is None:
                continue
            if inv:
                v = (likert_max - v) if tipo.upper()=="LIKERT" else (1.0 - v)
            s += w * v
            n += 1
        raw[escala] = s if n>0 else None
    return raw

def load_normas(prueba_id: str, genero: str, banda: str) -> Dict[str, Dict[int, float]]:
    """
    Espera 'normativas' con columnas:
      prueba_id, escala, genero, banda_edad, raw(int), std(num)
    """
    r = (sb.table("normativas")
           .select("escala, raw, std")
           .eq("prueba_id", prueba_id)
           .eq("genero", genero)
           .eq("banda_edad", banda)
           .execute())
    norm: Dict[str, Dict[int,float]] = {}
    for row in r.data or []:
        esc = row["escala"]
        norm.setdefault(esc, {})[int(row["raw"])] = float(row["std"])
    return norm

def standardize_raw_to_std(raw: Dict[str, Optional[float]], normas: Dict[str, Dict[int,float]]) -> Dict[str, Optional[float]]:
    """
    raw -> T/BR con lookup (redondea raw a entero). Si no hay norma, deja raw como fallback.
    """
    std: Dict[str, Optional[float]] = {}
    for escala, val in raw.items():
        if val is None:
            std[escala] = None
            continue
        lookup = normas.get(escala, {})
        rint = int(round(val))
        std[escala] = lookup.get(rint, float(val))
    return std

# ====== Guardado en 'puntajes' ======
def save_puntajes(
    intento: dict,
    raw: Dict[str, Optional[float]],
    std: Dict[str, Optional[float]],
    normativa_version: str = "v1",
    norm01: Optional[Dict[str, Optional[float]]] = None
):
    """
    Inserta/actualiza 1 fila por escala. Usa tus nombres reales:
      - puntaje_bruto (int4)  -> guardamos round(raw)
      - {PUNTAJE_CONV_COL}    (numeric)
      - {NORMATIVA_VER_COL}   (text)
      - intento_id (uuid)
      - valor_01 (numeric)
    Índice único recomendado: (intento_id, escala)
    """
    rows = []
    for escala, v_raw in raw.items():
        row = {
            "caso_id": intento["caso_id"],
            "prueba_id": intento["prueba_id"],
            "intento_id": intento["id"],
            "escala": escala,
            "puntaje_bruto": None if v_raw is None else int(round(v_raw)),
            NORMATIVA_VER_COL: normativa_version,
            "valor_01": None if norm01 is None else norm01.get(escala),
        }
        row[PUNTAJE_CONV_COL] = std.get(escala)
        rows.append(row)
    sb.table("puntajes").upsert(rows, on_conflict="intento_id,escala").execute()

# ====== Endpoints ======
@app.get("/ping")
def ping():
    return {"ok": True}

@app.post("/score")
def score(payload: ScoreIn):
    """
    PASO 1: leer respuestas
    PASO 2: calcular escalas (raw -> T/BR)
    PASO 3: normalizar a 0–1
    PASO 4: guardar en 'puntajes'
    """
    intento = pick_intento(payload.intento_id, payload.caso_id, payload.prueba_id)
    caso    = get_caso(intento["caso_id"])

    respuestas = read_respuestas(intento["id"])
    if not respuestas:
        raise HTTPException(400, "El intento no tiene respuestas")

    claves = load_claves(intento["prueba_id"])
    raw    = compute_raw_scores(claves, respuestas)

    normas = load_normas(intento["prueba_id"], (caso.get("genero") or "U"), age_band(caso.get("fecha_nacimiento")))
    std    = standardize_raw_to_std(raw, normas)

    # normalización 0–1 con SCALER (si no hay min/max, 0.5)
    norm01: Dict[str, Optional[float]] = {}
    for escala, v in std.items():
        if v is None:
            norm01[escala] = None
        elif escala in SCALER:
            norm01[escala] = clip01(v, SCALER[escala].get("min"), SCALER[escala].get("max"))
        else:
            norm01[escala] = 0.5

    save_puntajes(intento, raw, std, normativa_version="v1", norm01=norm01)

    resumen = []
    for k in sorted(raw.keys()):
        resumen.append({"escala": k, "raw": raw[k], "std": std[k], "norm01": norm01[k]})
    return {
        "ok": True,
        "intento_id": intento["id"],
        "caso_id": intento["caso_id"],
        "prueba_id": intento["prueba_id"],
        "n_escalas": len(resumen),
        "resumen": resumen
    }

def get_last_completed_intento_id(caso_id: str, prueba_id: str) -> Optional[str]:
    r = (sb.table("intentos_prueba")
           .select("id, terminado_en")
           .eq("caso_id", caso_id)
           .eq("prueba_id", prueba_id)
           .not_("terminado_en", "is", None)
           .order("terminado_en", desc=True, nulls_last=True)
           .limit(1)
           .execute())
    rows = r.data or []
    return rows[0]["id"] if rows else None

def read_puntajes_por_intento(intento_id: str) -> Dict[str, Dict[str, Optional[float]]]:
    r = (sb.table("puntajes")
           .select(f"escala, valor_01, {PUNTAJE_CONV_COL}")
           .eq("intento_id", intento_id)
           .execute())
    out = {}
    for row in r.data or []:
        out[row["escala"]] = {
            "valor_01": row.get("valor_01"),
            "puntaje_conv": row.get(PUNTAJE_CONV_COL),
        }
    return out

@app.post("/predict-case")
def predict_case(payload: PredictCaseIn):
    """
    Junta PAI+MMPI-2+MCMI-IV (últimos intentos del caso) → arma vector en ORDERED_FEATURES → predice con el .h5
    """
    if model is None:
        raise HTTPException(500, "Modelo no cargado. Define MODEL_PATH o coloca el .h5 en backend/")

    # mapa codigo->prueba_id
    r = sb.table("pruebas").select("id, codigo").in_("codigo", REQUERIDAS).execute()
    code_to_prueba = {row["codigo"]: row["id"] for row in (r.data or [])}
    faltan = [c for c in REQUERIDAS if c not in code_to_prueba]
    if faltan:
        raise HTTPException(400, f"Faltan en 'pruebas' los códigos: {faltan}")

    # último intento completado por prueba
    intentos_por_codigo: Dict[str, str] = {}
    for code in REQUERIDAS:
        pid = code_to_prueba[code]
        intento_id = get_last_completed_intento_id(payload.caso_id, pid)
        if not intento_id:
            raise HTTPException(400, f"No hay intento completado para {code}")
        intentos_por_codigo[code] = intento_id

    # leer puntajes de cada intento; si no hay filas, intentar calcular on-the-fly
    norm01: Dict[str, float] = {}
    for code, intento_id in intentos_por_codigo.items():
        pmap = read_puntajes_por_intento(intento_id)
        if not pmap:
            # fuerza cálculo si aún no está
            score(ScoreIn(intento_id=intento_id))
            pmap = read_puntajes_por_intento(intento_id)
        for escala, vals in pmap.items():
            if escala in norm01:
                continue  # evita colisiones si existen nombres repetidos entre pruebas
            v01 = vals.get("valor_01")
            if v01 is None:
                std = vals.get("puntaje_conv")
                if std is not None and escala in SCALER:
                    v01 = clip01(std, SCALER[escala].get("min"), SCALER[escala].get("max"))
                else:
                    v01 = 0.5
            norm01[escala] = float(v01)

    # arma vector en el orden exacto
    x = []
    faltantes = []
    for feat in ORDERED_FEATURES:
        if feat in norm01:
            x.append(float(norm01[feat]))
        else:
            x.append(0.5)
            faltantes.append(feat)
    X = np.array(x, dtype=np.float32).reshape(1, -1)

    # predicción
    probs = model.predict(X, verbose=0).flatten().tolist()
    idx = int(np.argmax(probs))
    label = LABELS[idx] if idx < len(LABELS) else f"clase_{idx}"

    # opcional: guardar en ai_predictions
    try:
        sb.table("ai_predictions").insert({
            "patient_id": payload.caso_id,
            "evaluation_id": list(intentos_por_codigo.values())[0],
            "task": "riesgo_reincidencia",
            "predicted_label": label,
            "probabilities": json.dumps({LABELS[i]: float(p) for i, p in enumerate(probs)}),
            "model_version": os.path.basename(MODEL_PATH),
        }).execute()
    except Exception:
        pass

    return {
        "label": label,
        "probs": {LABELS[i]: probs[i] for i in range(len(LABELS))},
        "used_attempts": intentos_por_codigo,
        "missing_features": faltantes,
    }
