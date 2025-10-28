import os, json, time
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import joblib
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import tensorflow as tf
from tensorflow import keras

# ==========================
# Utilidades
# ==========================
def safe_load_json(path: str) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def resolve_labels_meta_path() -> str:
    """
    Busca labels_meta.json en ubicaciones razonables.
    Prioridad: ENV -> ./ia/labels_meta.json -> ./labels_meta.json -> ./modelos/labels_meta.json
               + rutas relativas al directorio de este archivo.
    """
    candidates: List[Path] = []
    envp = os.getenv("LABELS_META_PATH")
    if envp:
        candidates.append(Path(envp))

    candidates += [
        Path("ia/labels_meta.json"),
        Path("labels_meta.json"),
        Path("modelos/labels_meta.json"),
    ]
    here = Path(__file__).resolve().parent
    candidates += [
        here / "ia" / "labels_meta.json",
        here / "labels_meta.json",
        here / "modelos" / "labels_meta.json",
    ]
    for p in candidates:
        try:
            if p.exists():
                return str(p.resolve())
        except Exception:
            continue
    return ""

# ==========================
# Carga de artefactos
# ==========================
load_dotenv()

MODEL_PATH        = os.getenv("MODEL_PATH", "mlp_final.h5")
LABELS_PATH       = os.getenv("LABELS_PATH", "labels.json")
NUMERIC_COLS_PATH = os.getenv("NUMERIC_COLS_PATH", "numeric_cols.json")
FLAGS_PATH        = os.getenv("FLAGS_PATH", "flags_order.json")         # si no tienes este archivo, no lo uses
FEATURES_PATH     = os.getenv("FEATURES_PATH", "features_order.json")
SCALER_PATH       = os.getenv("SCALER_PATH", "scaler_numeric.pkl")
BASELINE_PATH     = os.getenv("BASELINE_PATH", "baseline_mean.npy")
MODEL_VERSION     = os.getenv("MODEL_VERSION", "nn_v1")

LABELS_META_PATH  = os.getenv("LABELS_META_PATH") or resolve_labels_meta_path()

# Modelo
model = keras.models.load_model(MODEL_PATH, compile=False)

# Listas
LABELS: List[str]        = safe_load_json(LABELS_PATH)
NUMERIC_COLS: List[str]  = safe_load_json(NUMERIC_COLS_PATH)            # p.ej. 62
FEATURES_ORDER: List[str]= safe_load_json(FEATURES_PATH)                # p.ej. 65
# Si no usas flags_order.json explícito, deducimos flags por diferencia:
n_num = len(NUMERIC_COLS)
n_in  = len(FEATURES_ORDER)
n_flag = n_in - n_num
FLAGS_ORDER: List[str] = FEATURES_ORDER[-n_flag:] if n_flag > 0 else []

# Meta etiquetas opcional
if LABELS_META_PATH and Path(LABELS_META_PATH).exists():
    LABELS_META: Dict[str, Dict[str, str]] = safe_load_json(LABELS_META_PATH)
else:
    LABELS_META = {}

# Scaler y baseline
scaler = joblib.load(SCALER_PATH)  # StandardScaler sobre numéricas
baseline_raw = np.load(BASELINE_PATH).astype(np.float32)  # shape (n_in,)

assert len(baseline_raw) == n_in, "baseline_mean.npy debe tener longitud n_in (features_order)."
assert n_in == (n_num + n_flag), "Dimensiones inconsistentes entre features y numéricas/flags."

# ==========================
# Alias de códigos
# ==========================
PAI_CODES  = {"SOM","ANS","TRA","DEP","MAN","PAR","ESQ","LIM","ANT","ALC","DRG","AGR","SUI","EST","FAS","RTR","DOM","AFA"}
MCMI_CODES = {"1","2A","2B","3","4A","4B","5","6A","6B","7","8A","8B","S","C","P","A","H","N","D","B","T","R","SS","CC","PP"}
MMPI_CODES = {"F-r","Fpsi-r","Fs","FVS-r","SI","L-r","K-r","AE/PI","AP","AC/PE","CRd","CR1","CR2","CR3","CR4","CR5","CR6","CR7","CR8","CR9"}
PREFIXES   = ("PAI_","MCMI_","MMPI_")

def alias_key(k: str) -> str:
    if not k: return k
    if k.startswith(PREFIXES): return k
    if k in PAI_CODES:  return f"PAI_{k}"
    if k in MCMI_CODES: return f"MCMI_{k}"
    if k in MMPI_CODES: return f"MMPI_{k}"
    return k

