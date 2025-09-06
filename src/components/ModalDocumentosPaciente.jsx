// src/components/ModalDocumentosPaciente.jsx
import { useEffect, useState } from "react";
import "../styles/ModalBase.css";

export default function ModalDocumentosPaciente({ paciente, onClose, onSave }) {
  const [files, setFiles] = useState(paciente?.documentos || []);

  const onInput = (e) => {
    const arr = Array.from(e.target.files || []);
    const nuevos = arr.map(f => ({ id: crypto.randomUUID(), nombre: f.name, size: f.size }));
    setFiles(prev => [...prev, ...nuevos]);
  };
  const remove = (id) => setFiles(prev => prev.filter(f => f.id!==id));

  const guardar = () => onSave(paciente.id, files);

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" onClick={(e)=>e.stopPropagation()}>
        <div className="mb-header">
          <h3>Documentos de {paciente?.nombre}</h3>
          <button className="mb-close" onClick={onClose}>×</button>
        </div>

        <div className="mb-body">
          <div className="drop">
            <input type="file" multiple onChange={onInput} />
          </div>

          <ul className="doc-list">
            {files.length===0 && <li className="muted">Sin documentos</li>}
            {files.map(f=>(
              <li key={f.id}>
                <span>{f.nombre}</span>
                <button className="btn-light" onClick={()=>remove(f.id)}>Eliminar</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-footer">
          <button className="btn-light" onClick={onClose}>Cerrar</button>
          <button className="btn-primary" onClick={guardar}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}
