// src/components/ModalSelectPaciente.jsx
import { useEffect, useMemo, useState } from "react";
import "../styles/ModalBase.css";
import { supabase } from "../lib/supabaseClient";

/**
 * Props:
 * - pacientes: array opcional; si viene vacío, el modal cargará desde BD
 * - onClose: () => void
 * - onSelect: (pacienteId: uuid) => void
 */
export default function ModalSelectPaciente({ pacientes = [], onClose, onSelect }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState(pacientes);

  // Auto-carga desde BD si no recibimos lista
  useEffect(() => {
    if (pacientes && pacientes.length > 0) { setList(pacientes); return; }
    (async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, doc_numero, nombres, apellidos")
        .order("created_at", { ascending: false })
        .limit(50);
      setList((data || []).map(p => ({ id: p.id, nombre: `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim(), ci: p.doc_numero || "" })));
    })();
  }, [pacientes]);

  // Búsqueda remota cuando q tiene 2+ caracteres
  useEffect(() => {
    const f = async () => {
      if (q.trim().length < 2) return;
      const term = q.trim();
      const { data } = await supabase
        .from("pacientes")
        .select("id, doc_numero, nombres, apellidos")
        .or(`nombres.ilike.%${term}%,apellidos.ilike.%${term}%,doc_numero.ilike.%${term}%`)
        .order("nombres")
        .limit(50);
      setList((data || []).map(p => ({ id: p.id, nombre: `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim(), ci: p.doc_numero || "" })));
    };
    f();
  }, [q]);

  // Filtro local si q<2
  const visible = useMemo(() => {
    const t = q.toLowerCase();
    if (q.trim().length >= 2) return list;
    return list.filter(p =>
      !t ||
      (p.nombre || "").toLowerCase().includes(t) ||
      (p.ci || "").toLowerCase().includes(t)
    );
  }, [list, q]);

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="mb-header">
          <h3>Asignar paciente</h3>
          <button className="mb-close" onClick={onClose}>×</button>
        </div>
        <div className="mb-body">
          <input placeholder="Buscar por nombre o CI…" value={q} onChange={e=>setQ(e.target.value)} />
          <div style={{maxHeight:300, overflow:"auto", marginTop:8}}>
            <table style={{width:"100%", borderCollapse:"collapse"}}>
              <tbody>
                {visible.map(p=>(
                  <tr key={p.id}>
                    <td style={{padding:"8px 6px"}}>{p.nombre}</td>
                    <td style={{padding:"8px 6px"}}>{p.ci}</td>
                    <td style={{padding:"8px 6px", textAlign:"right"}}>
                      <button className="btn-primary" onClick={()=>onSelect(p.id)}>Seleccionar</button>
                    </td>
                  </tr>
                ))}
                {visible.length===0 && <tr><td className="muted">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mb-footer">
          <button className="btn-light" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
