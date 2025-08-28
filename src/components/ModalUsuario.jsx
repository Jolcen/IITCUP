// src/components/ModalUsuario.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/ModalUsuario.css";

export default function ModalUsuario({
  modo = "crear",
  usuario = {},
  onClose,
  onCreated,
}) {
  const isCrear = modo === "crear";
  const titulo = isCrear ? "Registrar usuario" : "Usuario seleccionado";
  const subtitulo = isCrear
    ? "Complete los datos del nuevo miembro del equipo"
    : "Detalles del usuario en solo lectura";

  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? "",
    email: usuario?.email ?? "",
    password: "",
    rol: usuario?.rol ?? "operador", // administrador | operador | asistente
    ci: usuario?.ci ?? "",
    telefono: usuario?.telefono ?? "",
    direccion: usuario?.direccion ?? "",
    fecha_nacimiento: usuario?.fecha_nacimiento ?? "",
    especialidad: usuario?.especialidad ?? "",
    nivel: usuario?.nivel ?? "",
    turno: usuario?.turno ?? "",
    matricula: usuario?.matricula ?? "",
    institucion: usuario?.institucion ?? "",
    fecha_graduacion: usuario?.fecha_graduacion ?? "",
    estado: usuario?.estado ?? "Disponible",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      nombre: usuario?.nombre ?? "",
      email: usuario?.email ?? "",
      rol: usuario?.rol ?? "operador",
    }));
  }, [usuario, modo]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [touched, setTouched] = useState({});

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };
  const onBlur = (e) => {
    const { name } = e.target;
    setTouched((t) => ({ ...t, [name]: true }));
  };

  // ── Validaciones y mensajes por campo ────────────────────────────────────────
  const errs = useMemo(() => {
    const e = {};
    const email = form.email?.trim();
    const nombre = form.nombre?.trim();

    if (!nombre) e.nombre = "El nombre es obligatorio.";
    if (!email) e.email = "El email es obligatorio.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "El email no es válido.";

    if (isCrear) {
      if (!form.password) e.password = "La contraseña es obligatoria.";
      else if (form.password.length < 8)
        e.password = "Mínimo 8 caracteres.";
    }

    if (!["administrador", "operador", "asistente"].includes(form.rol)) {
      e.rol = "Selecciona un rol válido.";
    }

    if (form.telefono && !/^\d{7,15}$/.test(form.telefono)) {
      e.telefono = "Teléfono inválido (solo dígitos, 7–15).";
    }

    return e;
  }, [form, isCrear]);

  const puedeCrear = isCrear && Object.keys(errs).length === 0;

  const closeOnEsc = useCallback(
    (ev) => {
      if (ev.key === "Escape" && !guardando) onClose?.();
    },
    [guardando, onClose]
  );
  useEffect(() => {
    document.addEventListener("keydown", closeOnEsc);
    return () => document.removeEventListener("keydown", closeOnEsc);
  }, [closeOnEsc]);

  function showFieldErr(name) {
    return touched[name] && errs[name] ? (
      <div style={{ color: "#c0392b", fontSize: 12, marginTop: 4 }}>
        {errs[name]}
      </div>
    ) : null;
  }

  async function handleGuardar() {
    try {
      setGuardando(true);
      setError("");
      setOkMsg("");

      // Si hay errores, los mostramos y marcamos los campos
      if (!puedeCrear) {
        setTouched((t) => {
          const all = { ...t };
          Object.keys(errs).forEach((k) => (all[k] = true));
          return all;
        });
        setError("Revisa los campos marcados en rojo.");
        return;
      }

      const payload = {
        email: form.email.trim(),
        password: form.password,
        nombre: form.nombre.trim(),
        rol: form.rol,
        ci: form.ci?.trim() || null,
        telefono: form.telefono?.trim() || null,
        direccion: form.direccion?.trim() || null,
        fecha_nacimiento: form.fecha_nacimiento || null,
        especialidad: form.especialidad || null,
        nivel: form.nivel || null,
        turno: form.turno || null,
        matricula: form.matricula || null,
        institucion: form.institucion || null,
        fecha_graduacion: form.fecha_graduacion || null,
        estado: form.estado || "Disponible",
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("No hay sesión activa. Inicia sesión nuevamente.");
        return;
      }

      const { error } = await supabase.functions.invoke("create-staff", {
        body: payload,
      });
      if (error) throw new Error(error.message || "No se pudo crear el usuario.");

      setOkMsg("✅ Usuario creado correctamente");
      onCreated?.();
      onClose?.();
    } catch (e) {
      setError(e.message || "Ocurrió un error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={() => !guardando && onClose?.()}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="modal-usuario"
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h3 id="modal-title">{titulo}</h3>
          <button
            className="modal-close"
            aria-label="Cerrar"
            onClick={() => !guardando && onClose?.()}
          >
            ✕
          </button>
        </div>
        <p className="modal-subtitle">{subtitulo}</p>

        <div className="usuario-header">
          <img src="/avatar.png" alt="avatar" />
          <div>
            <strong>{form.nombre || "—"}</strong>
            <div>{form.ci || "—"}</div>
            <div>{form.email || "—"}</div>
          </div>
        </div>

        <div className="form-grid">
          <div className="col">
            <label>Nombre</label>
            <input
              name="nombre"
              value={form.nombre}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              placeholder="Ej. Ana Pérez"
              aria-invalid={!!errs.nombre}
            />
            {showFieldErr("nombre")}

            <label>Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              placeholder="usuario@correo.com"
              aria-invalid={!!errs.email}
            />
            {showFieldErr("email")}

            {isCrear && (
              <>
                <label>Contraseña</label>
                <div className="input-inline">
                  <input
                    name="password"
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder="Mínimo 8 caracteres"
                    disabled={guardando}
                    aria-invalid={!!errs.password}
                  />
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => setShowPwd((s) => !s)}
                    disabled={guardando}
                  >
                    {showPwd ? "Ocultar" : "Ver"}
                  </button>
                </div>
                {showFieldErr("password")}
              </>
            )}

            <label>Nivel de Acceso</label>
            <select
              name="rol"
              value={form.rol}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              aria-invalid={!!errs.rol}
            >
              <option value="administrador">Administrador</option>
              <option value="operador">Operador</option>
              <option value="asistente">Asistente</option>
            </select>
            {showFieldErr("rol")}

            <label>CI</label>
            <input
              name="ci"
              value={form.ci}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              placeholder="Documento"
            />

            <label>Teléfono</label>
            <input
              name="telefono"
              value={form.telefono}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              placeholder="Ej. 71234567"
              aria-invalid={!!errs.telefono}
            />
            {showFieldErr("telefono")}

            <label>Dirección domicilio</label>
            <input
              name="direccion"
              value={form.direccion}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              placeholder="Calle, Zona, Ciudad"
            />

            <label>Fecha nacimiento</label>
            <input
              name="fecha_nacimiento"
              type="date"
              value={form.fecha_nacimiento}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
            />
          </div>

          <div className="col">
            <label>Especialidad</label>
            <select
              name="especialidad"
              value={form.especialidad}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
            >
              <option value="">Seleccione</option>
              <option value="clinico">Clínico</option>
              <option value="forense">Forense</option>
              <option value="educativo">Educativo</option>
              <option value="social">Social</option>
            </select>

            <label>N° matrícula profesional</label>
            <input
              name="matricula"
              value={form.matricula}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
            />

            <label>Institución de titulación</label>
            <input
              name="institucion"
              value={form.institucion}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
            />

            <label>Fecha de graduación</label>
            <input
              name="fecha_graduacion"
              type="date"
              value={form.fecha_graduacion}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
            />

            <label>Nivel</label>
            <input
              name="nivel"
              value={form.nivel}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              placeholder="Jr / Sr / etc."
            />

            <label>Turno</label>
            <input
              name="turno"
              value={form.turno}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
              placeholder="Mañana / Tarde / Noche"
            />

            <label>Estado</label>
            <select
              name="estado"
              value={form.estado}
              onChange={onChange}
              onBlur={onBlur}
              disabled={!isCrear || guardando}
            >
              <option>Disponible</option>
              <option>Ocupado</option>
              <option>Inactivo</option>
            </select>
          </div>
        </div>

        {/* BANNERS */}
        {error && <div className="alert alert--error">{error}</div>}
        {okMsg && <div className="alert alert--ok">{okMsg}</div>}

        {/* ACCIONES */}
        <div className="modal-actions">
          {isCrear ? (
            <button
              type="button"
              className="btn btn-aceptar"
              onClick={handleGuardar}
              disabled={!puedeCrear || guardando}
              title={!puedeCrear ? "Completa los campos obligatorios" : ""}
            >
              {guardando ? "Creando…" : "Crear usuario"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-neutral"
              onClick={onClose}
              disabled={guardando}
            >
              Cerrar
            </button>
          )}
          <button
            type="button"
            className="btn btn-rechazar"
            onClick={onClose}
            disabled={guardando}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
