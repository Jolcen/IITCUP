import { useEffect, useMemo, useState, useCallback } from "react";
import { FaPlus, FaSearch, FaFolderOpen } from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";
import ModalPaciente from "../components/ModalPaciente";
import ModalDocumentosPaciente from "../components/ModalDocumentosPaciente";
import "../styles/Pacientes.css";

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState({ open:false, initial:null });
  const [docs, setDocs] = useState({ open:false, paciente:null });

  const fetchPacientes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pacientes")
      .select(`
        id, doc_numero, doc_expedido,
        nombres, apellidos, sexo, fecha_nacimiento,
        contacto
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setPacientes([]);
    } else {
      const mapped = (data || []).map(r => ({
        id: r.id,
        nombre: [r.nombres, r.apellidos].filter(Boolean).join(" "),
        ci: r.doc_numero || "",
        ci_ext: r.doc_expedido || "",
        nacimiento: r.fecha_nacimiento || "",
        genero: r.sexo || "",
        email: r?.contacto?.email || "",
        telefono: r?.contacto?.telefono || "",
        direccion: r?.contacto?.direccion || "",
        _row: r,
      }));
      setPacientes(mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPacientes(); }, [fetchPacientes]);

  const filtrados = useMemo(() => {
    const t = q.toLowerCase().trim();
    return pacientes.filter(p =>
      !t ||
      (p.nombre?.toLowerCase().includes(t)) ||
      (p.ci?.toLowerCase().includes(t)) ||
      (p.email?.toLowerCase().includes(t))
    );
  }, [pacientes, q]);

  const crear = () => setModal({ open:true, initial:null });
  const editar = (p) => setModal({ open:true, initial:p });
  const abrirDocs = (p) => setDocs({ open:true, paciente:p });

  const onGuardarPaciente = async () => {
    await fetchPacientes();
    setModal({ open:false, initial:null });
  };

  const onGuardarDocs = async () => {
    setDocs({ open:false, paciente:null });
  };

  return (
    <div className="pacientes-page">
      <div className="pacientes-header">
        <div className="search">
          <FaSearch />
          <input
            placeholder="Buscar por nombre, CI o email…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={crear}>
          <FaPlus/> Nuevo paciente
        </button>
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
            {loading && (
              <tr><td colSpan={7} className="muted">Cargando…</td></tr>
            )}
            {!loading && filtrados.length===0 && (
              <tr><td colSpan={7} className="muted">Sin pacientes</td></tr>
            )}
            {!loading && filtrados.map(p=>(
              <tr key={p.id}>
                <td>{p.nombre || "—"}</td>
                <td>{p.ci ? `${p.ci} ${p.ci_ext || ""}` : "—"}</td>
                <td>{p.nacimiento || "—"}</td>
                <td>{p.genero || "—"}</td>
                <td>{p.telefono || "—"}</td>
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
          onSaved={onGuardarPaciente}
        />
      )}

      {docs.open && (
        <ModalDocumentosPaciente
          paciente={docs.paciente}
          allowCase={false}       
          onClose={()=>setDocs({open:false, paciente:null})}
          onSaved={onGuardarDocs}
        />
      )}
    </div>
  );
}
