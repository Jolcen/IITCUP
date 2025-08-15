import { useState } from "react"
import { useNavigate } from "react-router-dom"
import "../styles/Tests.css"

const tests = [
    { id: "pai", nombre: "Personality Assessment Inventory", imagen: "/static/images/pai.jpg" },
    { id: "mcmi", nombre: "Millon Clinical Multiaxial Inventory - IV", imagen: "/static/images/mcmi-iv.jpg" },
    { id: "mmpi", nombre: "Minnesota Multiphasic Personality Inventory - 2", imagen: "/static/images/mmpi-2.jpg" },
    { id: "custom", nombre: "Test personalizado", imagen: "/static/images/testP.jpg" },
    ]

    export default function Tests() {
    const [selectedId, setSelectedId] = useState(null)
    const navigate = useNavigate()

    const handleSeleccionar = (id) => setSelectedId(id)

    const handleRealizarTest = () => {
        if (selectedId) {
        navigate(`/test/${selectedId}`)
        } else {
        alert("❗ Debes seleccionar una prueba antes de continuar.")
        }
    }

    return (
        <div className="contenedor-tests">
        <h3>Pruebas psicológicas</h3>
        <div className="grid-tests">
            {tests.map((test) => (
            <div
                key={test.id}
                className={`card-test ${selectedId === test.id ? "seleccionado" : ""}`}
                onClick={() => handleSeleccionar(test.id)}
            >
                <img src={test.imagen} alt={test.nombre} />
                <div className="overlay" />
                <p>{test.nombre}</p>
            </div>
            ))}
        </div>
        <button className="btn-test" onClick={handleRealizarTest}>Realizar Prueba</button>
        </div>
    )
}
