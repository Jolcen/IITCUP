// src/components/ModalEvaluacion.jsx
import "../styles/ModalEvaluacion.css";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const GENEROS      = ["Masculino", "Femenino", "Otro"];
const NIVELES      = ["Primaria", "Secundaria", "Superior"];
const OCUPACIONES  = ["Desempleado", "Estudiante", "Obrero", "Otro"];
const ANTECEDENTES = ["Violencia", "Abuso", "Delito"];

/**
 * Props:
 * - mode: "create" | "view" | "edit"  (default "create")
 * - initialCase: fila de public.casos cuando mode es "view" o "edit"
 * - onClose: fn
 * - onSaved: fn
 */
export default function ModalEvaluacion({
  mode = "create",
  initialCase = null,
  onClose,
  onSaved,
}) {
  const isCreate = mode === "create";
  const isEdit   = mode === "edit";
  const isView   = mode === "view";
  const readOnly = isView;

  const [form, setForm] = useState({
    nombre: "",
    ci: "",
    fechaNacimiento: "",
    genero: "",
    nivel: "",
    ocupacion: "",
    antecedentes: "",
    contexto: "",
    operadorId: "", // public.casos.asignado_a
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // Prefill cuando hay caso (view/edit)
  useEffect(() => {
    if (!initialCase) return;
    setForm({
      nombre:          initialCase.paciente_nombre   ?? "",
      ci:              initialCase.paciente_ci       ?? "",
      fechaNacimiento: initialCase.fecha_nacimiento  ?? "",
      genero:          initialCase.genero            ?? "",
      nivel:           initialCase.nivel_educativo   ?? "",
      ocupacion:       initialCase.ocupacion         ?? "",
      antecedentes:    initialCase.antecedentes      ?? "",
      contexto:        initialCase.motivacion        ?? "",
      operadorId:      initialCase.asignado_a        ?? "",
    });
  }, [initialCase]);

  // ---------- Operadores ----------
  const [operadores, setOperadores]   = useState([]);
  const [cargandoOps, setCargandoOps] = useState(true);

  useEffect(() => {
    // En "ver" no hace falta consultar operadores
    if (isView) {
      setOperadores([]);
      setCargandoOps(false);
      return;
    }

    let alive = true;

    const fetchOperadores = async () => {
      setCargandoOps(true);

      // 0) Si tienes RPC list_operadores_disponibles(), úsala:
      const rpc = await supabase.rpc("list_operadores_disponibles");
      let ops = rpc.data || [];
      const rpcOk = !rpc.error;

      // 1) Fallback: primero disponibles, luego todos si viene vacío
      if (!rpcOk) {
        const resp1 = await supabase
          .from("app_users")
          .select("id, nombre, email, rol, estado")
          .eq("rol", "operador")
          .eq("estado", "disponible")
          .order("nombre", { ascending: true });

        ops = resp1.data || [];

        if (!resp1.error && ops.length === 0) {
          const resp2 = await supabase
            .from("app_users")
            .select("id, nombre, email, rol, estado")
            .eq("rol", "operador")
            .order("nombre", { ascending: true });

          ops = resp2.data || [];
        }
      }

      if (!alive) return;

      // 2) Marca “ocupado” si tienen caso activo en evaluación
      const abiertos = await supabase
        .from("casos")
        .select("asignado_a, estado")
        .eq("estado", "en_evaluacion")
        .not("asignado_a", "is", null);

      const ocupados = new Set((abiertos.data || []).map(c => c.asignado_a));
      let list = (ops || []).map(o => ({ ...o, ocupado: ocupados.has(o.id) }));

      // 3) Si estoy en edición y el operador asignado no vino por filtros, lo agrego
      if (initialCase?.asignado_a && !list.some(o => o.id === initialCase.asignado_a)) {
        const me = await supabase
          .from("app_users")
          .select("id, nombre, email, rol, estado")
          .eq("id", initialCase.asignado_a)
          .maybeSingle();
        if (me.data) list = [{ ...me.data, ocupado: ocupados.has(me.data.id) }, ...list];
      }

      if (alive) {
        setOperadores(list);
        setCargandoOps(false);
      }
    };

    fetchOperadores();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isView, initialCase?.asignado_a]);

  // ---------- Validación ----------
  const puedeGuardar = useMemo(() => {
    if (readOnly) return true;
    if (!form.nombre.trim()) return false;
    if (!form.ci.trim()) return false;
    if (form.fechaNacimiento && isNaN(Date.parse(form.fechaNacimiento))) return false;
    return true;
  }, [form, readOnly]);

  // ---------- Handlers ----------
  function onChange(e) {
    if (readOnly) return;
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    if (readOnly) return;
    try {
      setSaving(true);
      setError("");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay sesión. Inicia sesión nuevamente.");

      const payload = {
        paciente_nombre:  form.nombre.trim(),
        paciente_ci:      form.ci.trim(),
        fecha_nacimiento: form.fechaNacimiento || null,
        genero:           form.genero || null,
        nivel_educativo:  form.nivel || null,
        ocupacion:        form.ocupacion || null,
        antecedentes:     form.antecedentes || null,
        motivacion:       form.contexto || null,
        asignado_a:       form.operadorId || null,
        ...(isCreate ? { creado_por: user.id } : {}),
      };

      let err = null;
      if (isCreate) {
        const { error } = await supabase.from("casos").insert(payload);
        err = error;
      } else if (isEdit && initialCase?.id) {
        const { error } = await supabase.from("casos")
          .update(payload)
          .eq("id", initialCase.id);
        err = error;
      }
      if (err) throw new Error(err.message);

      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const title = isCreate ? "Nueva evaluación" : isEdit ? "Editar evaluación" : "Detalle del caso";

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target.classList.contains("modal-overlay")) onClose?.(); }}
    >
      <div className="modal-form" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>

        <div className="sections">
          <div className="card">
            <div className="card-title">Datos del paciente</div>

            <div className="grid">
              <div className="field">
                <label>Nombre completo <span className="req">*</span></label>
                <input name="nombre" value={form.nombre} onChange={onChange} placeholder="Ej. Juan Pérez" disabled={readOnly} />
              </div>

              <div className="field">
                <label>CI <span className="req">*</span></label>
                <input name="ci" value={form.ci} onChange={onChange} placeholder="Ej. 1234567 LP" disabled={readOnly} />
              </div>

              <div className="field">
                <label>Fecha de nacimiento</label>
                <input type="date" name="fechaNacimiento" value={form.fechaNacimiento} onChange={onChange} disabled={readOnly} />
              </div>

              <div className="field">
                <label>Género</label>
                <select name="genero" value={form.genero} onChange={onChange} disabled={readOnly}>
                  <option value="">Seleccione</option>
                  {GENEROS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Nivel educativo</label>
                <select name="nivel" value={form.nivel} onChange={onChange} disabled={readOnly}>
                  <option value="">Seleccione</option>
                  {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Ocupación</label>
                <select name="ocupacion" value={form.ocupacion} onChange={onChange} disabled={readOnly}>
                  <option value="">Seleccione</option>
                  {OCUPACIONES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Antecedentes</label>
                <select name="antecedentes" value={form.antecedentes} onChange={onChange} disabled={readOnly}>
                  <option value="">Seleccione</option>
                  {ANTECEDENTES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="field span-2">
                <label>Contexto / Motivación</label>
                <textarea
                  name="contexto"
                  rows={4}
                  value={form.contexto}
                  onChange={onChange}
                  placeholder="Describe brevemente la motivación del caso…"
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          {!isView && (
            <div className="card">
              <div className="card-title">Asignación</div>
              <div className="grid">
                <div className="field">
                  <label>Operador responsable</label>
                  <select
                    name="operadorId"
                    value={form.operadorId}
                    onChange={onChange}
                    disabled={cargandoOps}
                  >
                    <option value="">— Sin asignar —</option>
                    {operadores.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.nombre || o.email}{o.ocupado ? " (ocupado)" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="hint">
                    Se muestran operadores <strong>disponibles</strong> (estado administrativo).
                    Si aparece “(ocupado)”, ya tienen un caso activo.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="alert-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-cancelar" onClick={onClose} disabled={saving}>
            {isView ? "Cerrar" : "Cancelar"}
          </button>
          {!isView && (
            <button
              className="btn-guardar"
              onClick={handleSave}
              disabled={!puedeGuardar || saving}
            >
              {saving ? "Guardando…" : (isCreate ? "Guardar" : "Guardar cambios")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
