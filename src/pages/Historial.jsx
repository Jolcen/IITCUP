import "../styles/Historial.css"

const evaluados = [
    {
        nombre: "Carlos Pacheco",
        id: "S-001",
        caso: "Homicidio",
        fecha: "10/09/2009",
        responsable: "Juan Carlos",
        resultado: "Asesino",
        estado: "Terminado",
    },
    {
        nombre: "Josue Romay",
        id: "S-002",
        caso: "Asesinato",
        fecha: "01/10/2024",
        responsable: "Tatiana Suxo",
        resultado: "Adicto",
        estado: "Terminado",
    },
    {
        nombre: "Alejandro Atto",
        id: "S-001",
        caso: "Violacion",
        fecha: "24/02/2024",
        responsable: "Mauricio Quispe",
        resultado: "Inconcluso",
        estado: "En proceso",
    },
]

export default function Historial() {
    return (
        <div className="historial-page">
        <h2>Historial de Evaluados</h2>

        <div className="stats-cards">
            <div className="card">
            <p>Evaluados Totales</p>
            <h3>6</h3>
            </div>
            <div className="card">
            <p>Evaluados Pendientes</p>
            <h3>1,248</h3>
            </div>
        </div>

        <div className="historial-table-container">
            <div className="table-header">
            <h4>🧾 Historial de Evaluados</h4>
            <select>
                <option>Últimos 7 días</option>
                <option>Últimos 30 días</option>
                <option>Este año</option>
            </select>
            </div>

            <table>
            <thead>
                <tr>
                <th>Identificación</th>
                <th>Caso</th>
                <th>Fecha</th>
                <th>Responsable</th>
                <th>Resultado</th>
                <th>Estado</th>
                <th>Acción</th>
                </tr>
            </thead>
            <tbody>
                {evaluados.map((e, i) => (
                <tr key={i}>
                    <td>
                    <div className="identificacion">
                        <span className="icon">🧑‍⚖️</span>
                        <div>
                        {e.nombre}
                        <div className="id-text">ID: {e.id}</div>
                        </div>
                    </div>
                    </td>
                    <td>{e.caso}</td>
                    <td>{e.fecha}</td>
                    <td>{e.responsable}</td>
                    <td>{e.resultado}</td>
                    <td>
                    <span className={`estado-tag ${e.estado.toLowerCase().replace(" ", "-")}`}>
                        {e.estado}
                    </span>
                    </td>
                    <td>📄</td>
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
        </div>
    )
}
