import "../styles/System.css";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PAGE_LIMIT = 20; // <= máximo de registros a mostrar

export default function System() {
  // ---------------- Estado principal ----------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // system row
  const [institucion, setInstitucion] = useState("");
  const [zona, setZona] = useState("");
  const [idioma, setIdioma] = useState("");
  const [formato, setFormato] = useState("");
  const [version, setVersion] = useState("");
  const [estado, setEstado] = useState("ok");
  const [ultimaAct, setUltimaAct] = useState(null);
  const [ultimoBackup, setUltimoBackup] = useState(null);
  const [backupTarget, setBackupTarget] = useState("");

  // notificaciones
  const [emails, setEmails] = useState([]);
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [notificar, setNotificar] = useState(false);
  const [urgente, setUrgente] = useState(false);

  // ---------- cargar configuración ----------
  async function loadSystem() {
    try {
      setLoading(true);
      setErr(""); setOk("");
      const { data, error } = await supabase.rpc("admin_get_system");
      if (error) throw error;

      setInstitucion(data?.institucion || "");
      setZona(data?.zona_horaria || "");
      setIdioma(data?.idioma || "");
      setFormato(data?.formato_fecha || "");
      setVersion(data?.version || "");
      setEstado(data?.estado || "ok");
      setUltimaAct(data?.ultima_actualizacion || data?.updated_at || null);
      setUltimoBackup(data?.ultimo_backup_at || null);
      setBackupTarget(data?.backup_target || "");

      setNotificar(!!data?.notificar);
      setUrgente(!!data?.notificar_urgente);
      setEmails(Array.isArray(data?.emails) ? data.emails : []);
    } catch (e) {
      setErr(e.message || "No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSystem(); }, []);

  // --------- acciones: emails ---------
  const agregarEmail = () => {
    const v = nuevoEmail.trim();
    if (!v) return;
    if (!emails.includes(v)) setEmails((prev) => [...prev, v]);
    setNuevoEmail("");
  };
  const eliminarEmail = (i) => {
    setEmails((prev) => prev.filter((_, idx) => idx !== i));
  };

  // --------- guardar configuración ---------
  async function guardarConfig() {
    try {
      setSaving(true);
      setErr(""); setOk("");

      const patch = {
        institucion,
        zona_horaria: zona,
        idioma,
        formato_fecha: formato,
        version,
        estado,
        backup_target: backupTarget,
        notificar,
        emails,
        notificar_urgente: urgente,
      };

      const { data, error } = await supabase.rpc("admin_update_system", { p_patch: patch });
      if (error) throw error;

      setOk("✅ Configuración guardada");
      setUltimaAct(data?.ultima_actualizacion || data?.updated_at || null);
    } catch (e) {
      setErr(e.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  // --------- backup manual ---------
  async function handleGuardarBackup() {
    try {
      setSaving(true);
      setErr(""); setOk("");
      const { error } = await supabase.rpc("admin_trigger_backup", { p_target: backupTarget || "default" });
      if (error) throw error;
      setOk("🗄️ Backup realizado");
      await loadSystem();
    } catch (e) {
      setErr(e.message || "No se pudo realizar el backup");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------- Eventos (logs) --------------------------
  const [levelFilter, setLevelFilter] = useState("all"); // all | info | warn | error
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState([]);
  const [evLoading, setEvLoading] = useState(false);

  async function loadEvents() {
    try {
      setEvLoading(true);
      const p_level = levelFilter === "all" ? null : levelFilter;
      const { data, error } = await supabase.rpc("admin_list_logs", {
        p_q: query || null,
        p_level,
        p_limit: PAGE_LIMIT, 
        p_offset: 0,
      });
      if (error) throw error;
      setEvents(Array.isArray(data) ? data.slice(0, PAGE_LIMIT) : []); // <= doble seguridad
    } catch {
      // ignorar
    } finally {
      setEvLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, [levelFilter, query]);

  const filteredEvents = useMemo(
    () => (Array.isArray(events) ? events.slice(0, PAGE_LIMIT) : []),
    [events]
  );

  // ---------------------------- UI ----------------------------
  return (
    <div className="sistema-container">
      {/* Columna izquierda ------------------------------------------------ */}
      <section className="sistema-left">
        <div className="card config">
          <h3>⚙️ Configuración del Sistema</h3>

          {err && <div className="alert alert--error">{err}</div>}
          {ok  && <div className="alert alert--ok">{ok}</div>}

          <label>Nombre de la Institución</label>
          <input value={institucion} onChange={e=>setInstitucion(e.target.value)} disabled={loading||saving} />

          <label>Zona Horaria</label>
          <select value={zona} onChange={e=>setZona(e.target.value)} disabled={loading||saving}>
            <option value="UTC-04:00 Bolivia">UTC-04:00 Bolivia</option>
            <option value="UTC-03:00 Argentina">UTC-03:00 Argentina</option>
            <option value="UTC-05:00 Colombia/Perú">UTC-05:00 Colombia/Perú</option>
          </select>

          <label>Idioma</label>
          <select value={idioma} onChange={e=>setIdioma(e.target.value)} disabled={loading||saving}>
            <option>Español</option>
            <option>Português</option>
          </select>

          <label>Formato de Fecha</label>
          <select value={formato} onChange={e=>setFormato(e.target.value)} disabled={loading||saving}>
            <option>DD/MM/YYYY</option>
            <option>MM/DD/YYYY</option>
            <option>YYYY-MM-DD</option>
          </select>

          <div style={{marginTop:12, display:'flex', gap:8}}>
            <button className="btn-primary" onClick={guardarConfig} disabled={loading||saving}>
              {saving ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </div>

        <div className="card notificaciones">
          <h3>📧 Notificaciones por Email</h3>

          <div className="toggle">
            <span>Notificar</span>
            <input type="checkbox" checked={notificar} onChange={()=>setNotificar(v=>!v)} disabled={saving}/>
          </div>

          <div className="email-add">
            <input
              placeholder="Adicionar gmail"
              value={nuevoEmail}
              onChange={(e) => setNuevoEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarEmail()}
              disabled={saving}
            />
            <button onClick={agregarEmail} disabled={saving}>+</button>
          </div>

          <ul className="email-lista">
            {emails.map((email, index) => (
              <li key={email + index}>
                {email}
                <button onClick={() => eliminarEmail(index)} disabled={saving}>x</button>
              </li>
            ))}
          </ul>

          <div className="toggle urgente">
            <span>Notificar Asunto Urgente</span>
            <input type="checkbox" checked={urgente} onChange={()=>setUrgente(v=>!v)} disabled={saving}/>
          </div>
        </div>
      </section>

      {/* Columna derecha -------------------------------------------------- */}
      <aside className="sistema-right">
        <div className="card sistema-info">
          <h3>🧾 Información del Sistema</h3>

          <label>Versión</label>
          <input value={version} onChange={e=>setVersion(e.target.value)} disabled={saving}/>

          <label>Última Actualización</label>
          <input value={ultimaAct ? new Date(ultimaAct).toLocaleString() : "—"} disabled />

          <label>Estado</label>
          <select value={estado} onChange={e=>setEstado(e.target.value)} disabled={saving}>
            <option value="ok">SISTEMA ACTUALIZADO</option>
            <option value="warn">ADVERTENCIAS</option>
            <option value="error">ERROR</option>
          </select>

          <label>Último Backup</label>
          <input value={ultimoBackup ? new Date(ultimoBackup).toLocaleString() : "—"} disabled />

          <label>Destino de Backup</label>
          <input value={backupTarget} onChange={e=>setBackupTarget(e.target.value)} disabled={saving}/>

          <button className="btn-backup" onClick={handleGuardarBackup} disabled={saving}>
            🔒 Realizar Copia de Seguridad
          </button>
        </div>

        {/* ---------- EVENTOS DEL SISTEMA (panel con altura fija + scroll) ----------- */}
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
              {evLoading && <li className="eventos-empty">Cargando…</li>}
              {!evLoading && filteredEvents.length === 0 && (
                <li className="eventos-empty">Sin resultados</li>
              )}

              {!evLoading && filteredEvents.map((e) => (
                <li key={e.id} className="eventos-row">
                  <span className="mono">{new Date(e.ts).toLocaleString()}</span>
                  <span className="cut">{e.usuario}</span>
                  <span><span className={`chip ${e.nivel}`}>{e.nivel}</span></span>
                  <span className="mono cut">{e.accion}</span>
                  <span className="cut">{e.detalle}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="eventos-foot">
            <span>Ultimos {filteredEvents.length} logs </span>
            {/* Si luego quieres paginar, aquí va un botón "Ver más" */}
          </div>
        </div>
      </aside>
    </div>
  );
}
