import "../styles/ModalNuevaEvaluacion.css"
import { useState } from "react"

export default function ModalNuevaEvaluacion({ onClose }) {
    const [formData, setFormData] = useState({
        nombre: "",
        ci: "",
        fechaNacimiento: "",
        genero: "",
        nivel: "",
        ocupacion: "",
        antecedentes: "",
        medio: "",
        contexto: "",
        tipo: "MMPI-2",
    })

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const tiposEvaluacion = ["MMPI-2", "MCMI-IV", "PAI"]

    const handleTipoChange = (tipo) => {
        setFormData({ ...formData, tipo })
    }

    return (
        <div className="modal-overlay">
        <div className="modal-form">
            <h3>Nueva Evaluación</h3>

            <div className="tipo-evaluacion">
            {tiposEvaluacion.map((tipo) => (
                <button
                key={tipo}
                className={formData.tipo === tipo ? "btn-tipo active" : "btn-tipo"}
                onClick={() => handleTipoChange(tipo)}
                >
                {tipo}
                </button>
            ))}
            </div>

            <div className="form-grid">
            <div className="col">
                <label>Nombre Completo</label>
                <input name="nombre" value={formData.nombre} onChange={handleChange} />

                <label>CI</label>
                <input name="ci" value={formData.ci} onChange={handleChange} />

                <label>Fecha Nacimiento</label>
                <input type="date" name="fechaNacimiento" value={formData.fechaNacimiento} onChange={handleChange} />

                <label>Género</label>
                <select name="genero" value={formData.genero} onChange={handleChange}>
                <option value="">Seleccione</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Otro">Otro</option>
                </select>

                <label>Nivel educativo</label>
                <select name="nivel" value={formData.nivel} onChange={handleChange}>
                <option value="">Seleccione</option>
                <option value="Primaria">Primaria</option>
                <option value="Secundaria">Secundaria</option>
                <option value="Superior">Superior</option>
                </select>

                <label>Ocupación</label>
                <select name="ocupacion" value={formData.ocupacion} onChange={handleChange}>
                <option value="">Seleccione</option>
                <option value="Desempleado">Desempleado</option>
                <option value="Estudiante">Estudiante</option>
                <option value="Obrero">Obrero</option>
                <option value="Otro">Otro</option>
                </select>
            </div>

            <div className="col">
                <label>Antecedentes</label>
                <select name="antecedentes" value={formData.antecedentes} onChange={handleChange}>
                <option value="">Seleccione</option>
                <option value="Violencia">Violencia</option>
                <option value="Abuso">Abuso</option>
                <option value="Delito">Delito</option>
                </select>

                <label>Medio</label>
                <input name="medio" value={formData.medio} onChange={handleChange} />

                <label>Contexto</label>
                <textarea name="contexto" rows="6" value={formData.contexto} onChange={handleChange} />
            </div>
            </div>

            <div className="modal-actions">
            <button className="btn-cancelar" onClick={onClose}>Cancelar</button>
            <button className="btn-guardar">Guardar</button>
            </div>
        </div>
        </div>
    )
}
