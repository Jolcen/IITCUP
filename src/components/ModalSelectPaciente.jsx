// src/components/ModalSelectPaciente.jsx
import { useMemo, useState } from "react";
import "../styles/ModalBase.css";

export default function ModalSelectPaciente({ pacientes, onClose, onSelect }) {
  const [q, setQ] = useState("");
  const list = useMemo(()=>{
    const t = q.toLowerCase();
    return pacientes.filter(p => !t || p.nombre.toLowerCase().includes(t) || (p.ci||"").toLowerCase().includes(t));
  }, [pacientes, q]);

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
                {list.map(p=>(
                  <tr key={p.id}>
                    <td style={{padding:"8px 6px"}}>{p.nombre}</td>
                    <td style={{padding:"8px 6px"}}>{p.ci}</td>
                    <td style={{padding:"8px 6px", textAlign:"right"}}>
                      <button className="btn-primary" onClick={()=>onSelect(p.id)}>Seleccionar</button>
                    </td>
                  </tr>
                ))}
                {list.length===0 && <tr><td className="muted">Sin resultados</td></tr>}
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
