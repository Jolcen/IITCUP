import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadAnexo } from "../services/uploadAnexo";
import "../styles/ModalBase.css";

// extensiones CI (Bolivia; ajusta si quieres)
const CI_EXT = ["LP","CB","SC","OR","PT","TJ","BE","PD","CH","OTRO"];

// selector de nivel educativo
const NIVELES = [
  "Primaria", "Secundaria",
  "Técnico", "Universitario",
  "Postgrado", "Otro"
];

export default function ModalPaciente({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    id: null,

    // CI
    doc_numero: "",
    doc_expedido: "LP",

    // Identidad
    nombres: "",
    apellidos: "",

    // Demográficos
    sexo: "",
    fecha_nacimiento: "",

    // Opcionales
    nivel_educativo: "",
    ocupacion: "",
    antecedentes: "",

    // Contacto (sin email)
    telefono: "",
    direccion: "",
  });

  // carnet (solo en creación exigimos ambos)
  const [carnetFront, setCarnetFront] = useState(null);
  const [carnetBack, setCarnetBack]   = useState(null);

  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!initial) return;
    const src = initial._row ?? initial;
    setForm(prev => ({
      ...prev,
      id: src.id ?? initial.id ?? null,
      doc_numero: src.doc_numero || "",
      doc_expedido: src.doc_expedido || "LP",
      nombres: src.nombres || initial.nombre || "",
      apellidos: src.apellidos || "",
      sexo: src.sexo || "",
      fecha_nacimiento: src.fecha_nacimiento || "",
      nivel_educativo: src.nivel_educativo || "",
      ocupacion: src.ocupacion || "",
      antecedentes: src.antecedentes || "",
      telefono: src?.contacto?.telefono || "",
      direccion: src?.contacto?.direccion || "",
    }));
  }, [initial]);

  const validar = () => {
    if (!form.nombres.trim()) return "Nombres es obligatorio";
    if (!form.doc_numero.trim()) return "Número de CI es obligatorio";
    if (!form.doc_expedido) return "Extensión de CI es obligatoria";
    if (!form.id) {
      if (!carnetFront) return "Debes subir la foto del carnet (anverso)";
      if (!carnetBack)  return "Debes subir la foto del carnet (reverso)";
      if (!carnetFront.type?.startsWith("image/") || !carnetBack.type?.startsWith("image/"))
        return "El carnet debe ser imágenes (JPG/PNG)";
    }
    return null;
  };

  const guardar = async () => {
    const err = validar();
    if (err) { alert(err); return; }

    setSaving(true);

    // payload 1:1 con columnas
    const payload = {
      doc_tipo: "CI", // fijamos CI por convención
      doc_numero: form.doc_numero || null,
      doc_expedido: form.doc_expedido || null,

      nombres: form.nombres || null,
      apellidos: form.apellidos || null,

      sexo: form.sexo || null,
      fecha_nacimiento: form.fecha_nacimiento || null,

      nivel_educativo: form.nivel_educativo || null,
      ocupacion: form.ocupacion || null,
      antecedentes: form.antecedentes || null,

      contacto: {
        telefono: form.telefono || null,
        direccion: form.direccion || null,
      },
    };

    const user = (await supabase.auth.getUser()).data.user;
    if (!form.id) payload.created_by = user?.id ?? null;
    payload.updated_by = user?.id ?? null;

    // 1) crear/actualizar paciente
    let resp;
    if (!form.id) {
      resp = await supabase
        .from("pacientes")
        .insert(payload)
        .select("id")
        .single();
    } else {
      resp = await supabase
        .from("pacientes")
        .update(payload)
        .eq("id", form.id)
        .select("id")
        .single();
    }

    if (resp.error) {
      setSaving(false);
      console.error(resp.error);
      alert(resp.error.message || "Error al guardar el paciente");
      return;
    }

    const pacienteId = resp.data.id;

    // 2) si es creación, subir carnet (anverso y reverso)
    if (!form.id && carnetFront && carnetBack) {
      try {
        const front = await uploadAnexo({
          pacienteId,
          file: carnetFront,
          tipo: "carnet",
          titulo: "carnet-anverso",
          descripcion: null,
        });
        await uploadAnexo({
          pacienteId,
          file: carnetBack,
          tipo: "carnet",
          titulo: "carnet-reverso",
          descripcion: null,
        });

        // opcional: guardar preview del anverso en pacientes
        await supabase
          .from("pacientes")
          .update({
            foto_carnet_bucket: "anexos",
            foto_carnet_path: front.paths.mediumPath, // preview
          })
          .eq("id", pacienteId);
      } catch (e) {
        console.error(e);
        alert(e.message || "Paciente creado, pero falló la subida del carnet");
      }
    }

    setSaving(false);
    onSaved?.();
  };

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" onClick={e=>e.stopPropagation()}>
        <div className="mb-header">
          <h3>{form.id ? "Editar paciente" : "Nuevo paciente"}</h3>
          <button className="mb-close" onClick={onClose}>×</button>
        </div>

        <div className="mb-body grid2">
          {/* CI */}
          <label className="col2">CI</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 140px", gap:8 }} className="col2">
            <input
              placeholder="Número"
              value={form.doc_numero}
              onChange={e=>set("doc_numero", e.target.value)}
            />
            <select
              value={form.doc_expedido}
              onChange={e=>set("doc_expedido", e.target.value)}
            >
              {CI_EXT.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          {/* Identidad */}
          <label>Nombres
            <input value={form.nombres} onChange={e=>set("nombres", e.target.value)} />
          </label>
          <label>Apellidos
            <input value={form.apellidos} onChange={e=>set("apellidos", e.target.value)} />
          </label>

          {/* Demográficos */}
          <label>Fecha nacimiento
            <input type="date" value={form.fecha_nacimiento ?? ""} onChange={e=>set("fecha_nacimiento", e.target.value)} />
          </label>
          <label>Sexo
            <select value={form.sexo ?? ""} onChange={e=>set("sexo", e.target.value)}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="Otro">Otro</option>
            </select>
          </label>

          {/* Opcionales */}
          <label>Nivel educativo
            <select value={form.nivel_educativo} onChange={e=>set("nivel_educativo", e.target.value)}>
              <option value="">—</option>
              {NIVELES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label>Ocupación
            <input value={form.ocupacion} onChange={e=>set("ocupacion", e.target.value)} />
          </label>
          <label className="col2">Antecedentes
            <textarea value={form.antecedentes} onChange={e=>set("antecedentes", e.target.value)} />
          </label>

          {/* Contacto (sin email) */}
          <label>Teléfono
            <input value={form.telefono} onChange={e=>set("telefono", e.target.value)} />
          </label>
          <label className="col2">Dirección
            <textarea value={form.direccion} onChange={e=>set("direccion", e.target.value)} />
          </label>

          {/* Carnet obligatorio al crear */}
          {!form.id && (
            <>
              <label className="col2" style={{ marginTop:6 }}>Carnet (fotos obligatorias)</label>
              <div className="col2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div>
                  <div style={{ fontSize:12, marginBottom:4 }}>Anverso</div>
                  <input type="file" accept="image/*" onChange={e=>setCarnetFront(e.target.files?.[0] || null)} />
                </div>
                <div>
                  <div style={{ fontSize:12, marginBottom:4 }}>Reverso</div>
                  <input type="file" accept="image/*" onChange={e=>setCarnetBack(e.target.files?.[0] || null)} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mb-footer">
          <button className="btn-light" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
