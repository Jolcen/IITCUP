// src/components/ModalPaciente.jsx
import { useEffect, useState } from "react";
import "../styles/ModalBase.css";

export default function ModalPaciente({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    id: null, nombre: "", ci: "", nacimiento: "", genero: "",
    telefono: "", email: "", direccion: ""
  });

  useEffect(()=>{ if(initial) setForm(prev=>({ ...prev, ...initial })); }, [initial]);

  const set = (k,v)=> setForm(prev=>({ ...prev, [k]: v }));

  const guardar = ()=> {
    // TODO: validaciones mínimas
    onSave(form);
  };

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" onClick={e=>e.stopPropagation()}>
        <div className="mb-header">
          <h3>{form.id ? "Editar paciente" : "Nuevo paciente"}</h3>
          <button className="mb-close" onClick={onClose}>×</button>
        </div>
        <div className="mb-body grid2">
          <label>Nombre completo<input value={form.nombre} onChange={e=>set("nombre", e.target.value)} /></label>
          <label>CI<input value={form.ci} onChange={e=>set("ci", e.target.value)} /></label>
          <label>Fecha nacimiento<input type="date" value={form.nacimiento} onChange={e=>set("nacimiento", e.target.value)} /></label>
          <label>Género
            <select value={form.genero} onChange={e=>set("genero", e.target.value)}>
              <option value="">—</option><option>M</option><option>F</option><option>Otro</option>
            </select>
          </label>
          <label>Teléfono<input value={form.telefono} onChange={e=>set("telefono", e.target.value)} /></label>
          <label>Email<input value={form.email} onChange={e=>set("email", e.target.value)} /></label>
          <label className="col2">Dirección<textarea value={form.direccion} onChange={e=>set("direccion", e.target.value)} /></label>
        </div>
        <div className="mb-footer">
          <button className="btn-light" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
