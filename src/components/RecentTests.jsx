import "../styles/RecentTests.css"

const testData = [
  { nombre: "Ana Pérez", tipo: "MMPI-2", fecha: "2025-08-01", estado: "Finalizado" },
  { nombre: "Luis Gómez", tipo: "MCMI-IV", fecha: "2025-07-30", estado: "Pendiente" },
  { nombre: "María López", tipo: "PAI", fecha: "2025-07-29", estado: "Finalizado" },
  { nombre: "Carlos Ríos", tipo: "MMPI-2", fecha: "2025-07-28", estado: "Pendiente" },
]

export default function RecentTests() {
  return (
    <div className="recent-tests">
      <h3>Evaluaciones Recientes</h3>
      <table>
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Tipo</th>
            <th>Fecha</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {testData.map((test, index) => (
            <tr key={index}>
              <td>{test.nombre}</td>
              <td>{test.tipo}</td>
              <td>{test.fecha}</td>
              <td>
                <span className={`estado ${test.estado.toLowerCase()}`}>
                  {test.estado}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
