import "../styles/ModalEvaluacion.css";
import { useEffect, useMemo, useState, useRef } from "react";
import { FaTimes, FaDownload, FaFileAlt, FaUserCircle } from "react-icons/fa";
import { useNavigate } from "react-router-dom"; // ▲
import { supabase } from "../lib/supabaseClient";
import ModalSelectPaciente from "./ModalSelectPaciente";

export default function ModalEvaluacion({
  mode = "view",
  initialCase,
  onClose,
  onSaved,
}) {
  const navigate = useNavigate(); // ▲
  const isView = mode === "view";
  const isCreate = mode === "create";
  const isEdit = mode === "edit";

  const [authUserId, setAuthUserId] = useState(null); // ▲
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setAuthUserId(user?.id || null);
    })();
  }, []);

  // --------- Fila viva del caso ----------
  const [caseRow, setCaseRow] = useState(initialCase || null);

  // Campos editables
  const [motivacion, setMotivacion] = useState(initialCase?.motivacion ?? "");
  const [pacienteId, setPacienteId] = useState(initialCase?.paciente_id ?? null);
  const [paciente, setPaciente] = useState(null); // {id, nombre, ci}
  const [asignadoA, setAsignadoA] = useState(initialCase?.asignado_a ?? "");

  // catálogos
  const [operadores, setOperadores] = useState([]);
  const [pruebas, setPruebas] = useState([]);
  const [selPruebas, setSelPruebas] = useState([]); // uuid[]

  // anexos / preview
  const [docs, setDocs] = useState([]);
  const [preview, setPreview] = useState({ open: false, url: "", name: "", mime: "" });

  // pruebas del caso
  const [caseTests, setCaseTests] = useState([]); // [{prueba_id, estado, nombre, slug}]

  const [pickPatientOpen, setPickPatientOpen] = useState(false);

  // --------- Labels ----------
  const CASE_STATE_LABEL = {
    pendiente: "Pendiente",
    asignado: "Asignado",
    en_progreso: "En progreso",
    completada: "Completada",
    cancelada: "Cancelada",
  };

  const TEST_STATE_LABEL = {
    pendiente: "Pendiente",
    en_evaluacion: "En progreso",
    interrumpido: "Interrumpido",
    evaluado: "Completada",
  };

  const chipClass = (s) => `chip chip-${s || "pendiente"}`;

  // --------- Fila viva + realtime ----------
  useEffect(() => {
    if (!initialCase?.id) return;

    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("casos")
        .select("id, motivacion, paciente_id, asignado_a, estado, creado_en")
        .eq("id", initialCase.id)
        .maybeSingle();
      if (!active) return;
      if (!error && data) {
        setCaseRow(data);
        setMotivacion(data.motivacion ?? "");
        setPacienteId(data.paciente_id ?? null);
        setAsignadoA(data.asignado_a ?? "");
      }
    };

    load();

    const ch = supabase
      .channel(`rt-casos-${initialCase.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "casos", filter: `id=eq.${initialCase.id}` },
        (payload) => {
          if (payload?.new) setCaseRow((prev) => ({ ...(prev || {}), ...payload.new }));
          else load();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [initialCase?.id]);

  // --------- Catálogos ----------
  useEffect(() => {
    (async () => {
      if (isCreate || isEdit) {
        const { data: op } = await supabase
          .from("app_users")
          .select("id,nombre,rol,estado,deleted_at")
          .eq("rol", "operador")
          .eq("estado", "disponible")
          .is("deleted_at", null)
          .order("nombre");
        setOperadores(op || []);

        const { data: pr } = await supabase
          .from("pruebas")
          .select("id,nombre")
          .order("nombre");
        setPruebas(pr || []);
      }
    })();
  }, [isCreate, isEdit]);

  // --------- Paciente ----------
  useEffect(() => {
    (async () => {
      if (!pacienteId) { setPaciente(null); return; }
      const { data } = await supabase
        .from("pacientes")
        .select("id, doc_numero, nombres, apellidos")
        .eq("id", pacienteId)
        .maybeSingle();
      if (data) {
        setPaciente({
          id: data.id,
          nombre: `${data.nombres ?? ""} ${data.apellidos ?? ""}`.trim(),
          ci: data.doc_numero || "",
        });
      }
    })();
  }, [pacienteId]);

  // --------- Anexos (solo view) ----------
  useEffect(() => {
    (async () => {
      if (!isView || !caseRow?.paciente_id) { setDocs([]); return; }
      const { data } = await supabase
        .from("anexos")
        .select("id, titulo, path, bucket, mime_type, paciente_id, caso_id")
        .or(`paciente_id.eq.${caseRow.paciente_id},caso_id.eq.${caseRow.id}`)
        .order("created_at", { ascending: false });
      setDocs(data || []);
    })();
  }, [isView, caseRow?.paciente_id, caseRow?.id]);

  // --------- Pruebas del caso ----------
  const loadCaseTests = useRef(async () => {}).current;
  const setLoadCaseTests = (fn) => { loadCaseTests.current = fn; };

  useEffect(() => {
    setLoadCaseTests(async () => {
      if (!caseRow?.id) { setCaseTests([]); return; }

      const { data: cp, error } = await supabase
        .from("casos_pruebas")
        .select("prueba_id, estado, orden")
        .eq("caso_id", caseRow.id)
        .order("orden", { ascending: true });

      if (error) { console.error(error); setCaseTests([]); return; }
      const ids = (cp || []).map((r) => r.prueba_id);

      let map = {};
      if (ids.length) {
        // ▲ Traemos también slug para poder navegar a TestViewer
        const { data: pr, error: e2 } = await supabase
          .from("pruebas")
          .select("id, nombre, slug")
          .in("id", ids);
        if (!e2 && pr) {
          map = Object.fromEntries(pr.map((p) => [p.id, { nombre: p.nombre, slug: p.slug }]));
        }
      }

      const arr = (cp || []).map((r) => ({
        prueba_id: r.prueba_id,
        estado: r.estado,
        nombre: map[r.prueba_id]?.nombre || "",
        slug:   map[r.prueba_id]?.slug   || null,
      }));
      setCaseTests(arr);

      if (isEdit) setSelPruebas(ids);
    });
  }, [caseRow?.id, isEdit]);

  useEffect(() => { loadCaseTests.current?.(); }, [loadCaseTests]);

  useEffect(() => {
    if (!isView || !caseRow?.id) return;
    const ch = supabase
      .channel(`rt-casos_pruebas-${caseRow.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "casos_pruebas", filter: `caso_id=eq.${caseRow.id}` },
        () => loadCaseTests.current?.()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [isView, caseRow?.id]);

  // --------- Helpers preview ----------
  const openPreview = async (d) => {
    const { data, error } = await supabase.storage.from(d.bucket).createSignedUrl(d.path, 120);
    if (error) { alert(error.message); return; }
    setPreview({ open: true, url: data.signedUrl, name: d.titulo || d.path, mime: d.mime_type || "" });
  };
  const closePreview = () => setPreview({ open: false, url: "", name: "", mime: "" });
  const downloadDoc = async (d) => {
    const { data, error } = await supabase.storage.from(d.bucket).createSignedUrl(d.path, 60);
    if (error) { alert(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  // --------- Guardar ----------
  const guardar = async () => {
    if (isCreate) {
      const { error } = await supabase.rpc("create_caso_con_pruebas", {
        p_paciente_id: pacienteId,
        p_asignado_a: asignadoA || null,
        p_motivacion: motivacion || null,
        p_pruebas: selPruebas,
      });
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase
        .from("casos")
        .update({ motivacion, asignado_a: asignadoA || null, paciente_id: pacienteId || null })
        .eq("id", caseRow.id);
      if (error) { alert(error.message); return; }

      const { data: existing } = await supabase
        .from("casos_pruebas")
        .select("prueba_id, orden")
        .eq("caso_id", caseRow.id);

      const ex = new Set((existing || []).map((r) => r.prueba_id));
      const sel = new Set(selPruebas);

      const toAdd = [...sel].filter((id) => !ex.has(id));
      const toRemove = [...ex].filter((id) => !sel.has(id));

      if (toAdd.length) {
        const start = (existing || []).length;
        const rows = toAdd.map((id, i) => ({
          caso_id: caseRow.id,
          prueba_id: id,
          estado: "pendiente",
          orden: start + i + 1,
        }));
        const { error: eAdd } = await supabase.from("casos_pruebas").insert(rows);
        if (eAdd) { alert(eAdd.message); return; }
      }
      if (toRemove.length) {
        const { error: eDel } = await supabase
          .from("casos_pruebas")
          .delete()
          .in("prueba_id", toRemove)
          .eq("caso_id", caseRow.id);
        if (eDel) { alert(eDel.message); return; }
      }
    }
    onSaved?.();
    onClose?.();
  };

  const fmtFecha = (iso) => {
    try { if (!iso) return "—"; return new Date(iso).toLocaleString(); }
    catch { return iso || "—"; }
  };

  const visibleEstado = caseRow?.estado || "pendiente";
  const visibleEstadoLabel = CASE_STATE_LABEL[visibleEstado] || visibleEstado;

  // ▲ Puede ejecutar prueba: operador asignado, caso NO finalizado, y prueba NO evaluada
  const canRunTest = (t) =>
    authUserId &&
    caseRow?.asignado_a === authUserId &&
    !["completada", "cancelada"].includes(visibleEstado) &&
    (t.estado || "pendiente") !== "evaluado" &&
    !!t.slug;

  const goToTest = (t) => {
    const qp = new URLSearchParams();
    qp.set("case", caseRow.id);
    if (paciente?.nombre) qp.set("nombre", paciente.nombre);
    navigate(`/test/${t.slug}?${qp.toString()}`);
  };

  return (
    <div className="mb-backdrop" onClick={onClose}>
      <div className="mb-modal" style={{ width: 980, maxWidth: "94vw" }} onClick={(e) => e.stopPropagation()}>
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
          {/* Col izquierda */}
          <div className="case-col">
            {(isCreate || isEdit) && (
              <div className="panel">
                <h4>Datos del caso</h4>

                <label>
                  Motivo / Contexto
                  <textarea rows={4} value={motivacion} onChange={(e) => setMotivacion(e.target.value)} />
                </label>

                <div className="grid2">
                  <label>
                    Operador (opcional)
                    <select value={asignadoA || ""} onChange={(e) => setAsignadoA(e.target.value || "")}>
                      <option value="">— Sin asignar (queda pendiente)</option>
                      {operadores.map((o) => (
                        <option key={o.id} value={o.id}>{o.nombre}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Paciente (opcional)
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        disabled
                        value={paciente ? `${paciente.nombre} (CI: ${paciente.ci || "—"})` : ""}
                        placeholder="Sin paciente"
                      />
                      <button type="button" className="btn-light" onClick={() => setPickPatientOpen(true)}>
                        Buscar
                      </button>
                      {paciente && (
                        <button type="button" className="btn-light" onClick={() => setPacienteId(null)}>
                          Quitar
                        </button>
                      )}
                    </div>
                  </label>
                </div>

                <label className="label-pills">
                  Pruebas a aplicar
                  <div className="pills">
                    {pruebas.map((p) => {
                      const active = selPruebas.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`pill ${active ? "pill--active" : ""}`}
                          onClick={() => {
                            setSelPruebas((prev) =>
                              prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                            );
                          }}
                          aria-pressed={active}
                        >
                          {p.nombre}
                        </button>
                      );
                    })}
                  </div>
                  <small className="hint">Haz clic para seleccionar o deseleccionar.</small>
                </label>
              </div>
            )}

            {isView && (
              <>
                <div className="panel">
                  <h4>Resumen del caso</h4>
                  <div className="kv">
                    <span className="k">Motivo/Contexto</span>
                    <span className="v">{caseRow?.motivacion || "—"}</span>
                  </div>
                  <div className="kv">
                    <span className="k">Estado</span>
                    <span className="v">
                      <span className={chipClass(visibleEstado)}>{visibleEstadoLabel}</span>
                    </span>
                  </div>
                  <div className="kv">
                    <span className="k">Creado</span>
                    <span className="v">{fmtFecha(caseRow?.creado_en)}</span>
                  </div>
                </div>

                <div className="panel" style={{ marginTop: 12 }}>
                  <h4>Pruebas asignadas</h4>
                  {caseTests.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>Sin pruebas asignadas</p>
                  ) : (
                    <ul className="test-list">
                      {caseTests.map((t) => (
                        <li key={t.prueba_id}>
                          <span className="test-name">{t.nombre}</span>
                          <span className={chipClass(t.estado)}>{TEST_STATE_LABEL[t.estado] || t.estado}</span>

                          {/* ▲ Acción para operador asignado */}
                          <div className="list-actions">
                            <button
                              className="btn-primary"
                              onClick={() => goToTest(t)}
                              disabled={!canRunTest(t)}
                              title={canRunTest(t) ? "Realizar" : "No disponible"}
                            >
                              ▶ Realizar
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Col derecha: paciente + documentos */}
          {isView && (
            <aside className="patient-col">
              <div className="panel">
                <h4>Paciente</h4>

                {!caseRow?.paciente_id && (
                  <p className="muted" style={{ margin: 0 }}>
                    Este caso aún no tiene paciente asignado.
                  </p>
                )}

                {caseRow?.paciente_id && (
                  <>
                    <div className="patient-card">
                      <div className="icon"><FaUserCircle /></div>
                      <div className="meta">
                        <div className="name">{paciente?.nombre || "—"}</div>
                        <div className="ci">CI: {paciente?.ci || "—"}</div>
                      </div>
                    </div>

                    <h5 style={{ margin: "14px 0 8px" }}>Documentos</h5>
                    <ul className="doc-list">
                      {docs.length === 0 && <li className="muted">Sin documentos</li>}
                      {docs.map((d) => (
                        <li key={d.id}>
                          <button className="doc-left as-link" onClick={() => openPreview(d)} title="Ver">
                            <FaFileAlt />
                            <span className="doc-name" title={d.titulo || d.path}>
                              {d.titulo || d.path}
                            </span>
                          </button>
                          <div className="doc-actions">
                            <button className="btn-light" title="Descargar" onClick={() => downloadDoc(d)}>
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
            <button className="btn-primary" onClick={guardar}>Guardar</button>
          )}
        </div>
      </div>

      {pickPatientOpen && (
        <ModalSelectPaciente
          pacientes={[]}
          onClose={() => setPickPatientOpen(false)}
          onSelect={(id) => { setPacienteId(id); setPickPatientOpen(false); }}
        />
      )}

      {/* Preview modal */}
      {preview.open && (
        <div className="mb-backdrop" onClick={closePreview}>
          <div className="mb-modal" style={{ width: "min(900px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-header">
              <h3>Vista previa: {preview.name}</h3>
              <button className="mb-close" onClick={closePreview}>×</button>
            </div>
            <div className="mb-body preview-body">
              {(
                preview.mime?.startsWith("image/") ||
                /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(preview.name)
              ) ? (
                <img src={preview.url} alt={preview.name} />
              ) : preview.mime === "application/pdf" || /\.pdf$/i.test(preview.name) ? (
                <iframe src={preview.url} title="preview" />
              ) : (
                <p className="muted">No hay vista previa para este tipo de archivo. Usa el botón de descarga.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
