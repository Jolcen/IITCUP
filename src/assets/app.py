import tensorflow as tf
from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np

model = tf.keras.models.load_model('modelo_ia.h5')

app = FastAPI()

class TestData(BaseModel):
    datos: list  

@app.post("/predict/")
async def predict(data: TestData):
    
    inputs = np.array(data.datos).reshape(1, -1)  

    predictions = model.predict(inputs)

    return {"perfil_clinico_diagnosticado": int(predictions[0][0]), 
            "riesgo_reincidencia": int(predictions[0][1]), 
            "puntaje_peligrosidad": float(predictions[0][2])}
