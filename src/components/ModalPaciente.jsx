import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadAnexo } from "../services/uploadAnexo";
import "../styles/ModalBase.css";

// Ajusta si tus catálogos difieren
const CI_EXT = ["LP", "CB", "SC", "OR", "PT", "TJ", "BE", "PD", "CH"];
const NIVELES = ["Primaria", "Secundaria", "Técnico", "Universitario", "Postgrado", "Otro"];

// define formatos que realmente soporte tu pipeline
const MAX_MB = 8;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"]; // quita heic si no lo soportas

export default function ModalPaciente({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    id: null,
    doc_numero: "",
    doc_expedido: "LP",
    nombres: "",
    apellidos: "",
    sexo: "",
    fecha_nacimiento: "",
    nivel_educativo: "",
    ocupacion: "",
    antecedentes: "",
    telefono: "",
    direccion: "",
  });

  const [carnetFront, setCarnetFront] = useState(null);
  const [carnetBack, setCarnetBack] = useState(null);
  const [previewFront, setPreviewFront] = useState(null);
  const [previewBack, setPreviewBack] = useState(null);

  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!initial) {
      // reset si es nuevo
      setForm({
        id: null,
        doc_numero: "",
        doc_expedido: "LP",
        nombres: "",
        apellidos: "",
        sexo: "",
        fecha_nacimiento: "",
        nivel_educativo: "",
        ocupacion: "",
        antecedentes: "",
        telefono: "",
        direccion: "",
      });
      setCarnetFront(null);
      setCarnetBack(null);
      setPreviewFront(null);
      setPreviewBack(null);
      return;
    }

    const src = initial._row ?? initial;
    setForm({
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
    });
    // Previews se regeneran al elegir archivo
    setCarnetFront(null);
    setCarnetBack(null);
    setPreviewFront(null);
    setPreviewBack(null);
  }, [initial]);

  function validateImage(file) {
    if (!file) return { ok: true };
    if (!file.type?.startsWith("image/")) {
      return { ok: false, msg: "El carnet debe ser una imagen." };
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return { ok: false, msg: "Formato no permitido. Usa JPG/PNG/WEBP/HEIC." };
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return { ok: false, msg: `El archivo supera ${MAX_MB}MB.` };
    }
    return { ok: true };
  }

  const validar = () => {
    if (!form.nombres.trim()) return "Nombres es obligatorio";
    if (!form.doc_numero.trim()) return "Número de CI es obligatorio";
    if (!form.doc_expedido) return "Extensión de CI es obligatoria";

    if (!form.id) {
      // creación: fotos obligatorias
      if (!carnetFront) return "Debes subir la foto del carnet (anverso)";
      if (!carnetBack) return "Debes subir la foto del carnet (reverso)";
      const vF = validateImage(carnetFront);
      const vB = validateImage(carnetBack);
      if (!vF.ok) return vF.msg;
      if (!vB.ok) return vB.msg;
    } else {
      // edición: si suben se validan
      if (carnetFront) {
        const vF = validateImage(carnetFront);
        if (!vF.ok) return vF.msg;
      }
      if (carnetBack) {
        const vB = validateImage(carnetBack);
        if (!vB.ok) return vB.msg;
      }
    }
    return null;
  };

  const guardar = async () => {
    const err = validar();
    if (err) {
      alert(err);
      return;
    }
    setSaving(true);

    try {
      const payload = {
        doc_tipo: "CI",
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
          // puedes agregar email más adelante
        },
      };

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;

      if (!form.id) {
        payload.created_by = uid;
      }
      payload.updated_by = uid;

      // Insert o update del paciente
      let resp;
      if (!form.id) {
        resp = await supabase.from("pacientes").insert(payload).select("id").single();
      } else {
        resp = await supabase
          .from("pacientes")
          .update(payload)
          .eq("id", form.id)
          .select("id")
          .single();
      }
      if (resp.error) throw resp.error;

      const pacienteId = resp.data.id;

      // Subidas de carnet:
      // - Requeridas en creación.
      // - Opcionales en edición (si se proveyeron).
      let frontResult = null;
      if (carnetFront) {
        frontResult = await uploadAnexo({
          pacienteId,
          file: carnetFront,
          tipo: "carnet",
          titulo: "carnet-anverso",
          descripcion: null,
        });
      }
      if (carnetBack) {
        await uploadAnexo({
          pacienteId,
          file: carnetBack,
          tipo: "carnet",
          titulo: "carnet-reverso",
          descripcion: null,
        });
      }

      // Actualiza referencia rápida del anverso si subimos
      if (frontResult?.paths?.mediumPath) {
        await supabase
          .from("pacientes")
          .update({ foto_carnet_bucket: "anexos", foto_carnet_path: frontResult.paths.mediumPath })
          .eq("id", pacienteId);
      }

      onSaved?.();
      onClose();
    } catch (e) {
      console.error("Error al guardar paciente:", e);
      alert(e?.message || "Error al guardar el paciente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-backdrop" onClick={saving ? undefined : onClose}>
      <div className="mb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mb-header">
          <h3>{form.id ? "Editar paciente" : "Nuevo paciente"}</h3>
          <button className="mb-close" onClick={onClose} disabled={saving}>
            ×
          </button>
        </div>

        <div className="mb-body grid2">
          <label className="col2">CI</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }} className="col2">
            <div className="relative">
              <input
                placeholder="Número"
                value={form.doc_numero}
                onChange={(e) => set("doc_numero", e.target.value)}
                className="pr-10"
              />
              <div
                className="pointer-events-none"
                style={{
                  position: "absolute",
                  right: 8,
                  top: 0,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  color: "#9ca3af",
                  fontSize: 12,
                }}
              >
                CI
              </div>
            </div>
            <select value={form.doc_expedido} onChange={(e) => set("doc_expedido", e.target.value)}>
              {CI_EXT.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <label>
            Nombres
            <input value={form.nombres} onChange={(e) => set("nombres", e.target.value)} />
          </label>
          <label>
            Apellidos
            <input value={form.apellidos} onChange={(e) => set("apellidos", e.target.value)} />
          </label>

          <label>
            Fecha nacimiento
            <input
              type="date"
              value={form.fecha_nacimiento ?? ""}
              onChange={(e) => set("fecha_nacimiento", e.target.value)}
            />
          </label>
          <label>
            Sexo
            <select value={form.sexo ?? ""} onChange={(e) => set("sexo", e.target.value)}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="Otro">Otro</option>
            </select>
          </label>

          <label>
            Nivel educativo
            <select value={form.nivel_educativo} onChange={(e) => set("nivel_educativo", e.target.value)}>
              <option value="">—</option>
              {NIVELES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ocupación
            <input value={form.ocupacion} onChange={(e) => set("ocupacion", e.target.value)} />
          </label>
          <label className="col2">
            Antecedentes
            <textarea value={form.antecedentes} onChange={(e) => set("antecedentes", e.target.value)} />
          </label>

          <label>
            Teléfono
            <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </label>
          <label className="col2">
            Dirección
            <textarea value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </label>

          {/* Fotos obligatorias solo en creación */}
          {!form.id && (
            <>
              <label className="col2" style={{ marginTop: 6 }}>
                Carnet (fotos obligatorias)
              </label>
              <div className="col2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Anverso</div>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setCarnetFront(f);
                      setPreviewFront(f ? URL.createObjectURL(f) : null);
                    }}
                  />
                  {previewFront && (
                    <div style={{ marginTop: 6 }}>
                      <img
                        src={previewFront}
                        alt="Anverso"
                        style={{
                          width: 160,
                          height: 100,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                        }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Reverso</div>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setCarnetBack(f);
                      setPreviewBack(f ? URL.createObjectURL(f) : null);
                    }}
                  />
                  {previewBack && (
                    <div style={{ marginTop: 6 }}>
                      <img
                        src={previewBack}
                        alt="Reverso"
                        style={{
                          width: 160,
                          height: 100,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="col2" style={{ fontSize: 12, color: "#6b7280" }}>
                Permitidos: JPG, PNG, WEBP{ACCEPTED_TYPES.includes("image/heic") ? ", HEIC" : ""}. Máx {MAX_MB}MB.
              </div>
            </>
          )}

          {/* En edición, reemplazo opcional */}
          {form.id && (
            <>
              <label className="col2" style={{ marginTop: 6 }}>
                Actualizar carnet (opcional)
              </label>
              <div className="col2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Anverso</div>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setCarnetFront(f);
                      setPreviewFront(f ? URL.createObjectURL(f) : null);
                    }}
                  />
                  {previewFront && (
                    <div style={{ marginTop: 6 }}>
                      <img
                        src={previewFront}
                        alt="Anverso"
                        style={{
                          width: 160,
                          height: 100,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                        }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Reverso</div>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setCarnetBack(f);
                      setPreviewBack(f ? URL.createObjectURL(f) : null);
                    }}
                  />
                  {previewBack && (
                    <div style={{ marginTop: 6 }}>
                      <img
                        src={previewBack}
                        alt="Reverso"
                        style={{
                          width: 160,
                          height: 100,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="col2" style={{ fontSize: 12, color: "#6b7280" }}>
                (Opcional) Si adjuntas nuevas fotos, se guardarán como anexos y se actualizará la referencia rápida.
              </div>
            </>
          )}
        </div>

        <div className="mb-footer">
          <button className="btn-light" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
