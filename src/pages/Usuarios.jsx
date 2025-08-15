import { useState } from "react"
import ModalUsuario from "../components/ModalUsuario"
import "../styles/Usuarios.css"

const usuariosMock = [
    {
        nombre: "Juan Carlos Mamani Choque",
        ci: "348921 LP",
        email: "juanchoque@gmail.com",
        especialidad: "Clínica",
        nivel: "Perito",
        fecha: "26/04/2025",
        turno: "Mañana",
        casos: 48,
        estado: "Disponible",
    },
    {
        nombre: "Miguel Choque Flores",
        ci: "201122 LP",
        email: "miguel@gmail.com",
        especialidad: "Forense",
        nivel: "Secundaria",
        fecha: "26/04/2025",
        turno: "Tarde",
        casos: 0,
        estado: "Espera",
    },
    {
        nombre: "Luis Vargas Céspedes",
        ci: "489205 LP",
        email: "luisvargas@gmail.com",
        especialidad: "Educativa",
        nivel: "Perito",
        fecha: "26/04/2025",
        turno: "Noche",
        casos: 12,
        estado: "Disponible",
    },
    {
        nombre: "Ana Tardío Guarachi",
        ci: "829140 LP",
        email: "anatardio@gmail.com",
        especialidad: "Forense",
        nivel: "Perito",
        fecha: "26/04/2025",
        turno: "Tarde",
        casos: 52,
        estado: "Ocupado",
    }
    ]

    export default function Usuarios() {
    const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null)

    return (
        <div className="usuarios-page">
        <h2>Usuarios</h2>

        <div className="resumen-box">
            <div className="card-resumen"><p>Total de usuarios</p><h3>1,248</h3></div>
            <div className="card-resumen disponible"><p>Usuarios disponibles</p><h3>47</h3></div>
            <div className="card-resumen inactivos"><p>Usuarios Inactivos</p><h3>3</h3></div>
            <div className="card-resumen espera"><p>Usuarios en espera</p><h3>1</h3></div>
        </div>

        <div className="tabla-personal">
            <h3>PERSONAL</h3>
            <p>Gestión del personal de las pruebas psicológicas</p>

            <table>
            <thead>
                <tr>
                <th>Personal</th>
                <th>Especialidad</th>
                <th>Nivel</th>
                <th>Fecha Ingr.</th>
                <th>Turno</th>
                <th>Casos</th>
                <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                {usuariosMock.map((u, i) => (
                <tr key={i} onClick={() => setUsuarioSeleccionado(u)}>
                    <td>
                    <div className="usuario-box">
                        <span className="icon">👤</span>
                        <div>
                        {u.nombre}
                        <div className="ci">{u.ci}</div>
                        </div>
                    </div>
                    </td>
                    <td>{u.especialidad}</td>
                    <td>{u.nivel}</td>
                    <td>{u.fecha}</td>
                    <td>{u.turno}</td>
                    <td>{u.casos}</td>
                    <td><span className={`estado ${u.estado.toLowerCase()}`}>{u.estado}</span></td>
                </tr>
                ))}
            </tbody>
            </table>

            <div className="pagination">
            {["◀", 1, 2, 3, 4, 5, "▶"].map((p, i) => (
                <span key={i} className="page">{p}</span>
            ))}
            </div>
        </div>

        {usuarioSeleccionado && (
            <ModalUsuario
            usuario={usuarioSeleccionado}
            onClose={() => setUsuarioSeleccionado(null)}
            />
        )}
        </div>
    )
}
