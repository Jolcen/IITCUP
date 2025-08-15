import "../styles/Evaluaciones.css"

import ModalNuevaEvaluacion from '../components/ModalNuevaEvaluacion'

import { FaUserCircle, FaEdit, FaTrash } from "react-icons/fa"
import { useState } from "react"

const evaluaciones = [
    { nombre: "Carlos Pacheco", caso: "Homicidio", detalles: "Mató a su pareja", fecha: "05/06/2025" },
    { nombre: "Juan Quispe", caso: "Homicidio", detalles: "Mató a una persona desconocida", fecha: "05/06/2025" },
    { nombre: "María Ramos", caso: "Adicción", detalles: "Alcoholismo", fecha: "05/06/2025" },
    { nombre: "Javier Martínez", caso: "Violencia", detalles: "Tendencias violentas", fecha: "05/06/2025" },
    { nombre: "Yerko Mamani", caso: "Homicidio", detalles: "Uso de pistola contra su vecino", fecha: "05/06/2025" },
    { nombre: "Fabricio Panama", caso: "Abuso", detalles: "Maltrato intra familiar", fecha: "05/06/2025" },
]

export default function Evaluaciones() {
    const [mostrarModal, setMostrarModal] = useState(false)

    return (
        <div className="evaluaciones-page">
            <div className="header">
                <div>
                <h2>Evaluaciones Pendientes</h2>
                <p>Generación de nuevos casos para ser evaluados</p>
                </div>
                <button className="btn-add" onClick={() => setMostrarModal(true)}>
                    + Añadir Evaluación
                </button>
            </div>

            <div className="table-container">
                <table>
                <thead>
                    <tr>
                    <th>Individuo</th>
                    <th>Caso</th>
                    <th>Detalles</th>
                    <th>Fecha</th>
                    <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    {evaluaciones.map((e, i) => (
                    <tr key={i}>
                        <td><FaUserCircle className="avatar" /> {e.nombre}</td>
                        <td>{e.caso}</td>
                        <td>{e.detalles}</td>
                        <td>{e.fecha}</td>
                        <td className="acciones">
                        <FaEdit className="icon edit" title="Editar" />
                        <FaTrash className="icon delete" title="Eliminar" />
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
                <div className="pagination">
                <span>◀</span>
                {[1, 2, 3, 4, 5].map((n) => <span key={n} className="page">{n}</span>)}
                <span>▶</span>
                </div>
            </div>
            {mostrarModal && (
                <ModalNuevaEvaluacion onClose={() => setMostrarModal(false)} />
            )}
        </div>
    )
}
