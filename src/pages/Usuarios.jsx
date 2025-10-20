import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ModalUsuario from "../components/ModalUsuario";
import ConfirmDialog from "../components/ConfirmDialog";
import "../styles/Usuarios.css";

export default function Usuarios() {
  const [filas, setFilas] = useState([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [modoModal, setModoModal] = useState("ver");
  const [showDeleted, setShowDeleted] = useState(false);

  async function cargar() {
    setCargando(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("admin_list_app_users", {
        term: q?.trim() || null,
        include_deleted: showDeleted,
        limit_count: 200,
        offset_count: 0,
      });
      if (error) throw error;
      setFilas(data || []);
    } catch (e) {
      setErr(e.message || "No se pudo cargar usuarios");
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [showDeleted]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return filas;
    return filas.filter((u) =>
      (u.nombre || "").toLowerCase().includes(term) ||
      (u.email  || "").toLowerCase().includes(term) ||
      (String(u.rol) || "").toLowerCase().includes(term)
    );
  }, [q, filas]);

  const abrirCrearUsuario = () => {
    setModoModal("crear");
    setUsuarioSeleccionado({
      nombre: "", email: "", rol: "operador",
      estado: "verificacion",
      password: "",
      ci: "", telefono: "", direccion: "",
      fecha_nacimiento: "", especialidad: "", nivel: "", turno: "",
      matricula: "", institucion: "", fecha_graduacion: "",
      avatar_url: null,
    });
  };

  const abrirVerUsuario = async (u) => {
    const { data, error } = await supabase.rpc("admin_get_user_with_profile", { p_user_id: u.id });
    if (error) return alert(error.message);
    const app = data?.app_user || {};
    const sp  = data?.staff_profile || {};
    setModoModal("ver");
    setUsuarioSeleccionado({ ...app, ...sp });
  };

  const abrirEditarUsuario = async (u) => {
    const { data, error } = await supabase.rpc("admin_get_user_with_profile", { p_user_id: u.id });
    if (error) return alert(error.message);
    const app = data?.app_user || {};
    const sp  = data?.staff_profile || {};
    setModoModal("editar");
    setUsuarioSeleccionado({ ...app, ...sp });
  };

  const pedirConfirm = (title, message, onConfirm) =>
    setConfirm({ open: true, title, message, onConfirm });
  const [confirm, setConfirm] = useState({ open: false, title: "", message: "", onConfirm: null });
  const cerrarConfirm = () => setConfirm({ open: false, title: "", message: "", onConfirm: null });

  const onSoftDelete = (u) => {
    pedirConfirm(
      "Eliminar usuario",
      `Esto desactivará a ${u.nombre} (soft-delete). ¿Confirmas?`,
      async () => {
        cerrarConfirm();
        const { error } = await supabase.rpc("admin_soft_delete_user", { p_user_id: u.id });
        if (error) alert(error.message);
        await cargar();
      }
    );
  };

  const onRestore = (u) => {
    pedirConfirm(
      "Restaurar usuario",
      `¿Restaurar a ${u.nombre}? Quedará “inactivo”.`,
      async () => {
        cerrarConfirm();
        const { error } = await supabase.rpc("admin_restore_user", { p_user_id: u.id, restore_to: "inactivo" });
        if (error) alert(error.message);
        await cargar();
      }
    );
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
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              Mostrar eliminados
            </label>
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
                <th>Estado</th>
                <th>Creado</th>
                <th style={{ width: 220 }}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr><td colSpan={6} style={{ padding: 16 }}>Cargando…</td></tr>
              )}

              {!cargando && err && (
                <tr><td colSpan={6} style={{ padding: 16, color: "crimson" }}>{err}</td></tr>
              )}

              {!cargando && !err && filtradas.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 16 }}>Sin resultados</td></tr>
              )}

              {!cargando && !err && filtradas.map((u) => (
                <tr key={u.id}>
                  <td onClick={() => abrirVerUsuario(u)} style={{ cursor: "pointer" }}>
                    <div className="usuario-box"><span className="icon">👤</span><div>{u.nombre}</div></div>
                  </td>
                  <td onClick={() => abrirVerUsuario(u)} style={{ cursor: "pointer" }}>{u.email}</td>
                  <td><RolePill rol={u.rol} /></td>
                  <td><StatusPill estado={u.estado} /></td>
                  <td>{new Date(u.creado_en).toLocaleDateString()}</td>
                  <td>
                    <div className="acciones" style={{ display: "flex", gap: 8 }}>
                      <button className="btn-secundario" onClick={() => abrirEditarUsuario(u)}>Editar</button>
                      {u.estado === "eliminado" ? (
                        <button className="btn-secundario" onClick={() => onRestore(u)}>Restaurar</button>
                      ) : (
                        <button className="btn-peligro" onClick={() => onSoftDelete(u)}>Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {usuarioSeleccionado && (
        <ModalUsuario
          modo={modoModal}         // "crear" | "ver" | "editar"
          usuario={usuarioSeleccionado}
          onClose={() => setUsuarioSeleccionado(null)}
          onCreated={cargar}
          onUpdated={cargar}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        onCancel={cerrarConfirm}
        onConfirm={confirm.onConfirm || cerrarConfirm}
      />
    </div>
  );
}

function RolePill({ rol }) {
  const map = {
    administrador: ["#fee2e2", "#b91c1c", "#fecaca"],
    encargado:     ["#e0f2fe", "#0369a1", "#bae6fd"],
    operador:      ["#dbeafe", "#1d4ed8", "#bfdbfe"],
    secretario:    ["#e9d5ff", "#7c3aed", "#ddd6fe"],
  };
  const [bg, fg, bd] = map[rol] || ["#f1f5f9", "#64748b", "#e2e8f0"];
  return (
    <span style={{ background: bg, color: fg, border: `1px solid ${bd}`, fontSize: 12, padding: "2px 8px", borderRadius: 999 }}>
      {rol ?? "Sin rol"}
    </span>
  );
}

function StatusPill({ estado }) {
  const map = {
    verificacion:["#fff7ed", "#9a3412", "#fed7aa"],
    disponible: ["#dcfce7", "#166534", "#bbf7d0"],
    suspendido: ["#ffe4e6", "#9f1239", "#fecdd3"],
    ocupado:    ["#fef9c3", "#854d0e", "#fde68a"],
    inactivo:   ["#e5e7eb", "#374151", "#d1d5db"],
    bloqueado:  ["#fee2e2", "#991b1b", "#fecaca"],
    eliminado:  ["#f3f4f6", "#6b7280", "#e5e7eb"],
  };
  const [bg, fg, bd] = map[estado] || ["#f1f5f9", "#64748b", "#e2e8f0"];
  return (
    <span style={{ background: bg, color: fg, border: `1px solid ${bd}`, fontSize: 12, padding: "2px 8px", borderRadius: 999, textTransform: "capitalize" }}>
      {estado ?? "—"}
    </span>
  );
}
