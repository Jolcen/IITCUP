// src/pages/Evaluaciones.jsx
import "../styles/Evaluaciones.css";
import ModalNuevaEvaluacion from "../components/ModalNuevaEvaluacion";
import { FaUserCircle, FaEdit, FaTrash, FaPlay } from "react-icons/fa";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../lib/supabaseClient";
import { listCasos } from "../services/casosService";
import useProfile from "../hooks/useProfile";

export default function Evaluaciones() {
  const [mostrarModal, setMostrarModal] = useState(false);
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(true);
  const profile = useProfile();
  const navigate = useNavigate();

  async function cargarCasos() {
    setLoading(true);
    try {
      const data = await listCasos();
      setCasos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarCasos();

    // Realtime: escuchar cambios en tabla "casos"
    const channel = supabase
      .channel("realtime-casos")
      .on("postgres_changes", { event: "*", schema: "public", table: "casos" }, () => {
        cargarCasos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const irARealizarPrueba = (c) => {
    const params = new URLSearchParams({
      // En DB el "paciente" está embebido en el caso; no hay patient_id separado
      patient: "",                          // si luego creas tabla pacientes, pásalo aquí
      eval: c.id ?? "",
      nombre: c.paciente_nombre ?? ""
    });
    navigate(`/prueba?${params.toString()}`);
  };

  return (
    <div className="evaluaciones-page">
      <div className="header">
        <div>
          <h2>Evaluaciones Pendientes</h2>
          <p>Generación de nuevos casos para ser evaluados</p>
        </div>

        {/* Solo Administrador ve el botón de crear */}
        {profile?.rol === "administrador" && (
          <button className="btn-add" onClick={() => setMostrarModal(true)}>
            + Añadir Evaluación
          </button>
        )}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Individuo</th>
              <th>Caso</th>
              <th>Detalles</th>
              <th>Fecha</th>
              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={5}>Cargando…</td></tr>
            ) : casos.length === 0 ? (
              <tr><td colSpan={5}>Sin registros</td></tr>
            ) : (
              casos.map((c) => (
                <tr key={c.id}>
                  <td><FaUserCircle className="avatar" /> {c.paciente_nombre}</td>

                  {/* intenta usar "tipo_caso"; si no existe, usa estado o motivacion */}
                  <td>{c.tipo_caso ?? c.estado ?? "-"}</td>

                  {/* Detalles: mostramos "motivacion" o "antecedentes" */}
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.motivacion ?? c.antecedentes ?? "—"}
                  </td>

                  {/* Fecha de creación */}
                  <td>{new Date(c.creado_en).toLocaleDateString()}</td>

                  <td className="acciones">
                    <button
                      className="btn btn-sm btn-primary"
                      title="Realizar prueba"
                      onClick={() => irARealizarPrueba(c)}
                      style={{ marginRight: 8 }}
                    >
                      <FaPlay style={{ marginRight: 6 }} />
                      Realizar
                    </button>

                    {/* Estas acciones dependen de tu flujo/rol */}
                    <FaEdit className="icon edit" title="Editar" />
                    {profile?.rol === "administrador" && (
                      <FaTrash className="icon delete" title="Eliminar" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pagination">
          <span>◀</span>
          {[1, 2, 3, 4, 5].map((n) => <span key={n} className="page">{n}</span>)}
          <span>▶</span>
        </div>
      </div>

      {mostrarModal && (
        <ModalNuevaEvaluacion
          onClose={() => setMostrarModal(false)}
          // Sugerencia: si tu modal crea el caso, refresca al cerrar:
          onCreated={() => {
            setMostrarModal(false);
            cargarCasos();
          }}
        />
      )}
    </div>
  );
}
