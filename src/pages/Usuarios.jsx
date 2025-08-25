// src/pages/Usuarios.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalUsuario from "../components/ModalUsuario";
import "../styles/Usuarios.css";

export default function Usuarios() {
  const [filas, setFilas] = useState([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [modoModal, setModoModal] = useState("ver");

  async function cargar() {
    setCargando(true);
    setErr("");
    const { data, error } = await supabase.rpc("admin_list_app_users");
    if (error) {
      setErr(error.message || "No se pudo cargar usuarios");
      setFilas([]);
    } else {
      setFilas(data || []);
    }
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  // Filtro por nombre/email/rol
  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return filas;
    return filas.filter((u) =>
      (u.nombre || "").toLowerCase().includes(term) ||
      (u.email  || "").toLowerCase().includes(term) ||
      (u.rol    || "").toLowerCase().includes(term)
    );
  }, [q, filas]);

  
  const abrirCrearUsuario = () => {
    setModoModal("crear");
    setUsuarioSeleccionado({
      nombre: "", email: "", rol: "operador",
      // campos extra para tu modal si los necesitas:
      ci: "", especialidad: "", nivel: "", turno: "", estado: "Disponible", password: ""
    });
  };

  const abrirVerUsuario = (u) => {
    setModoModal("ver");
    setUsuarioSeleccionado(u);
  };

  return (
    <div className="usuarios-page">
      <div className="tabla-personal">
        <div className="tabla-header">
          <div>
            <h3>PERSONAL</h3>
            <p>Gestión del personal de las pruebas psicológicas</p>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              className="input-buscar"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}
            />
            <button className="btn-primario" onClick={abrirCrearUsuario}>➕ Registrar usuario</button>
          </div>
        </div>

        <div className="tabla-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Creado</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr><td colSpan={4} style={{ padding: 16 }}>Cargando…</td></tr>
              )}

              {!cargando && err && (
                <tr><td colSpan={4} style={{ padding: 16, color: "crimson" }}>{err}</td></tr>
              )}

              {!cargando && !err && filtradas.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 16 }}>Sin resultados</td></tr>
              )}

              {!cargando && !err && filtradas.map((u) => (
                <tr key={u.id} onClick={() => abrirVerUsuario(u)} style={{ cursor: "pointer" }}>
                  <td>
                    <div className="usuario-box">
                      <span className="icon">👤</span>
                      <div>{u.nombre}</div>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td><RolePill rol={u.rol} /></td>
                  <td>{new Date(u.creado_en).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {usuarioSeleccionado && (
        <ModalUsuario
          modo={modoModal}
          usuario={usuarioSeleccionado}
          onClose={() => setUsuarioSeleccionado(null)}
          onCreated={cargar}    // refresca lista tras crear
          onUpdated={cargar}
        />
      )}
    </div>
  );
}

function RolePill({ rol }) {
  const map = {
    administrador: ["#fee2e2", "#b91c1c", "#fecaca"], // bg, fg, border
    operador:      ["#dbeafe", "#1d4ed8", "#bfdbfe"],
    asistente:     ["#e9d5ff", "#7c3aed", "#ddd6fe"],
  };
  const [bg, fg, bd] = map[rol] || ["#f1f5f9", "#64748b", "#e2e8f0"];
  return (
    <span style={{
      background: bg, color: fg, border: `1px solid ${bd}`,
      fontSize: 12, padding: "2px 8px", borderRadius: 999
    }}>
      {rol ?? "Sin rol"}
    </span>
  );
}
