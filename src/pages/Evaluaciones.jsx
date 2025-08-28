// src/pages/Evaluaciones.jsx
import "../styles/Evaluaciones.css";
import {
  FaUserCircle,
  FaEdit,
  FaTrash,
  FaPlay,
  FaSearch,
  FaEye,
} from "react-icons/fa";
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Unifica crear/editar/ver
import ModalEvaluacion from "../components/ModalEvaluacion";

const PAGE_SIZE = 8;

export default function Evaluaciones() {
  const navigate = useNavigate();

  // --- Perfil actual ---
  const [userId, setUserId] = useState(null);
  const [role, setRole] = useState(null); // administrador | operador | asistente

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(user?.id ?? null);

      if (user?.id) {
        const { data } = await supabase
          .from("app_users")
          .select("rol")
          .eq("id", user.id)
          .maybeSingle();
        setRole(data?.rol ?? null);
      }
    })();
    return () => { alive = false; };
  }, []);

  const isAdmin = role === "administrador";
  const isOperator = role === "operador";
  const isAssistant = role === "asistente";

  // --- Estado tabla/paginación/filtros ---
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos"); // todos | pendiente | en_evaluacion | evaluado

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // --- Carga de casos ---
  const load = useCallback(async () => {
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // 🔹 Traemos todas las columnas que el modal usa
    let query = supabase
      .from("casos")
      .select(
        `
        id,
        paciente_nombre,
        paciente_ci,
        fecha_nacimiento,
        genero,
        nivel_educativo,
        ocupacion,
        antecedentes,
        motivacion,
        asignado_a,
        creado_en,
        estado
        `,
        { count: "exact" }
      )
      .order("creado_en", { ascending: false })
      .range(from, to);

    if (q.trim()) {
      query = query.or(
        `paciente_nombre.ilike.%${q}%,paciente_ci.ilike.%${q}%,motivacion.ilike.%${q}%`
      );
    }
    if (status !== "todos") {
      query = query.eq("estado", status);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error(error);
      setRows([]);
      setTotal(0);
    } else {
      setRows(data || []);
      setTotal(count || 0);
    }

    setLoading(false);
  }, [page, status, q]);

  // carga inicial + cada cambio de page/status/q
  useEffect(() => { load(); }, [load]);

  // realtime: mantén siempre la versión más reciente de load
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("rt-casos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "casos" },
        () => loadRef.current()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // --- Modal unificado (crear/editar/ver) ---
  const [modal, setModal] = useState({
    open: false,
    mode: "create",     // create | edit | view
    initialCase: null,  // datos del caso para edit/view
  });

  const openCreate = () =>
    setModal({ open: true, mode: "create", initialCase: null });

  // 🔹 En Ver y Editar pedimos el registro completo (con fallback)
  const openView = async (r) => {
    try {
      const { data, error } = await supabase
        .from("casos")
        .select("*")
        .eq("id", r.id)
        .maybeSingle();
      setModal({ open: true, mode: "view", initialCase: error ? r : (data || r) });
    } catch {
      setModal({ open: true, mode: "view", initialCase: r });
    }
  };

  const openEdit = async (r) => {
    try {
      const { data, error } = await supabase
        .from("casos")
        .select("*")
        .eq("id", r.id)
        .maybeSingle();
      setModal({ open: true, mode: "edit", initialCase: error ? r : (data || r) });
    } catch {
      setModal({ open: true, mode: "edit", initialCase: r });
    }
  };

  const closeModal = () => setModal({ open: false, mode: "create", initialCase: null });

  // --- Acciones por fila ---
  const toSlug = (s) => (s || "").toString().toLowerCase().replace(/\s+/g, "-");

  const handleRealizar = (r) => {
    const params = new URLSearchParams({
      case: r.id,
      nombre: r.paciente_nombre ?? "",
      suggested: r.prueba ? toSlug(r.prueba) : ""
    });
    navigate(`/tests?${params.toString()}`);
  };

  const handleEliminar = async (r) => {
    if (!isAdmin) return;
    if (!confirm(`¿Eliminar la evaluación de ${r.paciente_nombre}?`)) return;

    const { error } = await supabase.from("casos").delete().eq("id", r.id);
    if (error) {
      alert(error.message);
    } else {
      if (total - 1 <= (page - 1) * PAGE_SIZE && page > 1) {
        setPage((p) => p - 1);
      } else {
        load();
      }
    }
  };

  const statusChip = (s) => (
    <span className={`chip chip-${s}`}>
      {s === "pendiente" && "Pendiente"}
      {s === "en_evaluacion" && "En evaluación"}
      {s === "evaluado" && "Evaluado"}
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

  return (
    <div className="evaluaciones-page">
      <div className="header">
        <div>
          <p>Lista de casos creados para ser evaluados</p>
        </div>

        <div className="actions-right">
          <div className="searchbox">
            <FaSearch />
            <input
              placeholder="Buscar por nombre, CI o motivo…"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>

          <select
            className="filtro"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_evaluacion">En evaluación</option>
            <option value="evaluado">Evaluado</option>
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
          <thead>
            <tr>
              <th>Individuo</th>
              <th>CI</th>
              <th>Motivo/Contexto</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th className="col-acciones-header">Acción</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="muted">Cargando…</td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Sin registros</td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => {
                const canDoTest =
                  isOperator && userId && r.asignado_a === userId && r.estado !== "evaluado";
                const canEdit = isAdmin;
                const canDelete = isAdmin;
                const canView = isAssistant || canEdit || canDoTest;

                return (
                  <tr key={r.id}>
                    <td className="col-individuo">
                      <FaUserCircle className="avatar" />
                      <div className="name">
                        <div className="nombre">{r.paciente_nombre}</div>
                      </div>
                    </td>

                    <td className="col-ci">{r.paciente_ci || "—"}</td>

                    <td className="col-detalles" title={r.motivacion || ""}>
                      {r.motivacion || "—"}
                    </td>

                    <td className="col-fecha">
                      {r.creado_en
                        ? new Date(r.creado_en).toLocaleDateString()
                        : "—"}
                    </td>

                    <td className="col-estado">{statusChip(r.estado)}</td>

                    <td className="col-acciones">
                      <div className="actions-wrap">
                        {/* Operador asignado: Realizar */}
                        {canDoTest && (
                          <button
                            className="btn btn-sm btn-primary"
                            title="Realizar"
                            onClick={() => handleRealizar(r)}
                          >
                            <FaPlay />
                            <span>Realizar</span>
                          </button>
                        )}

                        {/* Ver (asistente siempre; admin y operador también pueden) */}
                        {canView && (
                          <button
                            className="btn btn-sm btn-light"
                            title="Ver"
                            onClick={() => openView(r)}
                          >
                            <FaEye />
                            <span>Ver</span>
                          </button>
                        )}

                        {/* Admin: Editar y Eliminar */}
                        {canEdit && (
                          <button
                            className="btn btn-sm btn-light"
                            title="Editar"
                            onClick={() => openEdit(r)}
                          >
                            <FaEdit />
                            <span>Editar</span>
                          </button>
                        )}

                        {canDelete && (
                          <button
                            className="btn btn-sm btn-danger"
                            title="Eliminar"
                            onClick={() => handleEliminar(r)}
                          >
                            <FaTrash />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {/* Paginación sin scroll */}
        <div className="pagination">
          <button
            className="pg"
            disabled={page === 1}
            onClick={() => setPage(1)}
            aria-label="Primera"
          >
            «
          </button>
          <button
            className="pg"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Anterior"
          >
            ‹
          </button>

          {pagesToShow.map((n) => (
            <button
              key={n}
              className={`pg ${n === page ? "active" : ""}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}

          <button
            className="pg"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Siguiente"
          >
            ›
          </button>
          <button
            className="pg"
            disabled={page === totalPages}
            onClick={() => setPage(totalPages)}
            aria-label="Última"
          >
            »
          </button>
        </div>
      </div>

      {/* Modal unificado */}
      {modal.open && (
        <ModalEvaluacion
          mode={modal.mode}                // "create" | "edit" | "view"
          initialCase={modal.initialCase}  // null para create
          onClose={closeModal}
          onSaved={load}                   // refresca al guardar
        />
      )}
    </div>
  );
}
