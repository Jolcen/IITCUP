import "../styles/ModalEvaluacion.css";

// src/components/ModalEvaluacion.jsx
import { useEffect, useMemo, useState } from "react";
import { FaTimes, FaDownload, FaFileAlt, FaCalendarAlt, FaUserCircle } from "react-icons/fa";

/**
 * Props:
 * - mode: "create" | "edit" | "view"
 * - initialCase: objeto del caso (puede venir incompleto en la tabla; en openView/openEdit ya haces un select "*")
 * - onClose: () => void
 * - onSaved: () => void   // refrescar tabla después de guardar
 *
 * Notas:
 * - FRONTEND ONLY: no toca Supabase. Simula guardado con setTimeout y llama onSaved().
 * - En modo "view" renderiza panel lateral con ficha del paciente y documentos.
 */
export default function ModalEvaluacion({ mode = "view", initialCase, onClose, onSaved }) {
  const isView = mode === "view";
  const isCreate = mode === "create";
  const isEdit = mode === "edit";

  // ---------- CASE MODEL (frontend) ----------
  const [form, setForm] = useState({
    id: initialCase?.id ?? null,
    paciente_id: initialCase?.paciente_id ?? null,
    paciente_nombre: initialCase?.paciente_nombre ?? "",
    paciente_ci: initialCase?.paciente_ci ?? "",
    motivacion: initialCase?.motivacion ?? "",
    estado: initialCase?.estado ?? "pendiente", // pendiente | en_evaluacion | evaluado
    creado_en: initialCase?.creado_en ?? new Date().toISOString(),
    // “agenda” sin paciente
    fecha_programada: initialCase?.fecha_programada ?? "", // ej. "2026-05-21"
    hora_programada: initialCase?.hora_programada ?? "",   // ej. "15:30"
  });

  // Documentos del paciente (solo lectura aquí).
  // Espera que vengan colgados en initialCase.paciente_documentos (array) si los inyectas al abrir el modal.
  // Si no vienen, muestra vacío.
  const documentos = useMemo(() => {
    return Array.isArray(initialCase?.paciente_documentos)
      ? initialCase.paciente_documentos
      : [];
  }, [initialCase]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // ---------- SAVE (frontend only) ----------
  const guardar = () => {
    // Validaciones mínimas al crear/editar (no obligamos paciente por requerimiento)
    // Puedes agregar más validaciones según tu flujo real.
    // Simulamos operación asíncrona:
    setTimeout(() => {
      onSaved?.();
      onClose?.();
    }, 250);
  };

  // Helpers
  const fmtFecha = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso || "—"; }
  };

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" style={{ width: 960, maxWidth: "94vw" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-header">
          <h3>
            {isCreate && "Nueva evaluación"}
            {isEdit && "Editar evaluación"}
            {isView && "Detalle de evaluación"}
          </h3>
          <button className="mb-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        {/* Body */}
        <div className="mb-body" style={{ display: "grid", gridTemplateColumns: isView ? "2fr 1fr" : "1fr", gap: 16 }}>
          {/* Columna izquierda: datos del caso */}
          <div className="case-col">
            {/* Datos principales */}
            {!isView && (
              <div className="panel">
                <h4>Datos del caso</h4>
                <div className="grid2">
                  <label>
                    Motivo / Contexto
                    <textarea
                      rows={4}
                      value={form.motivacion}
                      onChange={(e) => set("motivacion", e.target.value)}
                    />
                  </label>

                  <label>
                    Estado
                    <select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="en_evaluacion">En evaluación</option>
                      <option value="evaluado">Evaluado</option>
                    </select>
                  </label>

                  <label>
                    Fecha programada (opcional)
                    <input
                      type="date"
                      value={form.fecha_programada}
                      onChange={(e) => set("fecha_programada", e.target.value)}
                    />
                  </label>

                  <label>
                    Hora programada (opcional)
                    <input
                      type="time"
                      value={form.hora_programada}
                      onChange={(e) => set("hora_programada", e.target.value)}
                    />
                  </label>
                </div>
                <p className="hint">
                  <FaCalendarAlt style={{ marginRight: 6 }} />
                  Puedes <strong>agendar</strong> la evaluación sin un paciente asignado. Luego
                  podrás asignarlo desde la lista de evaluaciones.
                </p>
              </div>
            )}

            {isView && (
              <div className="panel">
                <h4>Resumen del caso</h4>
                <div className="kv">
                  <span className="k">Motivo/Contexto</span>
                  <span className="v">{initialCase?.motivacion || "—"}</span>
                </div>
                <div className="kv">
                  <span className="k">Estado</span>
                  <span className="v">
                    <span className={`chip chip-${initialCase?.estado || "pendiente"}`}>
                      {initialCase?.estado === "pendiente" && "Pendiente"}
                      {initialCase?.estado === "en_evaluacion" && "En evaluación"}
                      {initialCase?.estado === "evaluado" && "Evaluado"}
                      {!["pendiente","en_evaluacion","evaluado"].includes(initialCase?.estado) && (initialCase?.estado || "pendiente")}
                    </span>
                  </span>
                </div>
                <div className="kv">
                  <span className="k">Creado</span>
                  <span className="v">{fmtFecha(initialCase?.creado_en)}</span>
                </div>

                {(initialCase?.fecha_programada || initialCase?.hora_programada) && (
                  <div className="kv">
                    <span className="k">Agendado</span>
                    <span className="v">
                      {initialCase?.fecha_programada || "—"} {initialCase?.hora_programada || ""}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* (Aquí podrías renderizar más secciones del caso, pruebas asignadas, etc.) */}
          </div>

          {/* Columna derecha: PACIENTE + DOCUMENTOS (solo view) */}
          {isView && (
            <aside className="patient-col">
              <div className="panel">
                <h4>Paciente</h4>

                {!initialCase?.paciente_id && (
                  <p className="muted" style={{ margin: 0 }}>
                    Este caso aún no tiene paciente asignado.
                  </p>
                )}

                {initialCase?.paciente_id && (
                  <>
                    <div className="patient-card">
                      <div className="icon">
                        <FaUserCircle />
                      </div>
                      <div className="meta">
                        <div className="name">{initialCase?.paciente_nombre || "—"}</div>
                        <div className="ci">CI: {initialCase?.paciente_ci || "—"}</div>
                      </div>
                    </div>

                    {/* Documentos del paciente */}
                    <h5 style={{ margin: "14px 0 8px" }}>Documentos</h5>
                    <ul className="doc-list">
                      {documentos.length === 0 && <li className="muted">Sin documentos</li>}
                      {documentos.map((d) => (
                        <li key={d.id}>
                          <div className="doc-left">
                            <FaFileAlt />
                            <span className="doc-name" title={d.nombre}>{d.nombre}</span>
                          </div>
                          <div className="doc-actions">
                            {/* En backend real: href al archivo / preview */}
                            <button className="btn-light" title="Descargar">
                              <FaDownload />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* Footer */}
        <div className="mb-footer">
          <button className="btn-light" onClick={onClose}>Cerrar</button>
          {(isCreate || isEdit) && (
            <button className="btn-primary" onClick={guardar}>
              Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
