import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/ModalUsuario.css";

// Abreviaciones de CI
const CI_EXTS = ["LP", "SC", "CB", "OR", "PT", "CH", "TJ", "BE", "PA"];
const NIVEL_ACADEMICO = [
  "Bachiller",
  "Técnico medio",
  "Técnico superior",
  "Licenciatura",
  "Diplomado",
  "Maestría",
  "Doctorado",
];
const TURNOS = ["Mañana", "Tarde", "Noche", "Horario completo", "Rotativo"];

function splitCI(ciText) {
  if (!ciText) return { num: "", ext: "LP" };
  const m = String(ciText).trim().match(/^(\S+)\s+([A-Za-z]{1,3})$/);
  return m ? { num: m[1], ext: m[2].toUpperCase() } : { num: String(ciText), ext: "LP" };
}

export default function ModalUsuario({
  modo = "crear",           // "crear" | "editar" | "ver" (este archivo cubre crear/editar)
  usuario = {},
  onClose,
  onCreated,
  onUpdated,
}) {
  const isCrear  = modo === "crear";
  const isEditar = modo === "editar";

  const titulo = isCrear ? "Registrar usuario" : "Editar usuario";
  const subtitulo = isCrear
    ? "Complete los datos del nuevo miembro del equipo"
    : "Puedes actualizar datos, rol, estado y la foto de perfil.";

  // CI desglosado desde el usuario entrante
  const { num: ci_num_init, ext: ci_ext_init } = splitCI(usuario?.ci);

  // --------- state principal ----------
  const [form, setForm] = useState({
    id: usuario?.id ?? null,
    nombre: usuario?.nombre ?? "",
    email: usuario?.email ?? "",
    password: "",
    rol: usuario?.rol ?? "operador",
    estado: usuario?.estado ?? "disponible",

    // ficha profesional
    ci_num: ci_num_init,
    ci_ext: ci_ext_init,
    telefono: usuario?.telefono ?? "",
    direccion: usuario?.direccion ?? "",
    fecha_nacimiento: usuario?.fecha_nacimiento ?? "",
    especialidad: usuario?.especialidad ?? "",
    matricula: usuario?.matricula ?? "",
    institucion: usuario?.institucion ?? "",
    fecha_graduacion: usuario?.fecha_graduacion ?? "",
    nivel: usuario?.nivel ?? "",
    turno: usuario?.turno ?? "",
    disponibilidad: usuario?.disponibilidad ?? "Disponible",

    avatar_url: usuario?.avatar_url ?? null,
  });

  // Rehidratar al cambiar usuario/modo
  useEffect(() => {
    const { num, ext } = splitCI(usuario?.ci);
    setForm((prev) => ({
      ...prev,
      id: usuario?.id ?? null,
      nombre: usuario?.nombre ?? "",
      email: usuario?.email ?? "",
      rol: usuario?.rol ?? "operador",
      estado: usuario?.estado ?? "disponible",
      ci_num: num,
      ci_ext: ext,
      telefono: usuario?.telefono ?? "",
      direccion: usuario?.direccion ?? "",
      fecha_nacimiento: usuario?.fecha_nacimiento ?? "",
      especialidad: usuario?.especialidad ?? "",
      matricula: usuario?.matricula ?? "",
      institucion: usuario?.institucion ?? "",
      fecha_graduacion: usuario?.fecha_graduacion ?? "",
      nivel: usuario?.nivel ?? "",
      turno: usuario?.turno ?? "",
      disponibilidad: usuario?.disponibilidad ?? "Disponible",
      avatar_url: usuario?.avatar_url ?? null,
    }));
    setAvatarPreview(usuario?.avatar_url || "");
    setAvatarFile(null);
  }, [usuario, modo]);

  // --------- validaciones ----------
  const errs = useMemo(() => {
    const e = {};
    const email = form.email?.trim();
    const nombre = form.nombre?.trim();
    if (!nombre) e.nombre = "El nombre es obligatorio.";
    if (!email) e.email = "El email es obligatorio.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "El email no es válido.";
    if (isCrear) {
      if (!form.password) e.password = "La contraseña es obligatoria.";
      else if (form.password.length < 8) e.password = "Mínimo 8 caracteres.";
    }
    return e;
  }, [form, isCrear]);

  const puedeGuardar = Object.keys(errs).length === 0;

  // --------- avatar: input, preview y subida ----------
  const fileRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState(usuario?.avatar_url || "");
  const [avatarFile, setAvatarFile] = useState(null);

  const openPicker = () => fileRef.current?.click();
  const onPickAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    const url = URL.createObjectURL(f);
    setAvatarPreview(url);
  };

  async function uploadAvatar(userId) {
    if (!avatarFile) return null;
    const ext  = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `users/${userId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, {
        upsert: true,
        cacheControl: "3600",
        contentType: avatarFile.type || "image/*",
      });

    if (upErr) throw new Error(upErr.message);

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  // --------- helpers ----------
  const buildPerfilPayload = (extra = {}) => ({
    ci: [form.ci_num, form.ci_ext].filter(Boolean).join(" ").trim() || null,
    telefono: form.telefono || null,
    direccion: form.direccion || null,
    fecha_nacimiento: form.fecha_nacimiento || null,
    especialidad: form.especialidad || null,
    matricula: form.matricula || null,
    institucion: form.institucion || null,
    fecha_graduacion: form.fecha_graduacion || null,
    nivel: form.nivel || null,
    turno: form.turno || null,
    disponibilidad: form.disponibilidad || null,
    ...extra,
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const closeOnEsc = useCallback(
    (ev) => { if (ev.key === "Escape" && !guardando) onClose?.(); },
    [guardando, onClose]
  );
  useEffect(() => {
    document.addEventListener("keydown", closeOnEsc);
    return () => document.removeEventListener("keydown", closeOnEsc);
  }, [closeOnEsc]);

  // --------- acciones ----------
  async function handleCrear() {
    try {
      setGuardando(true);
      setError(""); setOkMsg("");
      if (!puedeGuardar) { setError("Revisa los campos marcados."); return; }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("No hay sesión activa.");

      // 1) crear usuario vía Edge Function
      const payload = {
        email: form.email.trim(),
        password: form.password,
        nombre: form.nombre.trim(),
        rol: form.rol,
        estado: form.estado,
        perfil: buildPerfilPayload(), // sin avatar aún
      };
      const { data, error } = await supabase.functions.invoke("create-staff", {
        body: payload,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;

      // obtener id del nuevo usuario
      let newId = data?.id;
      if (!newId) {
        // fallback por si la function no lo devolviera
        const { data: row } = await supabase
          .from("app_users").select("id").eq("email", form.email.trim()).maybeSingle();
        newId = row?.id;
      }
      if (!newId) throw new Error("No se pudo obtener el id del nuevo usuario.");

      // 2) si hay avatar: subir y actualizar perfil
      if (avatarFile) {
        const publicUrl = await uploadAvatar(newId);
        if (publicUrl) {
          const { error: rpcErr } = await supabase.rpc("admin_upsert_profile", {
            p_user_id: newId,
            p_profile: { avatar_url: publicUrl },
          });
          if (rpcErr) throw new Error(rpcErr.message);
        }
      }

      setOkMsg("✅ Usuario creado correctamente");
      onCreated?.();
      onClose?.();
    } catch (e) {
      setError(e.message || "Ocurrió un error");
    } finally {
      setGuardando(false);
    }
  }

  async function handleEditar() {
    try {
      setGuardando(true);
      setError(""); setOkMsg("");
      if (!form.id) throw new Error("Falta el id del usuario.");

      // 1) nombre
      if (form.nombre !== (usuario?.nombre ?? "")) {
        const { error } = await supabase.rpc("admin_update_user", {
          p_user_id: form.id,
          updates: { nombre: form.nombre.trim() },
        });
        if (error) throw new Error(error.message);
      }

      // 2) rol
      if (form.rol !== usuario?.rol) {
        const { error } = await supabase.rpc("admin_change_role", {
          p_user_id: form.id,
          p_new_role: form.rol,
        });
        if (error) throw new Error(error.message);
      }

      // 3) estado
      if (form.estado !== usuario?.estado) {
        const { error } = await supabase.rpc("admin_change_status", {
          p_user_id: form.id,
          p_new_status: form.estado,
        });
        if (error) throw new Error(error.message);
      }

      // 4) perfil + posible avatar
      let extra = {};
      if (avatarFile) {
        const publicUrl = await uploadAvatar(form.id);
        if (publicUrl) extra.avatar_url = publicUrl;
      }
      const p_profile = buildPerfilPayload(extra);
      const { error: upErr } = await supabase.rpc("admin_upsert_profile", {
        p_user_id: form.id,
        p_profile,
      });
      if (upErr) throw new Error(upErr.message);

      setOkMsg("✅ Cambios guardados");
      onUpdated?.();
      onClose?.();
    } catch (e) {
      setError(e.message || "Ocurrió un error");
    } finally {
      setGuardando(false);
    }
  }

  // --------- render ----------
  return (
    <div className="modal-overlay" onClick={() => !guardando && onClose?.()} aria-modal="true" role="dialog">
      <div className="modal-usuario" onClick={(e) => e.stopPropagation()} aria-labelledby="modal-title">
        <div className="modal-header">
          <h3 id="modal-title">{titulo}</h3>
          <button className="modal-close" aria-label="Cerrar" onClick={() => !guardando && onClose?.()}>✕</button>
        </div>
        <p className="modal-subtitle">{subtitulo}</p>

        {/* Header + avatar */}
        <div className="usuario-header">
          <img src={avatarPreview || form.avatar_url || "/avatar.png"} alt="avatar" />
          <div>
            <strong>{form.nombre || "—"}</strong>
            <div>{form.email || "—"}</div>
          </div>
          <button type="button" className="btn-secundario" onClick={openPicker} disabled={guardando}>
            Seleccionar foto
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={onPickAvatar}
          />
        </div>

        {/* ===== Acceso ===== */}
        <section className="section-card">
          <h4 className="section-heading">Acceso</h4>
          <div className="form-grid">
            <div className="col">
              <label>Nombre</label>
              <input
                name="nombre"
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                disabled={guardando}
              />
              {errs.nombre && <div className="field-err">{errs.nombre}</div>}
            </div>

            <div className="col">
              <label>Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                disabled={!isCrear || guardando}
              />
              {isCrear && errs.email && <div className="field-err">{errs.email}</div>}
            </div>

            {isCrear && (
              <div className="col">
                <label>Contraseña</label>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  disabled={guardando}
                />
                {errs.password && <div className="field-err">{errs.password}</div>}
              </div>
            )}

            <div className="col">
              <label>Rol</label>
              <select
                name="rol"
                value={form.rol}
                onChange={(e) => setForm((p) => ({ ...p, rol: e.target.value }))}
                disabled={guardando}
              >
                <option value="administrador">Administrador</option>
                <option value="encargado">Encargado</option>
                <option value="operador">Operador</option>
                <option value="secretario">Secretario</option>
              </select>
            </div>

            <div className="col">
              <label>Estado (Acceso)</label>
              <select
                name="estado"
                value={form.estado}
                onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))}
                disabled={guardando}
              >
                <option value="disponible">disponible</option>
                <option value="ocupado">ocupado</option>
                <option value="inactivo">inactivo</option>
                <option value="bloqueado">bloqueado</option>
                <option value="suspendido">suspendido</option>
                <option value="eliminado">eliminado</option>
              </select>
            </div>
          </div>
        </section>

        {/* ===== Ficha profesional ===== */}
        <section className="section-card">
          <h4 className="section-heading">Ficha profesional</h4>
          <div className="form-grid">
            <div className="col">
              <label>CI</label>
              <div className="ci-row">
                <input
                  name="ci_num"
                  placeholder="Número"
                  value={form.ci_num}
                  onChange={(e) => setForm((p) => ({ ...p, ci_num: e.target.value }))}
                  disabled={guardando}
                />
                <select
                  name="ci_ext"
                  className="ci-ext"
                  value={form.ci_ext}
                  onChange={(e) => setForm((p) => ({ ...p, ci_ext: e.target.value }))}
                  disabled={guardando}
                >
                  {CI_EXTS.map((ab) => <option key={ab} value={ab}>{ab}</option>)}
                </select>
              </div>
            </div>

            <div className="col">
              <label>Teléfono</label>
              <input
                name="telefono"
                value={form.telefono}
                onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                disabled={guardando}
              />
            </div>

            <div className="col">
              <label>Dirección domicilio</label>
              <input
                name="direccion"
                value={form.direccion}
                onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))}
                disabled={guardando}
              />
            </div>

            <div className="col">
              <label>Fecha nacimiento</label>
              <input
                name="fecha_nacimiento"
                type="date"
                value={form.fecha_nacimiento || ""}
                onChange={(e) => setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                disabled={guardando}
              />
            </div>

            <div className="col">
              <label>Especialidad</label>
              <select
                name="especialidad"
                value={form.especialidad}
                onChange={(e) => setForm((p) => ({ ...p, especialidad: e.target.value }))}
                disabled={guardando}
              >
                <option value="">Seleccione</option>
                <option value="clinico">Clínico</option>
                <option value="forense">Forense</option>
                <option value="educativo">Educativo</option>
                <option value="social">Social</option>
              </select>
            </div>

            <div className="col">
              <label>N° matrícula profesional</label>
              <input
                name="matricula"
                value={form.matricula}
                onChange={(e) => setForm((p) => ({ ...p, matricula: e.target.value }))}
                disabled={guardando}
              />
            </div>

            <div className="col">
              <label>Institución de titulación</label>
              <input
                name="institucion"
                value={form.institucion}
                onChange={(e) => setForm((p) => ({ ...p, institucion: e.target.value }))}
                disabled={guardando}
              />
            </div>

            <div className="col">
              <label>Fecha de graduación</label>
              <input
                name="fecha_graduacion"
                type="date"
                value={form.fecha_graduacion || ""}
                onChange={(e) => setForm((p) => ({ ...p, fecha_graduacion: e.target.value }))}
                disabled={guardando}
              />
            </div>

            <div className="col">
              <label>Nivel académico</label>
              <select
                name="nivel"
                value={form.nivel}
                onChange={(e) => setForm((p) => ({ ...p, nivel: e.target.value }))}
                disabled={guardando}
              >
                <option value="">Seleccione</option>
                {NIVEL_ACADEMICO.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="col">
              <label>Turno</label>
              <select
                name="turno"
                value={form.turno}
                onChange={(e) => setForm((p) => ({ ...p, turno: e.target.value }))}
                disabled={guardando}
              >
                <option value="">Seleccione</option>
                {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="col">
              <label>Disponibilidad (operativa)</label>
              <select
                name="disponibilidad"
                value={form.disponibilidad}
                onChange={(e) => setForm((p) => ({ ...p, disponibilidad: e.target.value }))}
                disabled={guardando}
              >
                <option>Disponible</option>
                <option>Ocupado</option>
                <option>Inactivo</option>
              </select>
            </div>
          </div>
        </section>

        {error && <div className="alert alert--error">{error}</div>}
        {okMsg && <div className="alert alert--ok">{okMsg}</div>}

        <div className="modal-actions">
          {isCrear ? (
            <button className="btn btn-aceptar" onClick={handleCrear} disabled={!puedeGuardar || guardando}>
              {guardando ? "Creando…" : "Crear usuario"}
            </button>
          ) : (
            <button className="btn btn-aceptar" onClick={handleEditar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
          <button className="btn btn-rechazar" onClick={onClose} disabled={guardando}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
