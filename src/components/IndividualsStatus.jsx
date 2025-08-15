import "../styles/IndividualsStatus.css"

const individuals = [
  { nombre: "Ana Pérez", estado: "Estable", ultima: "2025-07-28", nivel: "Bajo" },
  { nombre: "Luis Gómez", estado: "Inestable", ultima: "2025-07-26", nivel: "Alto" },
  { nombre: "María López", estado: "Estable", ultima: "2025-07-25", nivel: "Medio" },
]

export default function IndividualsStatus() {
  return (
    <div className="individuals-status">
      <h3>Estado de Pacientes</h3>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Estado</th>
            <th>Última Eval.</th>
            <th>Alerta</th>
          </tr>
        </thead>
        <tbody>
          {individuals.map((i, index) => (
            <tr key={index}>
              <td>{i.nombre}</td>
              <td>{i.estado}</td>
              <td>{i.ultima}</td>
              <td>
                <span className={`alerta ${i.nivel.toLowerCase()}`}>
                  {i.nivel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