def normalize_scores(raw: Dict[str, float]) -> Tuple[Dict[str, float], Dict[str, str]]:
    norm: Dict[str, float] = {}
    alias_map: Dict[str, str] = {}
    for k, v in (raw or {}).items():
        nk = alias_key(k)
        alias_map[k] = nk
        try:
            fv = float(v)
        except Exception:
            continue
        norm[nk] = fv
    return norm, alias_map

def compute_flags_from_keys(keys: List[str]) -> Dict[str, int]:
    has_pai  = any(k.startswith("PAI_")  for k in keys)
    has_mcmi = any(k.startswith("MCMI_") for k in keys)
    has_mmpi = any(k.startswith("MMPI_") for k in keys)
    out = {}
    if "tiene_PAI"  in FLAGS_ORDER: out["tiene_PAI"]  = int(has_pai)
    if "tiene_MCMI" in FLAGS_ORDER: out["tiene_MCMI"] = int(has_mcmi)
    if "tiene_MMPI" in FLAGS_ORDER: out["tiene_MMPI"] = int(has_mmpi)
    return out

def build_input_vector(raw_scores: Dict[str, float]) -> Tuple[np.ndarray, np.ndarray, Dict]:
    scores, alias_map = normalize_scores(raw_scores)
    flags_auto = compute_flags_from_keys(list(scores.keys()))

    x_num = np.zeros((n_num,), dtype=np.float32)
    used_numeric, missing_numeric = [], []
    for i, col in enumerate(NUMERIC_COLS):
        if col in scores:
            x_num[i] = float(scores[col]); used_numeric.append(col)
        else:
            x_num[i] = float(baseline_raw[i]); missing_numeric.append(col)

    # Escalamiento SOLO numéricas
    x_num_scaled = scaler.transform(x_num.reshape(1, -1)).astype(np.float32)   # (1,n_num)

    # Flags
    x_flags = np.zeros((1, n_flag), dtype=np.float32)
    for j, f in enumerate(FLAGS_ORDER):
        x_flags[0, j] = float(flags_auto.get(f, 0))

    # Vectores final
    x_raw   = np.concatenate([x_num.reshape(1, -1), x_flags], axis=1)          # (1,n_in)
    x_model = np.concatenate([x_num_scaled,         x_flags], axis=1)          # (1,n_in)

    debug = {
        "alias_map": alias_map,
        "used_numeric": used_numeric,
        "missing_numeric": missing_numeric,
        "flags": {f: int(x_flags[0, j]) for j, f in enumerate(FLAGS_ORDER)},
        "unknown_inputs": [k for k in scores.keys() if (k not in set(NUMERIC_COLS) and k not in set(FLAGS_ORDER))],
        "vector_raw_dict": {FEATURES_ORDER[i]: float(x_raw[0, i]) for i in range(n_in)},
        "vector_scaled_65": [float(v) for v in x_model[0]],
    }
    return x_model.astype(np.float32), x_raw.astype(np.float32), debug

# ==========================
# Integrated Gradients (para explicaciones)
# ==========================
def scale_numeric_then_concat(raw65: np.ndarray) -> np.ndarray:
    x_num = raw65[:n_num].reshape(1, -1)
    x_num_scaled = scaler.transform(x_num).astype(np.float32)[0]
    x_flags = raw65[n_num:]
    return np.concatenate([x_num_scaled, x_flags], axis=0).astype(np.float32)

baseline_scaled = scale_numeric_then_concat(baseline_raw)  # (n_in,)

@tf.function
def _grads(inputs, target_index):
    with tf.GradientTape() as tape:
        tape.watch(inputs)
        preds = model(inputs, training=False)
        pred_t = preds[:, int(target_index)]
    return tape.gradient(pred_t, inputs)

def integrated_gradients(x_scaled: np.ndarray, target_index: int, steps: int = 64) -> np.ndarray:
    alphas = tf.linspace(0.0, 1.0, steps + 1)
    base = tf.convert_to_tensor(baseline_scaled.reshape(1, -1))
    x    = tf.convert_to_tensor(x_scaled.reshape(1, -1))
    total = tf.zeros_like(x, dtype=tf.float32)
    for a in alphas:
        interp = base + a * (x - base)
        g = _grads(interp, target_index)
        total += g
    avg = total / float(steps + 1)
    atts = (x - base) * avg
    return atts.numpy()[0]  # (n_in,)

# ==========================
# FastAPI + CORS
# ==========================
class InferRequest(BaseModel):
    features: Dict[str, float] = Field(..., description="Mapa escala->valor (T/BR). Puede usar códigos de BD.")
    explain: bool = True
    top_k: int = 5
    debug: bool = False

