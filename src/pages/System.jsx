import "../styles/System.css"
import { useState } from "react"

export default function System() {
  const [emails, setEmails] = useState(["receptor@gmail.com", "receptor@gmail.com"])
  const [nuevoEmail, setNuevoEmail] = useState("")
  const [notificar, setNotificar] = useState(true)
  const [urgente, setUrgente] = useState(false)

  const agregarEmail = () => {
    if (nuevoEmail && !emails.includes(nuevoEmail)) {
      setEmails([...emails, nuevoEmail])
      setNuevoEmail("")
    }
  }

  const eliminarEmail = (index) => {
    const nuevaLista = [...emails]
    nuevaLista.splice(index, 1)
    setEmails(nuevaLista)
  }

  const handleGuardar = () => {
    alert("✅ Copia de seguridad guardada exitosamente")
    onClose()
  }

  return (
    <div className="sistema-container">
      <div className="sistema-left">
        <div className="card config">
          <h3>⚙️ Configuración del Sistema</h3>
          <label>Nombre de la Institución</label>
          <input value="IITCUP" />

          <label>Zona Horaria</label>
          <select defaultValue="UTC-04:00 Bolivia">
            <option>UTC-04:00 Bolivia</option>
            <option>UTC-03:00 Argentina</option>
          </select>

          <label>Idioma</label>
          <select defaultValue="Real Brasilero (RS)">
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
            <input type="checkbox" checked={notificar} onChange={() => setNotificar(!notificar)} />
          </div>

          <div className="email-add">
            <input
              placeholder="Adicionar gmail"
              value={nuevoEmail}
              onChange={(e) => setNuevoEmail(e.target.value)}
            />
            <button onClick={agregarEmail}>+</button>
          </div>

          <ul className="email-lista">
            {emails.map((email, index) => (
              <li key={index}>
                {email}
                <button onClick={() => eliminarEmail(index)}>x</button>
              </li>
            ))}
          </ul>

          <div className="toggle urgente">
            <span>Notificar Asunto Urgente</span>
            <input type="checkbox" checked={urgente} onChange={() => setUrgente(!urgente)} />
          </div>
        </div>
      </div>

      <div className="sistema-right">
        <div className="card perfil">
          <h3>👤 Perfil de Usuario</h3>
          <img
            src="https://randomuser.me/api/portraits/women/44.jpg"
            alt="usuario"
            className="avatar"
          />
          <p className="nombre">Juliana Albuquerque</p>
          <p className="email">juliana@gmail.com</p>

          <label>Nombre</label>
          <input value="Admin" />
          <label>Apellido</label>
          <input value="Martínez" />
          <label>Email</label>
          <input value="admin@gmail.com" />
          <label>Contraseña</label>
          <input type="password" value="********" />
          <label>Nivel de Acceso</label>
          <select defaultValue="Administrador">
            <option>Administrador</option>
            <option>Supervisor</option>
          </select>
        </div>

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
          <button className="btn-backup" onClick={handleGuardar}>🔒 Realizar Copia de Seguridad</button>
        </div>
      </div>
    </div>
  )
}
