// src/pages/Pacientes.jsx
import { useMemo, useState } from "react";
import { FaPlus, FaSearch, FaFolderOpen } from "react-icons/fa";
import ModalPaciente from "../components/ModalPaciente";
import ModalDocumentosPaciente from "../components/ModalDocumentosPaciente";
import "../styles/Pacientes.css";

export default function Pacientes() {
  // Mock local: luego reemplaza por fetch a tu backend/Supabase
  const [pacientes, setPacientes] = useState([
    // { id:"p1", nombre:"Juan Pérez", ci:"1234567", nacimiento:"1990-10-01", genero:"M", telefono:"", email:"", direccion:"", documentos:[{id:"d1", nombre:"RX_2024.png"}] }
  ]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState({ open:false, initial:null });
  const [docs, setDocs] = useState({ open:false, paciente:null });

  const filtrados = useMemo(() => {
    const t = q.toLowerCase();
    return pacientes.filter(p =>
      !t ||
      p.nombre?.toLowerCase().includes(t) ||
      p.ci?.toLowerCase().includes(t) ||
      p.email?.toLowerCase().includes(t)
    );
  }, [pacientes, q]);

  const crear = () => setModal({ open:true, initial:null });
  const editar = (p) => setModal({ open:true, initial:p });
  const abrirDocs = (p) => setDocs({ open:true, paciente:p });

  const onGuardarPaciente = (data) => {
    if (data.id) {
      setPacientes(prev => prev.map(x => x.id===data.id ? data : x));
    } else {
      setPacientes(prev => [...prev, { ...data, id: crypto.randomUUID(), documentos: [] }]);
    }
    setModal({ open:false, initial:null });
  };

  const onGuardarDocs = (pacienteId, nuevosDocs) => {
    setPacientes(prev => prev.map(p => p.id===pacienteId ? { ...p, documentos: nuevosDocs } : p));
    setDocs({ open:false, paciente:null });
  };

  return (
    <div className="pacientes-page">
      <div className="pacientes-header">
        <div className="search">
          <FaSearch /><input placeholder="Buscar por nombre, CI o email…" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={crear}><FaPlus/> Nuevo paciente</button>
      </div>

      <div className="card">
        <table className="pacientes-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>CI</th>
              <th>Fecha Nac.</th>
              <th>Género</th>
              <th>Contacto</th>
              <th>Documentos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length===0 && (
              <tr><td colSpan={7} className="muted">Sin pacientes</td></tr>
            )}
            {filtrados.map(p=>(
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.ci || "—"}</td>
                <td>{p.nacimiento || "—"}</td>
                <td>{p.genero || "—"}</td>
                <td>{p.email || p.telefono || "—"}</td>
                <td>
                  <button className="btn-light" onClick={()=>abrirDocs(p)}>
                    <FaFolderOpen/><span> Abrir</span>
                  </button>
                </td>
                <td style={{textAlign:"right"}}>
                  <button className="btn-light" onClick={()=>editar(p)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <ModalPaciente
          initial={modal.initial}
          onClose={()=>setModal({open:false, initial:null})}
          onSave={onGuardarPaciente}
        />
      )}

      {docs.open && (
        <ModalDocumentosPaciente
          paciente={docs.paciente}
          onClose={()=>setDocs({open:false, paciente:null})}
          onSave={onGuardarDocs}
        />
      )}
    </div>
  );
}
