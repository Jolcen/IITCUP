// src/components/ModalDocumentosPaciente.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uploadAnexo } from "../services/uploadAnexo";
import "../styles/ModalBase.css";

const TIPOS = [
  "cert_medico",
  "cert_psicologico",
  "antecedentes_policiales",
  "antecedentes_penales",
  "otros",
];

const TIPOS_TITULO = {
  carnet: "Carnet de Identidad",
  cert_medico: "Certificado Médico",
  cert_psicologico: "Certificado Psicológico",
  antecedentes_policiales: "Antecedentes Policiales",
  antecedentes_penales: "Antecedentes Penales",
  otros: "Otros",
};

// Deriva el preview/medium a partir del original subido por uploadAnexo
function previewPathFromOriginal(originalPath) {
  const parts = (originalPath || "").split("/");
  if (parts.length < 5) return null;
  const base = parts.slice(0, 3).join("/");
  return `${base}/preview/medium.jpg`;
}

export default function ModalDocumentosPaciente({ paciente, onClose, onSaved }) {
  // Tipo por defecto usado al AGREGAR (no al subir)
  const [tipoDefault, setTipoDefault] = useState(TIPOS[0]);

  // Pendientes ahora guardan su propio tipo
  // [{ id, file, tipo }]
  const [pendientes, setPendientes] = useState([]);
  const [existentes, setExistentes] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarAnexos = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("anexos")
      .select("id, titulo, tipo, mime_type, size_bytes, bucket, path, created_at")
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

  // Agregar archivos: cada uno con su tipo propio inicial = tipoDefault actual
  const onInput = (e) => {
    const arr = Array.from(e.target.files || []);
    const nuevos = arr.map(f => ({
      id: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      file: f,
      tipo: tipoDefault, // << capturamos el tipo actual como valor inicial de ESTE archivo
    }));
    setPendientes(prev => [...prev, ...nuevos]);
    e.target.value = "";
  };

  const removePendiente = (id) =>
    setPendientes(prev => prev.filter(f => f.id !== id));

  // Cambiar el tipo de un archivo pendiente
  const changeTipoPendiente = (id, nuevoTipo) =>
    setPendientes(prev => prev.map(p => p.id === id ? { ...p, tipo: nuevoTipo } : p));

  // Subir cada archivo con su tipo particular
  const subir = async () => {
    if (pendientes.length === 0) return;

    // Validaciones
    for (const p of pendientes) {
      const t = p.file.type || "";
      const permitido = t === "application/pdf" || t.startsWith("image/");
      if (!permitido) { alert(`Tipo no permitido: ${t}`); return; }
      if (!p.tipo) { alert("Hay archivos pendientes sin tipo seleccionado."); return; }
    }

    setSubiendo(true);
    try {
      for (const item of pendientes) {
        const tituloLogico = TIPOS_TITULO[item.tipo] || item.tipo;
        await uploadAnexo({
          pacienteId: paciente.id,
          file: item.file,
          tipo: item.tipo,     // << usa el tipo propio del item
          titulo: tituloLogico,
          descripcion: null,
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

  const eliminar = async (a) => {
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      const bucket = a.bucket || "anexos";
      const previewPath = previewPathFromOriginal(a.path);
      const toRemove = [a.path];
      if (previewPath) {
        const thumbPath = previewPath.replace("medium.jpg", "thumbnail.jpg");
        toRemove.push(previewPath, thumbPath);
      }
      await supabase.storage.from(bucket).remove(toRemove);
      const { error } = await supabase.from("anexos").delete().eq("id", a.id);
      if (error) throw error;
      await cargarAnexos();
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo eliminar");
    }
  };

  const totalPend = useMemo(
    () => pendientes.reduce((s, p) => s + (p.file?.size || 0), 0),
    [pendientes]
  );

  // Resumen por tipo (para info)
  const resumenPorTipo = useMemo(() => {
    const m = new Map();
    for (const p of pendientes) {
      m.set(p.tipo, (m.get(p.tipo) || 0) + 1);
    }
    return Array.from(m.entries()); // [ [tipo, count], ... ]
  }, [pendientes]);

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="mb-header">
          <h3>Documentos de {paciente?.nombre}</h3>
          <button className="mb-close" onClick={onClose}>×</button>
        </div>

        <div className="mb-body">
          {/* Selector de tipo por defecto para NUEVOS archivos */}


          {/* Drop simple */}
          <div className="drop" style={{ marginBottom: 12 }}>
            <input type="file" multiple onChange={onInput} />
          </div>

          {/* Pendientes */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: "8px 0" }}>Pendientes</h4>
            {pendientes.length === 0 && <div className="muted">No hay archivos pendientes</div>}
            {pendientes.length > 0 && (
              <>
                <ul className="doc-list">
                  {pendientes.map(p => (
                    <li key={p.id} style={{ display:"grid", gridTemplateColumns:"1fr 220px auto", alignItems:"center", gap:12 }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {p.file.name} <small>({(p.file.size/1024).toFixed(1)} KB)</small>
                      </span>
                      <label style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span className="muted" style={{ fontSize:12 }}>Tipo:</span>
                        <select value={p.tipo} onChange={(e)=>changeTipoPendiente(p.id, e.target.value)}>
                          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <button className="btn-light" onClick={()=>removePendiente(p.id)}>Quitar</button>
                    </li>
                  ))}
                </ul>

                <div className="muted" style={{ marginTop: 6 }}>
                  Total: {(totalPend/1024).toFixed(1)} KB
                  {resumenPorTipo.length > 0 && " — Por tipo: "}
                  {resumenPorTipo.map(([t, c], i) => (
                    <span key={t}>
                      {i>0 && " · "}{t}: {c}
                    </span>
                  ))}
                </div>
              </>
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
                      {a.tipo} · {(a.size_bytes/1024).toFixed(1)} KB
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
