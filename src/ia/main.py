import os, json, joblib, numpy as np
from typing import Dict, Optional, List, Tuple
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv

import tensorflow as tf
from tensorflow import keras

# ==========================
# Carga de artefactos
# ==========================
load_dotenv()

MODEL_PATH         = os.getenv("MODEL_PATH", "mlp_final.h5")
LABELS_PATH        = os.getenv("LABELS_PATH", "labels.json")
NUMERIC_COLS_PATH  = os.getenv("NUMERIC_COLS_PATH", "numeric_cols.json")
FLAGS_PATH         = os.getenv("FLAGS_PATH", "flags_order.json")
FEATURES_PATH      = os.getenv("FEATURES_PATH", "features_order.json")
SCALER_PATH        = os.getenv("SCALER_PATH", "scaler_numeric.pkl")
BASELINE_PATH      = os.getenv("BASELINE_PATH", "baseline_mean.npy")
MODEL_VERSION      = os.getenv("MODEL_VERSION", "nn_v1")

model = keras.models.load_model(MODEL_PATH, compile=False)
LABELS: List[str] = json.load(open(LABELS_PATH, "r", encoding="utf-8"))
NUMERIC_COLS: List[str] = json.load(open(NUMERIC_COLS_PATH, "r", encoding="utf-8"))   # 62
FLAGS_ORDER: List[str]  = json.load(open(FLAGS_PATH, "r", encoding="utf-8"))           # 3
FEATURES_ORDER: List[str] = json.load(open(FEATURES_PATH, "r", encoding="utf-8"))      # 65

scaler = joblib.load(SCALER_PATH)  # StandardScaler SOLO numéricas
baseline_raw = np.load(BASELINE_PATH).astype(np.float32)  # (65,)

n_in   = len(FEATURES_ORDER)
n_num  = len(NUMERIC_COLS)
n_flag = len(FLAGS_ORDER)
assert n_in == n_num + n_flag, "Dimensiones inconsistentes entre features/numéricas/flags."

# ==========================
# Alias según tus tablas (capturas)
# ==========================
PAI_CODES = {
    "SOM","ANS","TRA","DEP","MAN","PAR","ESQ","LIM",
    "ANT","ALC","DRG","AGR","SUI","EST","FAS","RTR","DOM","AFA"
}
MCMI_CODES = {
    "1","2A","2B","3","4A","4B","5","6A","6B","7","8A","8B",
    "S","C","P","A","H","N","D","B","T","R","SS","CC","PP"
}
MMPI_CODES = {
    "F-r","Fpsi-r","Fs","FVS-r","SI","L-r","K-r",
    "AE/PI","AP","AC/PE",
    "CRd","CR1","CR2","CR3","CR4","CR5","CR6","CR7","CR8","CR9"
}
PREFIXES = ("PAI_", "MCMI_", "MMPI_")

def alias_key(k: str) -> str:
    """Convierte un código tal cual viene de BD al nombre que entrenó el modelo."""
    if not k:
        return k
    if k.startswith(PREFIXES):
        return k
    if k in PAI_CODES:  return f"PAI_{k}"
    if k in MCMI_CODES: return f"MCMI_{k}"
    if k in MMPI_CODES: return f"MMPI_{k}"
    return k

def normalize_scores(raw: Dict[str, float]) -> Tuple[Dict[str, float], Dict[str, str]]:
    """Aplica alias y castea a float. Devuelve (scores_normalizados, alias_map)."""
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
    return {"tiene_PAI": int(has_pai), "tiene_MCMI": int(has_mcmi), "tiene_MMPI": int(has_mmpi)}

