import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/ModalUsuario.css";

/* ===================== helper: invocar Edge Function con errores legibles ===================== */
async function invokeEdge(name, body, token) {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    let msg = error.message || "Fallo desconocido en Edge Function";
    try {
      const resp = error?.context?.response;
      if (resp && typeof resp.text === "function") {
        const raw = await resp.text();
        if (raw) {
          try { msg = JSON.parse(raw)?.error ?? JSON.parse(raw)?.detail ?? raw; }
          catch { msg = raw; }
        }
      } else if (error?.context?.body && typeof error.context.body === "object") {
        const b = error.context.body;
        msg = b?.error || b?.detail || b?.message || msg;
      }
    } catch {}
    const code = error?.context?.response?.status;
    throw new Error(code ? `[${code}] ${msg}` : msg);
  }
  return data;
}

/* ===================== datos auxiliares ===================== */
const CI_EXTS = ["LP", "SC", "CB", "OR", "PT", "CH", "TJ", "BE", "PA"];
const NIVEL_ACADEMICO = ["Bachiller","Técnico medio","Técnico superior","Licenciatura","Diplomado","Maestría","Doctorado"];
const TURNOS = ["Mañana","Tarde","Noche","Horario completo","Rotativo"];

function splitCI(ciText) {
  if (!ciText) return { num: "", ext: "LP" };
  const m = String(ciText).trim().match(/^(\S+)\s+([A-Za-z]{1,3})$/);
  return m ? { num: m[1], ext: m[2].toUpperCase() } : { num: String(ciText), ext: "LP" };
}

