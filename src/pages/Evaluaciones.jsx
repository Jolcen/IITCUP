// src/pages/Evaluaciones.jsx
import "../styles/Evaluaciones.css";
import { FaUserCircle, FaEdit, FaTrash, FaPlay, FaSearch, FaEye, FaUserPlus } from "react-icons/fa";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

import ModalEvaluacion from "../components/ModalEvaluacion";
import ModalSelectPaciente from "../components/ModalSelectPaciente";

const PAGE_SIZE = 8;

export default function Evaluaciones() {
  const navigate = useNavigate();

  // --- Perfil actual (rol) ---
  const [userId, setUserId] = useState(null);
  const [role, setRole] = useState(null); // administrador | encargado | operador | asistente
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(user?.id ?? null);

      let r = null;
      if (user?.id) {
        const { data } = await supabase
          .from("app_users")
          .select("rol")
          .eq("id", user.id)
          .maybeSingle();
        r = data?.rol ?? null;
      }
      setRole(r);
      setAuthReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const isAdmin = role === "administrador" || role === "encargado";
  const isOperator = role === "operador";
  const isAssistant = role === "asistente";

  // --- Estado tabla/paginación/filtros ---
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos"); // pendiente | asignado | en_progreso | completada | cancelada | todos
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // --- Asignar paciente ---
  const [selectPaciente, setSelectPaciente] = useState({ open: false, caseId: null });
  const abrirAsignar = (r) => setSelectPaciente({ open: true, caseId: r.id });
  const cerrarAsignar = () => setSelectPaciente({ open: false, caseId: null });
  const asignarPaciente = async (pacienteId) => {
    if (!isAdmin) return;
    const { error } = await supabase
      .from("casos")
      .update({ paciente_id: pacienteId })
      .eq("id", selectPaciente.caseId);
    if (error) alert(error.message);
    cerrarAsignar();
    await loadRef.current?.();
  };

  // --- Helper: marcar en_progreso al pulsar "Realizar" ---
  const markInProgress = useCallback(
    async (casoId, currentEstado, assignedTo) => {
      if (!(isOperator && userId && assignedTo === userId)) return;
      if (!["pendiente", "asignado"].includes(currentEstado)) return;

      const { error } = await supabase
        .from("casos")
        .update({ estado: "en_progreso" })
        .eq("id", casoId)
        .eq("asignado_a", userId)
        .in("estado", ["pendiente", "asignado"]);

      if (!error) {
        // Optimista en la grilla
        setRows((prev) =>
          prev.map((row) => (row.id === casoId ? { ...row, estado: "en_progreso" } : row))
        );
      } else {
        console.warn("No se pudo marcar en_progreso:", error.message);
      }
    },
    [isOperator, userId]
  );

  // --- Carga de casos (desde la VISTA) ---
  const reqRef = useRef(0); // anti-race
  const load = useCallback(async () => {
    if (!authReady) return;

    const myReq = ++reqRef.current;
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("v_caso_resumen")
      .select(
        "id,paciente_id,paciente_nombre,paciente_ci,motivacion,asignado_a,operador_nombre,creado_en,estado",
        { count: "exact" }
      )
      .order("creado_en", { ascending: false })
      .range(from, to);

    // Operador: solo sus casos y no finalizados
    if (isOperator && userId) {
      query = query
        .eq("asignado_a", userId)
        .in("estado", ["pendiente", "asignado", "en_progreso"]);
    }

    // Búsqueda
    if (q.trim()) {
      const term = `%${q.trim()}%`;
      query = query.or(
        `paciente_nombre.ilike.${term},paciente_ci.ilike.${term},motivacion.ilike.${term},operador_nombre.ilike.${term}`
      );
    }

    // Filtro de estado
    if (status !== "todos") {
      query = query.eq("estado", status);
    }

    const { data, error, count } = await query;

    if (myReq !== reqRef.current) return; // ignora respuestas viejas

    if (error) {
      console.error(error);
      setRows([]);
      setTotal(0);
    } else {
      setRows(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [authReady, page, status, q, isOperator, userId]);

  useEffect(() => { load(); }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Realtime (opcional)
  useEffect(() => {
    const ch1 = supabase
      .channel("rt-casos")
      .on("postgres_changes", { event: "*", schema: "public", table: "casos" }, () => loadRef.current?.())
      .subscribe();
    return () => supabase.removeChannel(ch1);
  }, []);

  // --- Modal evaluación ---
  const [modal, setModal] = useState({ open: false, mode: "create", initialCase: null });
  const openCreate = () => setModal({ open: true, mode: "create", initialCase: null });

  const openView = async (r) => {
    const { data, error } = await supabase.from("casos").select("*").eq("id", r.id).maybeSingle();
    setModal({ open: true, mode: "view", initialCase: error ? r : (data || r) });
  };

  const openEdit = async (r) => {
    const { data, error } = await supabase.from("casos").select("*").eq("id", r.id).maybeSingle();
    setModal({ open: true, mode: "edit", initialCase: error ? r : (data || r) });
  };

  const closeModal = () => setModal({ open: false, mode: "create", initialCase: null });

  // --- Realizar: marca en_progreso (solo caso) y navega ---
  const handleRealizar = async (r) => {
    await markInProgress(r.id, r.estado, r.asignado_a);
    const params = new URLSearchParams({
      case: r.id,
      nombre: r.paciente_nombre ?? "",
      suggested: ""
    });
    navigate(`/tests?${params.toString()}`);
  };

  const handleEliminar = async (r) => {
    if (!isAdmin) return;
    if (!confirm(`¿Eliminar la evaluación de ${r.paciente_nombre || "este caso"}?`)) return;
    const { error } = await supabase.from("casos").delete().eq("id", r.id);
    if (error) alert(error.message);
    else {
      if (total - 1 <= (page - 1) * PAGE_SIZE && page > 1) setPage((p) => p - 1);
      else load();
    }
  };

  const statusChip = (s) => (
    <span className={`chip chip-${s || "pendiente"}`}>
      {s === "pendiente" && "Pendiente"}
      {s === "asignado" && "Asignado"}
      {s === "en_progreso" && "En progreso"}
      {s === "completada" && "Completada"}
      {s === "cancelada" && "Cancelada"}
      {!["pendiente","asignado","en_progreso","completada","cancelada"].includes(s) && s}
    </span>
  );

  const pagesToShow = useMemo(() => {
    const max = 5;
    const start = Math.max(1, page - Math.floor(max / 2));
    const end = Math.min(totalPages, start + max - 1);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  const canShowRealizar = (r) =>
    isOperator && userId && r.asignado_a === userId &&
    ["asignado", "en_progreso", "pendiente"].includes(r.estado);

  const canShowView = (r) => isAssistant || isAdmin || canShowRealizar(r);

  return (
    <div className="evaluaciones-page">
      <div className="header">
        <div><p>Lista de casos creados para ser evaluados</p></div>

        <div className="actions-right">
          <div className="searchbox">
            <FaSearch />
            <input
              placeholder="Buscar por nombre, CI, operador o motivo…"
              value={q}
              onChange={(e) => { setPage(1); setQ(e.target.value); }}
            />
          </div>

          <select
            className="filtro"
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="asignado">Asignado</option>
            <option value="en_progreso">En progreso</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>

          {isAdmin && (
            <button className="btn-add" onClick={openCreate}>
              + Nueva evaluación
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        <table>
          <colgroup>
            <col className="c-individuo" />
            <col className="c-ci" />
            <col className="c-detalles" />
            <col className="c-fecha" />
            <col className="c-estado" />
            <col className="c-acciones" />
          </colgroup>

          <thead>
            <tr>
              <th className="col-individuo">Individuo</th>
              <th className="col-ci">CI</th>
              <th className="col-detalles">Motivo/Contexto</th>
              <th className="col-fecha">Fecha</th>
              <th className="col-estado">Estado</th>
              <th className="col-acciones">Acción</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr><td colSpan={6} className="muted">Cargando…</td></tr>
            )}

            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="muted">Sin registros</td></tr>
            )}

            {!loading && rows.map((r) => {
              const canEdit = isAdmin;
              const canDelete = isAdmin;

              return (
                <tr key={r.id}>
                  <td className="col-individuo">
                    <FaUserCircle className="avatar" />
                    <div className="name">
                      <div className="nombre" title={r.paciente_nombre || ""}>
                        {r.paciente_nombre || <span className="muted">— Sin paciente</span>}
                      </div>
                      {r.operador_nombre && <div className="sub">Asignado a: {r.operador_nombre}</div>}
                    </div>
                  </td>

                  <td className="col-ci">{r.paciente_ci || "—"}</td>
                  <td className="col-detalles" title={r.motivacion || ""}>{r.motivacion || "—"}</td>
                  <td className="col-fecha">{r.creado_en ? new Date(r.creado_en).toLocaleDateString() : "—"}</td>
                  <td className="col-estado">{statusChip(r.estado)}</td>

                  <td className="col-acciones">
                    <div className="actions-wrap">
                      {isAdmin && !r.paciente_nombre && (
                        <button
                          className="btn btn-sm btn-light"
                          title="Asignar paciente"
                          onClick={() => abrirAsignar(r)}
                        >
                          <FaUserPlus /><span>Asignar</span>
                        </button>
                      )}

                      {canShowRealizar(r) && (
                        <button
                          className="btn btn-sm btn-primary"
                          title="Realizar"
                          onClick={() => handleRealizar(r)}
                        >
                          <FaPlay /><span>Realizar</span>
                        </button>
                      )}

                      {canShowView(r) && (
                        <button className="btn btn-sm btn-light" title="Ver" onClick={() => openView(r)}>
                          <FaEye /><span>Ver</span>
                        </button>
                      )}

                      {canEdit && (
                        <button className="btn btn-sm btn-light" title="Editar" onClick={() => openEdit(r)}>
                          <FaEdit /><span>Editar</span>
                        </button>
                      )}

                      {canDelete && (
                        <button className="btn btn-sm btn-danger" title="Eliminar" onClick={() => handleEliminar(r)}>
                          <FaTrash /><span>Eliminar</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination-fixed">
          <button className="pg" disabled={page === 1} onClick={() => setPage(1)} aria-label="Primera">«</button>
          <button className="pg" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Anterior">‹</button>
          {pagesToShow.map((n) => (
            <button key={n} className={`pg ${n === page ? "current" : ""}`} onClick={() => setPage(n)}>
              {n}
            </button>
          ))}
          <button className="pg" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Siguiente">›</button>
          <button className="pg" disabled={page === totalPages} onClick={() => setPage(totalPages)} aria-label="Última">»</button>
        </div>
      )}

      {modal.open && (
        <ModalEvaluacion
          mode={modal.mode}
          initialCase={modal.initialCase}
          onClose={closeModal}
          onSaved={load}
        />
      )}

      {selectPaciente.open && (
        <ModalSelectPaciente
          pacientes={[]}
          onClose={cerrarAsignar}
          onSelect={asignarPaciente}
        />
      )}
    </div>
  );
}