def build_input_vector(raw_scores: Dict[str, float]) -> Tuple[np.ndarray, np.ndarray, Dict]:
    """
    x_model: (1,65) -> numéricas escaladas + flags; es lo que entra al modelo.
    x_raw:   (1,65) -> numéricas crudas + flags 0/1; para mostrar 'valor' en UI.
    debug:   info para auditar el armado.
    """
    scores, alias_map = normalize_scores(raw_scores)
    flags_auto = compute_flags_from_keys(list(scores.keys()))

    x_num = np.zeros((n_num,), dtype=np.float32)
    used_numeric, missing_numeric = [], []
    for i, col in enumerate(NUMERIC_COLS):
        if col in scores:
            x_num[i] = float(scores[col])
            used_numeric.append(col)
        else:
            # SOLO baseline del entrenamiento (no defaults de dominio)
            x_num[i] = float(baseline_raw[i])
            missing_numeric.append(col)

    x_num_scaled = scaler.transform(x_num.reshape(1, -1)).astype(np.float32)    # (1,62)
    x_flags = np.array([flags_auto.get(f, 0) for f in FLAGS_ORDER], dtype=np.float32).reshape(1, -1)

    x_raw   = np.concatenate([x_num.reshape(1, -1), x_flags], axis=1)           # (1,65)
    x_model = np.concatenate([x_num_scaled,         x_flags], axis=1)           # (1,65)

    debug = {
        "alias_map": alias_map,
        "used_numeric": used_numeric,
        "missing_numeric": missing_numeric,
        "flags": {f: int(v) for f, v in flags_auto.items()},
        "unknown_inputs": [
            k for k in scores.keys()
            if (k not in set(NUMERIC_COLS)) and (k not in set(FLAGS_ORDER))
        ],
        "vector_raw_dict": {FEATURES_ORDER[i]: float(x_raw[0, i]) for i in range(n_in)},
        "vector_scaled_65": [float(v) for v in x_model[0]],
    }
    return x_model.astype(np.float32), x_raw.astype(np.float32), debug

# ==========================
# Integrated Gradients
# ==========================
def scale_numeric_then_concat(raw65: np.ndarray) -> np.ndarray:
    x_num = raw65[:n_num].reshape(1, -1)
    x_num_scaled = scaler.transform(x_num).astype(np.float32)[0]
    x_flags = raw65[n_num:]
    return np.concatenate([x_num_scaled, x_flags], axis=0).astype(np.float32)

baseline_scaled = scale_numeric_then_concat(baseline_raw)  # (65,)

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
    return atts.numpy()[0]  # (65,)

# ==========================
# FastAPI
# ==========================
class InferRequest(BaseModel):
    features: Dict[str, float] = Field(..., description="Mapa escala->valor (T/BR). Puede usar códigos de BD.")
    explain: bool = True
    top_k: int = 5
    debug: bool = False              # <— para ver el vector exacto que entra

class TopFeature(BaseModel):
    feature: str
    valor: float
    aporte: float
    sentido: str

class InferResponse(BaseModel):
    model_version: str
    perfil_clinico: str
    probabilidad: float
    explicacion: Optional[Dict] = None

app = FastAPI(title="IA Psicologica - Inferencia + IG", version="1.0")

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173","http://127.0.0.1:5173",
        "http://localhost:3000","http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "n_features": n_in,
        "n_labels": len(LABELS),
        "first_features": FEATURES_ORDER[:5]
    }

def build_top_features(attributions: np.ndarray, x_raw: np.ndarray, k: int) -> List[TopFeature]:
    idxs = np.argsort(-np.abs(attributions))[:max(1, k)]
    out: List[TopFeature] = []
    for i in idxs:
        name = FEATURES_ORDER[i]
        val  = float(x_raw[0, i])     # valor crudo usado
        ap   = float(attributions[i])
        sentido = "↑" if ap >= 0 else "↓"
        out.append(TopFeature(feature=name, valor=val, aporte=ap, sentido=sentido))
    return out

@app.post("/inferir", response_model=InferResponse)
def inferir(req: InferRequest):
    try:
        x_model, x_raw, debug = build_input_vector(req.features)

        probs = model.predict(x_model, verbose=0)[0]
        idx   = int(np.argmax(probs))
        label = LABELS[idx]
        p     = float(probs[idx])

        resp = {
            "model_version": MODEL_VERSION,
            "perfil_clinico": label,
            "probabilidad": p
        }

        if req.explain:
            k = max(1, req.top_k or 5)
            atts = integrated_gradients(x_model[0], idx, steps=64)
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

        return resp
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
