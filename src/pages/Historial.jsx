import "../styles/Historial.css"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

const evaluados = [
    { nombre: "Carlos Pacheco",  id: "S-001", caso: "Homicidio",  fecha: "10/09/2009", responsable: "Juan Carlos",   resultado: "Asesino",    estado: "En proceso" },
    { nombre: "Josue Romay",     id: "S-002", caso: "Asesinato",  fecha: "01/10/2024", responsable: "Tatiana Suxo",  resultado: "Adicto",     estado: "Terminado" },
    { nombre: "Alejandro Atto",  id: "S-003", caso: "Violacion",  fecha: "24/02/2024", responsable: "Mauricio Quispe",resultado: "Inconcluso", estado: "En proceso" },
    ]

    export default function Historial() {
    const [showModal, setShowModal] = useState(false)       // Modal Pruebas
    const [showReporte, setShowReporte] = useState(false)   // Sub-modal Resultado PAI
    const [seleccion, setSeleccion] = useState(null)        // { nombre, id }
    const navigate = useNavigate()

    const abrirModal = (row) => {
        setSeleccion({ nombre: row.nombre, id: row.id })
        setShowModal(true)
    }
    const cerrarModal = () => setShowModal(false)

    // Al hacer clic en la tarjeta PAI (no el botón naranja)
    const abrirReportePAI = () => setShowReporte(true)
    const cerrarReportePAI = () => setShowReporte(false)

    const realizarPAI = () => {
        if (!seleccion) return
        navigate(`/pruebas?test=PAI&patient=${encodeURIComponent(seleccion.nombre)}&eval=${seleccion.id}`)
    }

    // Exportaciones básicas de ejemplo
    const exportarExcel = () => {
        const csv = "escala,t_score\nDEP,68\nANX,62\nPAR,58\n";
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url; a.download = "resultado_pai.csv"; a.click()
        URL.revokeObjectURL(url)
    }
    const exportarPDF = () => {
    const html = `
        <html><head><title>Resultado PAI</title></head>
        <body style="margin:0;padding:24px;font-family:sans-serif">
        <h3>Resultado del test PAI</h3>
        <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTuAAYUyvAatIM7Ol7a824BzJg2Yb_eaEsbTQ&s" style="max-width:100%;height:auto"/>
        <script>window.print();</script>
        </body></html>`;
    
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    }


    return (
        <div className="historial-page">
        <h2>Historial de Evaluados</h2>

        <div className="stats-cards">
            <div className="card"><p>Evaluados Totales</p><h3>6</h3></div>
            <div className="card"><p>Evaluados Pendientes</p><h3>1,248</h3></div>
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
                    <span className={`estado-tag ${e.estado.toLowerCase().replace(" ", "-")}`}>{e.estado}</span>
                    </td>
                    <td>
                    <button className="btn-link" onClick={() => abrirModal(e)} title="Ver pruebas">📄</button>
                    </td>
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

        {/* MODAL: PRUEBAS */}
        {showModal && (
            <div className="modal-overlay" onClick={cerrarModal}>
            <div className="modal pruebas-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                <h3>Pruebas Psicológicas</h3>
                <button className="close" onClick={cerrarModal}>✕</button>
                </div>

                {seleccion && (
                <p className="muted">
                    Paciente: <strong>{seleccion.nombre}</strong> · Evaluación <strong>{seleccion.id}</strong>
                </p>
                )}

                <div className="tests-row">
                {/* PAI destacado y clic abre sub-ventana */}
                <div className="test-card selected" onClick={abrirReportePAI} style={{cursor:"pointer"}}>
                    <img src="/public/static/images/pai.jpg" alt="PAI" />
                    <div className="test-title">Personality Assessment Inventory</div>
                    <span className="badge-green">PAI</span>
                </div>

                <div className="test-card">
                    <img src="/public/static/images/mcmi-iv.jpg" alt="MCMI" />
                    <div className="test-title">Millon Clinical Multiaxial Inventory - IV</div>
                </div>

                <div className="test-card">
                    <img src="/public/static/images/mmpi-2.jpg" alt="MMPI-2" />
                    <div className="test-title">Minnesota Multiphasic Personality Inventory - 2</div>
                </div>

                <div className="test-card">
                    <img src="/public/static/images/testP.jpg" alt="Test personalizado" />
                    <div className="test-title">Test personalizado</div>
                </div>
                </div>

                <div className="modal-actions">
                <button className="btn-primary" onClick={realizarPAI}>Realizar Prueba</button>
                </div>

                {/* SUB-MODAL: RESULTADO PAI */}
                {showReporte && (
                <div className="modal-overlay nested" onClick={cerrarReportePAI}>
                    <div className="modal result-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-head">
                        <h3>Resultado del test PAI</h3>
                        <button className="close" onClick={cerrarReportePAI}>✕</button>
                    </div>

                    <div className="result-body">
                        {/* Usa tu imagen real del reporte */}
                        <img src="/public/static/images/perfil pai.jpg" alt="Resultado PAI" className="result-img" />
                    </div>

                    <div className="result-actions">
                        <button className="btn-soft" onClick={exportarExcel}>📁 Exportar excel</button>
                        <button className="btn-soft" onClick={exportarPDF}>📄 Exportar pdf</button>
                    </div>
                    </div>
                </div>
                )}
            </div>
            </div>
        )}
        </div>
    )
}
