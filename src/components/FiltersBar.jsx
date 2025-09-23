export default function FiltersBar({
  desde, hasta, onDesde, onHasta,
  pruebas = [], pruebaId, onPruebaId
}) {
  return (
    <div className="panel">
      <div className="filters">
        <div>
          <label>Desde</label>
          <input
            type="datetime-local"
            value={desde?.slice(0,16) || ""}
            onChange={(e) => onDesde(new Date(e.target.value).toISOString())}
          />
        </div>
        <div>
          <label>Hasta</label>
          <input
            type="datetime-local"
            value={hasta?.slice(0,16) || ""}
            onChange={(e) => onHasta(new Date(e.target.value).toISOString())}
          />
        </div>
        <div>
          <label>Prueba</label>
          <select value={pruebaId || ""} onChange={(e) => onPruebaId(e.target.value || null)}>
            <option value="">Todas</option>
            {pruebas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