export default function ModalUsuario({
  modo = "crear",    // "crear" | "editar"
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
    : "Puedes actualizar datos, rol, estado, contraseña y la foto de perfil.";

  const { num: ci_num_init, ext: ci_ext_init } = splitCI(usuario?.ci);

  /* ===================== state ===================== */
  const [form, setForm] = useState({
    id: usuario?.id ?? null,
    nombre: usuario?.nombre ?? "",
    email: usuario?.email ?? "",
    rol: usuario?.rol ?? "operador",
    estado: usuario?.estado ?? "verificacion", // por defecto al crear
    password: "",           // crear
    new_password: "",       // editar

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
    avatar_url: usuario?.avatar_url ?? null,
  });

  useEffect(() => {
    const { num, ext } = splitCI(usuario?.ci);
    setForm((prev) => ({
      ...prev,
      id: usuario?.id ?? null,
      nombre: usuario?.nombre ?? "",
      email: usuario?.email ?? "",
      rol: usuario?.rol ?? "operador",
      estado: usuario?.estado ?? "verificacion",
      password: "",
      new_password: "",
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
      avatar_url: usuario?.avatar_url ?? null,
    }));
    setAvatarPreview(usuario?.avatar_url || "");
    setAvatarFile(null);
  }, [usuario, modo]);

  /* ===================== validaciones ===================== */
  const errs = useMemo(() => {
    const e = {};
    const email = form.email?.trim();
    const nombre = form.nombre?.trim();
    if (!nombre) e.nombre = true;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) e.email = true;
    if (isCrear) {
      if (!form.password || form.password.length < 8) e.password = true;
    } else {
      if (form.new_password && form.new_password.length < 8) e.new_password = true;
    }
    return e;
  }, [form, isCrear]);

  const invalid   = (f) => (errs[f] ? "invalid" : "");
  const reqBadge  = (f) => (errs[f] ? <span className="req-badge">Obligatorio</span> : null);
  const puedeGuardar = Object.keys(errs).length === 0;

  /* ===================== avatar ===================== */
  const fileRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState(usuario?.avatar_url || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const openPicker = () => fileRef.current?.click();
  const onPickAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  async function uploadAvatar(userId) {
    if (!avatarFile) return null;
    const ext  = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `users/${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, cacheControl: "3600", contentType: avatarFile.type || "image/*" });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  /* ===================== util perfil ===================== */
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

  /* ===================== crear ===================== */
  async function handleCrear() {
    try {
      setGuardando(true); setError(""); setOkMsg("");
      if (!puedeGuardar) { setError("Completa los campos obligatorios."); return; }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("No hay sesión activa.");

      const payload = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        nombre: form.nombre.trim(),
        rol: form.rol,
        perfil: buildPerfilPayload(),
        redirectTo: `${window.location.origin}/login`,
      };

      const res = await invokeEdge("create-staff", payload, session.access_token);
      const parsed = typeof res === "string" ? (()=>{ try { return JSON.parse(res) } catch { return {} } })() : res;
      const newId = parsed?.id;
      if (!newId) throw new Error("No se pudo obtener el id del nuevo usuario.");

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

      setOkMsg("✅ Usuario creado e invitación enviada. Debe verificar su email.");
      onCreated?.();
      onClose?.();
    } catch (e) {
      setError(e.message || "Ocurrió un error");
    } finally {
      setGuardando(false);
    }
  }

  /* ===================== editar ===================== */
  async function handleEditar() {
    try {
      setGuardando(true); setError(""); setOkMsg("");
      if (!form.id) throw new Error("Falta el id del usuario.");

      // nombre
      if (form.nombre !== (usuario?.nombre ?? "")) {
        const { error } = await supabase.rpc("admin_update_user", {
          p_user_id: form.id, updates: { nombre: form.nombre.trim() },
        });
        if (error) throw new Error(error.message);
      }

      // rol
      if (form.rol !== usuario?.rol) {
        const { error } = await supabase.rpc("admin_change_role", {
          p_user_id: form.id, p_new_role: form.rol,
        });
        if (error) throw new Error(error.message);
      }

      // estado (solo disponible/suspendido)
      if (form.estado !== usuario?.estado) {
        const { error } = await supabase.rpc("admin_change_status", {
          p_user_id: form.id, p_new_status: form.estado,
        });
        if (error) throw new Error(error.message);
      }

      // nueva contraseña (opcional)
      if (form.new_password) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No hay sesión activa.");
        await invokeEdge(
          "set-staff-password",
          { user_id: form.id, new_password: form.new_password },
          session.access_token
        );
      }

      // perfil + avatar
      let extra = {};
      if (avatarFile) {
        const publicUrl = await uploadAvatar(form.id);
        if (publicUrl) extra = { avatar_url: publicUrl };
      }
      const p_profile = buildPerfilPayload(extra);
      const { error: upErr } = await supabase.rpc("admin_upsert_profile", {
        p_user_id: form.id, p_profile,
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

  /* ===================== toggles de password ===================== */
  const [showPassCreate, setShowPassCreate] = useState(false);
  const [showPassEdit, setShowPassEdit] = useState(false);

  /* ===================== render ===================== */
  return (
    <div className="modal-overlay" onClick={() => !guardando && onClose?.()} aria-modal="true" role="dialog">
      <div className="modal-usuario" onClick={(e) => e.stopPropagation()} aria-labelledby="modal-title">
        <div className="modal-header sticky-top">
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
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickAvatar} />
        </div>

        <div className="modal-body">
          {/* ===== Acceso ===== */}
          <section className="section-card">
            <h4 className="section-heading">Acceso</h4>
            <div className="form-grid">
              <div className="col">
                <label className={errs.nombre ? "label-required" : ""}>
                  Nombre {reqBadge("nombre")}
                </label>
                <input
                  className={invalid("nombre")}
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  disabled={guardando}
                />
              </div>

              <div className="col">
                <label className={errs.email ? "label-required" : ""}>
                  Email {reqBadge("email")}
                </label>
                <input
                  className={invalid("email")}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  disabled={!isCrear || guardando}
                />
              </div>

              {/* === ROL (crear y editar) === */}
              <div className="col">
                <label>Rol</label>
                <select
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

              {isCrear ? (
                <>
                  <div className="col">
                    <label className={errs.password ? "label-required" : ""}>
                      Contraseña {reqBadge("password")}
                    </label>
                    <div className="input-with-toggle">
                      <input
                        className={invalid("password")}
                        type={showPassCreate ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                        disabled={guardando}
                        placeholder="Mínimo 8 caracteres"
                        autoComplete="new-password"
                      />
                      <button type="button" className="toggle-eye" onClick={() => setShowPassCreate(v => !v)} tabIndex={-1}>
                        {showPassCreate ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>

                  <div className="col">
                    <label>Estado (Acceso)</label>
                    <input value="verificacion" disabled />
                  </div>
                </>
              ) : (
                <>
                  <div className="col">
                    <label>Estado (Acceso)</label>
                    <select
                      value={form.estado}
                      onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))}
                      disabled={guardando}
                    >
                      <option value="disponible">disponible</option>
                      <option value="suspendido">suspendido</option>
                    </select>
                  </div>

                  <div className="col">
                    <label className={errs.new_password ? "label-required" : ""}>
                      Nueva contraseña (opcional) {errs.new_password && <span className="req-badge">Mín. 8</span>}
                    </label>
                    <div className="input-with-toggle">
                      <input
                        className={invalid("new_password")}
                        type={showPassEdit ? "text" : "password"}
                        value={form.new_password}
                        onChange={(e) => setForm((p) => ({ ...p, new_password: e.target.value }))}
                        disabled={guardando}
                        placeholder="Dejar vacío para no cambiar"
                        autoComplete="new-password"
                      />
                      <button type="button" className="toggle-eye" onClick={() => setShowPassEdit(v => !v)} tabIndex={-1}>
                        {showPassEdit ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>
                </>
              )}
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
                    placeholder="Número"
                    value={form.ci_num}
                    onChange={(e) => setForm((p) => ({ ...p, ci_num: e.target.value }))}
                    disabled={guardando}
                  />
                  <select
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
                <input value={form.telefono} onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))} disabled={guardando} />
              </div>

              <div className="col">
                <label>Dirección domicilio</label>
                <input value={form.direccion} onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))} disabled={guardando} />
              </div>

              <div className="col">
                <label>Fecha nacimiento</label>
                <input type="date" value={form.fecha_nacimiento || ""} onChange={(e) => setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))} disabled={guardando} />
              </div>

              <div className="col">
                <label>Especialidad</label>
                <select value={form.especialidad} onChange={(e) => setForm((p) => ({ ...p, especialidad: e.target.value }))} disabled={guardando}>
                  <option value="">Seleccione</option>
                  <option value="clinico">Clínico</option>
                  <option value="forense">Forense</option>
                  <option value="educativo">Educativo</option>
                  <option value="social">Social</option>
                </select>
              </div>

              <div className="col">
                <label>N° matrícula profesional</label>
                <input value={form.matricula} onChange={(e) => setForm((p) => ({ ...p, matricula: e.target.value }))} disabled={guardando} />
              </div>

              <div className="col">
                <label>Institución de titulación</label>
                <input value={form.institucion} onChange={(e) => setForm((p) => ({ ...p, institucion: e.target.value }))} disabled={guardando} />
              </div>

              <div className="col">
                <label>Fecha de graduación</label>
                <input type="date" value={form.fecha_graduacion || ""} onChange={(e) => setForm((p) => ({ ...p, fecha_graduacion: e.target.value }))} disabled={guardando} />
              </div>

              <div className="col">
                <label>Nivel académico</label>
                <select value={form.nivel} onChange={(e) => setForm((p) => ({ ...p, nivel: e.target.value }))} disabled={guardando}>
                  <option value="">Seleccione</option>
                  {NIVEL_ACADEMICO.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="col">
                <label>Turno</label>
                <select value={form.turno} onChange={(e) => setForm((p) => ({ ...p, turno: e.target.value }))} disabled={guardando}>
                  <option value="">Seleccione</option>
                  {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </section>

          {error && <div className="alert alert--error">{error}</div>}
          {okMsg && <div className="alert alert--ok">{okMsg}</div>}
        </div>

        <div className="modal-actions sticky-bottom">
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
