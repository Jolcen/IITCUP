// src/components/ModalDocumentosPaciente.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadAnexo } from "../services/uploadAnexo";
import "../styles/ModalBase.css";

// Tipos de documento que manejas
const TIPOS = [
  "carnet",
  "cert_medico",
  "cert_psicologico",
  "antecedentes_policiales",
  "antecedentes_penales",
  "otros",
];

// Derivar la ruta del preview (medium.jpg) a partir del original
function previewPathFromOriginal(originalPath) {
  // original esperado: pacientes/{paciente_id}/{anexo_id}/original/archivo.ext
  const parts = (originalPath || "").split("/");
  if (parts.length < 5) return null;
  // base: pacientes/{paciente_id}/{anexo_id}
  const base = parts.slice(0, 3).join("/");
  return `${base}/preview/medium.jpg`;
}

export default function ModalDocumentosPaciente({ paciente, onClose, onSaved }) {
  const [tipo, setTipo] = useState("carnet");
  const [casoId, setCasoId] = useState(""); // vacío = sin caso
  const [casos, setCasos] = useState([]);

  const [pendientes, setPendientes] = useState([]); // [{id, file}]
  const [existentes, setExistentes] = useState([]); // anexos ya subidos (enriquecidos)
  const [subiendo, setSubiendo] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Cargar casos del paciente (para asignar opcionalmente)
  useEffect(() => {
    const loadCasos = async () => {
      const { data, error } = await supabase
        .from("casos")
        .select("id, motivacion, estado, creado_en")
        .eq("paciente_id", paciente.id)
        .order("creado_en", { ascending: false });
      if (error) {
        console.error(error);
        setCasos([]);
        return;
      }
      setCasos(data || []);
    };
    loadCasos();
  }, [paciente?.id]);

  // Cargar anexos ya subidos
  const cargarAnexos = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("anexos")
      .select("id, titulo, tipo, mime_type, size_bytes, bucket, path, created_at, caso_id")
      .eq("paciente_id", paciente.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setExistentes([]);
      setCargando(false);
      return;
    }

    const enriched = await Promise.all((data || []).map(async a => {
      let previewUrl = null;
      if ((a.mime_type || "").startsWith("image/")) {
        const previewPath = previewPathFromOriginal(a.path);
        if (previewPath) {
          const r = await supabase.storage.from(a.bucket || "anexos").createSignedUrl(previewPath, 600);
          previewUrl = r.data?.signedUrl || null;
        }
      }
      const r2 = await supabase.storage.from(a.bucket || "anexos").createSignedUrl(a.path, 600);
      const originalUrl = r2.data?.signedUrl || null;
      return { ...a, previewUrl, originalUrl };
    }));

    setExistentes(enriched);
    setCargando(false);
  };

  useEffect(() => { cargarAnexos(); }, [paciente?.id]);

  // Agregar archivos a "Pendientes"
  const onInput = (e) => {
    const arr = Array.from(e.target.files || []);
    const nuevos = arr.map(f => ({ id: crypto.randomUUID(), file: f }));
    setPendientes(prev => [...prev, ...nuevos]);
    e.target.value = ""; // limpia input
  };

  const removePendiente = (id) => setPendientes(prev => prev.filter(f => f.id !== id));

  // Subir pendientes
  const subir = async () => {
    if (pendientes.length === 0) return;

    // Validaciones simples (respetar MIME del bucket)
    for (const p of pendientes) {
      const t = p.file.type || "";
      if (!(t.startsWith("image/jpeg") || t.startsWith("image/png") || t === "application/pdf" || t.startsWith("image/"))) {
        alert(`Tipo no permitido: ${t}`);
        return;
      }
    }

    setSubiendo(true);
    try {
      for (const item of pendientes) {
        await uploadAnexo({
          pacienteId: paciente.id,
          file: item.file,
          tipo,
          titulo: item.file.name,
          descripcion: null,
          casoId: casoId || null, // <- puede ser null (documento del paciente)
        });
      }
      await cargarAnexos();
      setPendientes([]);
      onSaved?.();
      alert("Documentos subidos.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al subir documentos");
    } finally {
      setSubiendo(false);
    }
  };

  // Eliminar un anexo (archivo(s) + fila)
  const eliminar = async (a) => {
    if (!confirm("¿Eliminar este documento?")) return;

    try {
      const bucket = a.bucket || "anexos";

      // borrar original + previews si existen
      const previewPath = previewPathFromOriginal(a.path);
      const toRemove = [a.path];
      if (previewPath) {
        const thumbPath = previewPath.replace("medium.jpg", "thumbnail.jpg");
        toRemove.push(previewPath, thumbPath);
      }
      await supabase.storage.from(bucket).remove(toRemove);

      // borrar fila (si tienes política DELETE en public.anexos)
      const { error } = await supabase.from("anexos").delete().eq("id", a.id);
      if (error) throw error;

      await cargarAnexos();
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo eliminar");
    }
  };

  const totalPend = useMemo(
    () => pendientes.reduce((s, p) => s + p.file.size, 0),
    [pendientes]
  );

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="mb-header">
          <h3>Documentos de {paciente?.nombre}</h3>
          <button className="mb-close" onClick={onClose}>×</button>
        </div>

        <div className="mb-body">
          {/* Filtros superiores */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <label>Tipo de documento:
              <select value={tipo} onChange={(e)=>setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label>Asociar a caso:
              <select value={casoId} onChange={(e)=>setCasoId(e.target.value)}>
                <option value="">— Sin caso (del paciente) —</option>
                {casos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.motivacion || c.id} · {c.estado}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Drop simple */}
          <div className="drop" style={{ marginBottom: 12 }}>
            <input type="file" multiple onChange={onInput} />
          </div>

          {/* Pendientes */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: "8px 0" }}>Pendientes</h4>
            {pendientes.length === 0 && <div className="muted">No hay archivos pendientes</div>}
            {pendientes.length > 0 && (
              <ul className="doc-list">
                {pendientes.map(p => (
                  <li key={p.id}>
                    <span>
                      {p.file.name} <small>({(p.file.size/1024).toFixed(1)} KB)</small>
                    </span>
                    <button className="btn-light" onClick={()=>removePendiente(p.id)}>Quitar</button>
                  </li>
                ))}
              </ul>
            )}
            {pendientes.length > 0 && (
              <div className="muted" style={{ marginTop: 4 }}>
                Total: {(totalPend/1024).toFixed(1)} KB — Tipo aplicado: <strong>{tipo}</strong>{casoId ? ` — Caso: ${casoId}` : " — Sin caso"}
              </div>
            )}
          </div>

          {/* Subidos */}
          <div>
            <h4 style={{ margin: "8px 0" }}>Subidos</h4>
            {cargando && <div className="muted">Cargando…</div>}
            {!cargando && existentes.length === 0 && <div className="muted">Sin documentos</div>}

            <ul className="doc-list">
              {existentes.map(a => (
                <li key={a.id} style={{ display:"flex", alignItems:"center", gap:12 }}>
                  {a.previewUrl ? (
                    <img
                      src={a.previewUrl}
                      alt={a.titulo || a.tipo}
                      style={{ width:64, height:64, objectFit:"cover", borderRadius:4 }}
                    />
                  ) : (
                    <div style={{ width:64, height:64, background:"#222", borderRadius:4, display:"grid", placeItems:"center", fontSize:12 }}>
                      {a.mime_type?.startsWith("application/pdf") ? "PDF" : "ARCH"}
                    </div>
                  )}

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {a.titulo || a.tipo}
                    </div>
                    <div className="muted" style={{ fontSize:12 }}>
                      {a.tipo} · {(a.size_bytes/1024).toFixed(1)} KB {a.caso_id ? `· Caso: ${a.caso_id}` : "· Sin caso"}
                    </div>
                  </div>

                  {a.originalUrl && (
                    <a className="btn-light" href={a.originalUrl} target="_blank" rel="noreferrer">Ver</a>
                  )}
                  <button className="btn-light" onClick={()=>eliminar(a)}>Eliminar</button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mb-footer">
          <button className="btn-light" onClick={onClose}>Cerrar</button>
          <button className="btn-primary" onClick={subir} disabled={subiendo || pendientes.length===0}>
            {subiendo ? "Subiendo…" : "Guardar / Subir"}
          </button>
        </div>
      </div>
    </div>
  );
}