class TopFeature(BaseModel):
    feature: str
    valor: float
    aporte: float
    sentido: str

class InferResponse(BaseModel):
    model_version: str
    perfil_clinico: str
    probabilidad: float
    descripcion: Optional[str] = None
    guia: Optional[Dict[str, Optional[str]]] = None
    explicacion: Optional[Dict] = None

app = FastAPI(title="IA Psicologica - Inferencia + IG", version="1.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:3000", "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- STARTUP WARMUP ----------
@app.on_event("startup")
def _warmup():
    try:
        print("[WARMUP] iniciando…")
        t0 = time.time()
        dummy = np.zeros((1, n_in), dtype=np.float32)
        dnum = dummy[:, :n_num]
        dnum = scaler.transform(dnum)
        dummy[:, :n_num] = dnum
        _ = model.predict(dummy, verbose=0)
        print(f"[WARMUP] listo en {time.time()-t0:.3f}s")
    except Exception as e:
        print("[WARMUP] fallo:", e)

# ---------- SALUD ----------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "n_features": n_in,
        "n_labels": len(LABELS),
        "first_features": FEATURES_ORDER[:5],
        "labels": LABELS,
        "has_labels_meta": bool(LABELS_META),
        "labels_meta_path": LABELS_META_PATH or "",
        "labels_meta_count": len(LABELS_META or {}),
    }

def build_top_features(attributions: np.ndarray, x_raw: np.ndarray, k: int) -> List[TopFeature]:
    idxs = np.argsort(-np.abs(attributions))[:max(1, k)]
    out: List[TopFeature] = []
    for i in idxs:
        name = FEATURES_ORDER[i]
        val  = float(x_raw[0, i])
        ap   = float(attributions[i])
        sentido = "↑" if ap >= 0 else "↓"
        out.append(TopFeature(feature=name, valor=val, aporte=ap, sentido=sentido))
    return out

# ---------- RUTA LIGERA (solo clase/prob) ----------
@app.post("/inferir-lite")
def inferir_lite(req: InferRequest):
    try:
        t0 = time.time()
        x_model, _x_raw, _dbg = build_input_vector(req.features)
        t_vec = time.time()

        probs = model.predict(x_model, verbose=0)[0]
        t_pred = time.time()

        idx = int(np.argmax(probs))
        label = LABELS[idx]
        p = float(probs[idx])

        meta = LABELS_META.get(label, {}) if isinstance(LABELS_META, dict) else {}
        print(f"[inferir-lite] vector:{t_vec-t0:.3f}s predict:{t_pred-t_vec:.3f}s total:{t_pred-t0:.3f}s")

        return {
            "model_version": MODEL_VERSION,
            "perfil_clinico": label,
            "probabilidad": p,
            "descripcion": meta.get("short"),
            "guia": {"long": meta.get("long")} if meta.get("long") is not None else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------- RUTA COMPLETA (explicación opcional) ----------
@app.post("/inferir", response_model=InferResponse)
def inferir(req: InferRequest):
    try:
        t0 = time.time()
        x_model, x_raw, debug = build_input_vector(req.features)
        t_vec = time.time()

        probs = model.predict(x_model, verbose=0)[0]
        t_pred = time.time()

        idx = int(np.argmax(probs))
        label = LABELS[idx]
        p = float(probs[idx])

        meta = LABELS_META.get(label, {}) if isinstance(LABELS_META, dict) else {}
        descripcion = meta.get("short")
        guia_larga  = meta.get("long")

        resp: Dict = {
            "model_version": MODEL_VERSION,
            "perfil_clinico": label,
            "probabilidad": p,
            "descripcion": descripcion,
            "guia": {"long": guia_larga} if guia_larga is not None else None,
        }

        if req.explain:
            k = max(1, req.top_k or 5)
            atts = integrated_gradients(x_model[0], idx, steps=64)  # esto puede tardar
            top_feats = build_top_features(atts, x_raw, k)
            resp["explicacion"] = {
                "metodo": "integrated_gradients",
                "clase_objetivo": label,
                "top_features": [tf_.model_dump() for tf_ in top_feats]
            }

        if req.debug:
            if "explicacion" not in resp:
                resp["explicacion"] = {}
            resp["explicacion"]["debug"] = debug

        print(f"[inferir] vector:{t_vec-t0:.3f}s predict:{t_pred-t_vec:.3f}s explain:{(time.time()-t_pred):.3f}s total:{time.time()-t0:.3f}s")
        return resp
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
