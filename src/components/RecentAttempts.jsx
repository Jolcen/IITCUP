import "../styles/IndividualsStatus.css";

function fmt(d) {
  try { return new Date(d).toLocaleString("es-BO", { hour12: false }); }
  catch { return "—"; }
}
const pill = (estado) =>
  estado === "evaluado" ? "bajo" : estado === "interrumpido" ? "alto" : "medio";

export default function RecentAttempts({ rows = [], loading = false }) {
  return (
    <div className="individuals-status panel">
      <h3>Intentos recientes</h3>
      <table>
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Prueba</th>
            <th>Fecha</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={4}>Cargando…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={4}>Sin registros</td></tr>
          ) : rows.map(r => (
            <tr key={r.id}>
              <td>{r.paciente}</td>
              <td>{r.prueba}</td>
              <td>{fmt(r.fecha)}</td>
              <td>
                <span className={`alerta ${pill(r.estado)}`}>
                  {r.estado.replaceAll("_"," ").toUpperCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
