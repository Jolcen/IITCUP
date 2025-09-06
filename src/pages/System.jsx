import "../styles/System.css";
import { useMemo, useState } from "react";

export default function System() {
  // ---------------- Configuración / Notificaciones ----------------
  const [emails, setEmails] = useState([
    "receptor@gmail.com",
    "receptor@gmail.com",
  ]);
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [notificar, setNotificar] = useState(true);
  const [urgente, setUrgente] = useState(false);

  const agregarEmail = () => {
    const v = nuevoEmail.trim();
    if (!v) return;
    if (!emails.includes(v)) setEmails((prev) => [...prev, v]);
    setNuevoEmail("");
  };

  const eliminarEmail = (index) => {
    setEmails((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGuardarBackup = () => {
    // aquí luego puedes llamar a tu endpoint/función real
    alert("✅ Copia de seguridad guardada exitosamente");
  };

  // ---------------------- Eventos (logs) --------------------------
  // Simulación de datos. Luego puedes reemplazar por la data real de Supabase.
  const [levelFilter, setLevelFilter] = useState("all"); // all | info | warn | error
  const [query, setQuery] = useState("");

  const [events] = useState(() => [
    {
      id: "e-001",
      ts: "2026-05-20 15:42",
      usuario: "admin@gmail.com",
      nivel: "info",
      accion: "LOGIN_OK",
      detalle: "Inicio de sesión exitoso",
    },
    {
      id: "e-002",
      ts: "2026-05-20 15:45",
      usuario: "admin@gmail.com",
      nivel: "info",
      accion: "CONFIG_UPDATE",
      detalle: "Cambió zona horaria a UTC-04:00",
    },
    {
      id: "e-003",
      ts: "2026-05-20 16:02",
      usuario: "operador@acme.com",
      nivel: "warn",
      accion: "UPLOAD_SKIP",
      detalle: "Archivo duplicado omitido",
    },
    {
      id: "e-004",
      ts: "2026-05-20 16:11",
      usuario: "admin@gmail.com",
      nivel: "error",
      accion: "BACKUP_FAIL",
      detalle: "No se pudo escribir en el bucket",
    },
    {
      id: "e-005",
      ts: "2026-05-20 16:18",
      usuario: "admin@gmail.com",
      nivel: "info",
      accion: "BACKUP_OK",
      detalle: "Copia de seguridad completada",
    },
  ]);

  const filteredEvents = useMemo(() => {
    const q = query.toLowerCase();
    return events.filter((e) => {
      const matchLevel = levelFilter === "all" ? true : e.nivel === levelFilter;
      const matchQuery =
        !q ||
        e.usuario.toLowerCase().includes(q) ||
        e.accion.toLowerCase().includes(q) ||
        e.detalle.toLowerCase().includes(q) ||
        e.ts.toLowerCase().includes(q);
      return matchLevel && matchQuery;
    });
  }, [events, levelFilter, query]);

  return (
    <div className="sistema-container">
      {/* Columna izquierda ------------------------------------------------ */}
      <section className="sistema-left">
        <div className="card config">
          <h3>⚙️ Configuración del Sistema</h3>

          <label>Nombre de la Institución</label>
          <input defaultValue="IITCUP" />

          <label>Zona Horaria</label>
          <select defaultValue="UTC-04:00 Bolivia">
            <option>UTC-04:00 Bolivia</option>
            <option>UTC-03:00 Argentina</option>
          </select>

          <label>Idioma</label>
          <select defaultValue="Español">
            <option>Español</option>
            <option>Real Brasilero (RS)</option>
          </select>

          <label>Formato de Fecha</label>
          <select defaultValue="DD/MM/YYYY">
            <option>DD/MM/YYYY</option>
            <option>MM/DD/YYYY</option>
          </select>
        </div>

        <div className="card notificaciones">
          <h3>📧 Notificaciones por Email</h3>

          <div className="toggle">
            <span>Notificar</span>
            <input
              type="checkbox"
              checked={notificar}
              onChange={() => setNotificar((v) => !v)}
            />
          </div>

          <div className="email-add">
            <input
              placeholder="Adicionar gmail"
              value={nuevoEmail}
              onChange={(e) => setNuevoEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarEmail()}
            />
            <button onClick={agregarEmail}>+</button>
          </div>

          <ul className="email-lista">
            {emails.map((email, index) => (
              <li key={email + index}>
                {email}
                <button onClick={() => eliminarEmail(index)}>x</button>
              </li>
            ))}
          </ul>

          <div className="toggle urgente">
            <span>Notificar Asunto Urgente</span>
            <input
              type="checkbox"
              checked={urgente}
              onChange={() => setUrgente((v) => !v)}
            />
          </div>
        </div>
      </section>

      {/* Columna derecha -------------------------------------------------- */}
      <aside className="sistema-right">
        <div className="card sistema-info">
          <h3>🧾 Información del Sistema</h3>

          <label>Versión</label>
          <input value="v1.0.0" disabled />

          <label>Última Actualización</label>
          <input value="29/04/2025" disabled />

          <label>Estado</label>
          <p className="estado verde">🟢 Sistema Actualizado</p>

          <label>Último Backup</label>
          <input value="20/05/2026 15:30" disabled />

          <button className="btn-backup" onClick={handleGuardarBackup}>
            🔒 Realizar Copia de Seguridad
          </button>
        </div>

        {/* ---------- NUEVO PANEL: EVENTOS DEL SISTEMA ----------- */}
        <div className="card eventos">
          <div className="eventos-head">
            <h3>🗂️ Eventos del Sistema</h3>
            <div className="eventos-controls">
              <input
                className="eventos-search"
                placeholder="Buscar por usuario, acción, detalle…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className="eventos-filter"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                title="Filtrar nivel"
              >
                <option value="all">Todos</option>
                <option value="info">Info</option>
                <option value="warn">Avisos</option>
                <option value="error">Errores</option>
              </select>
            </div>
          </div>

          <div className="eventos-table">
            <div className="eventos-thead">
              <span>Fecha/Hora</span>
              <span>Usuario</span>
              <span>Nivel</span>
              <span>Acción</span>
              <span>Detalle</span>
            </div>

            <ul className="eventos-tbody">
              {filteredEvents.length === 0 && (
                <li className="eventos-empty">Sin resultados</li>
              )}

              {filteredEvents.map((e) => (
                <li key={e.id} className="eventos-row">
                  <span className="mono">{e.ts}</span>
                  <span className="cut">{e.usuario}</span>
                  <span>
                    <span className={`chip ${e.nivel}`}>{e.nivel}</span>
                  </span>
                  <span className="mono cut">{e.accion}</span>
                  <span className="cut">{e.detalle}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
