import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/Tests.css";

// Slug -> código (como en la BD `pruebas.codigo`)
const SLUG2CODE = { pai: "PAI", "mcmi-iv": "MCMI-IV", "mmpi-2": "MMPI-2", custom: "CUSTOM" };
const CODE2SLUG = Object.fromEntries(Object.entries(SLUG2CODE).map(([slug, code]) => [code, slug]));

// Catálogo visual
const tests = [
  { id: "pai",     nombre: "Personality Assessment Inventory",                imagen: "static/images/pai.jpg" },
  { id: "mcmi-iv", nombre: "Millon Clinical Multiaxial Inventory - IV",      imagen: "static/images/mcmi-iv.jpg" },
  { id: "mmpi-2",  nombre: "Minnesota Multiphasic Personality Inventory - 2", imagen: "static/images/mmpi-2.jpg" },
  { id: "custom",  nombre: "Test personalizado",                              imagen: "static/images/testP.jpg" },
];

export default function Tests() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const caseId    = sp.get("case") || "";
  const nombre    = sp.get("nombre") || "";
  const suggested = sp.get("suggested") || "";

  const [selectedId, setSelectedId] = useState(null);

  // { slug: true } para asignadas / completadas
  const [assignedBySlug, setAssignedBySlug] = useState({});
  const [doneBySlug, setDoneBySlug] = useState({});

  const [loadingAssigned, setLoadingAssigned] = useState(true);
  const [loadingDone, setLoadingDone] = useState(true);

  // ----- ASIGNADAS (lee casos_pruebas -> pruebas.codigo) -----
  useEffect(() => {
    let alive = true;

    const loadAssigned = async () => {
      setLoadingAssigned(true);
      if (!caseId) {
        setAssignedBySlug({});
        setLoadingAssigned(false);
        return;
      }

      const codes = new Set();

      const res = await supabase
        .from("casos_pruebas")
        .select("pruebas!inner(codigo)")
        .eq("caso_id", caseId);

      if (!res.error && Array.isArray(res.data) && res.data.length) {
        res.data.forEach(r => r?.pruebas?.codigo && codes.add(r.pruebas.codigo));
      } else {
        // Fallback dos pasos por si el join lo bloquea RLS
        const step1 = await supabase
          .from("casos_pruebas")
          .select("prueba_id")
          .eq("caso_id", caseId);

        if (!step1.error && step1.data?.length) {
          const ids = step1.data.map(r => r.prueba_id);
          const step2 = await supabase
            .from("pruebas")
            .select("id, codigo")
            .in("id", ids);
          if (!step2.error && step2.data?.length) {
            step2.data.forEach(p => p.codigo && codes.add(p.codigo));
          }
        }
      }

      if (!alive) return;
      const map = {};
      [...codes].forEach(code => {
        const slug = CODE2SLUG[code];
        if (slug) map[slug] = true;
      });

      setAssignedBySlug(map);
      setLoadingAssigned(false);
    };

    loadAssigned();
    return () => { alive = false; };
  }, [caseId]);

  // ----- COMPLETADAS (preferimos intentos_prueba.terminado_en) -----
  useEffect(() => {
    let alive = true;

    const loadDone = async () => {
      setLoadingDone(true);
      if (!caseId) {
        setDoneBySlug({});
        setLoadingDone(false);
        return;
      }

      const codes = new Set();

      const res = await supabase
        .from("intentos_prueba")
        .select("pruebas!inner(codigo)")
        .eq("caso_id", caseId)
        .not("terminado_en", "is", null);

      if (!res.error && Array.isArray(res.data) && res.data.length) {
        res.data.forEach(r => r?.pruebas?.codigo && codes.add(r.pruebas.codigo));
      } else {
        // Fallback dos pasos
        const step1 = await supabase
          .from("intentos_prueba")
          .select("prueba_id")
          .eq("caso_id", caseId)
          .not("terminado_en", "is", null);

        if (!step1.error && step1.data?.length) {
          const ids = step1.data.map(r => r.prueba_id);
          const step2 = await supabase
            .from("pruebas")
            .select("id, codigo")
            .in("id", ids);
          if (!step2.error && step2.data?.length) {
            step2.data.forEach(p => p.codigo && codes.add(p.codigo));
          }
        }
      }

      if (!alive) return;

      const map = {};
      [...codes].forEach(code => {
        const slug = CODE2SLUG[code];
        if (slug) map[slug] = true;
      });

      setDoneBySlug(map);
      setLoadingDone(false);
    };

    loadDone();
    return () => { alive = false; };
  }, [caseId]);

  // Preseleccionar: sugerida si está asignada y no completada; si no, primera disponible
  useEffect(() => {
    if (suggested && assignedBySlug[suggested] && !doneBySlug[suggested]) {
      setSelectedId(suggested);
      return;
    }
    const first = Object.keys(assignedBySlug).find(slug => assignedBySlug[slug] && !doneBySlug[slug]);
    setSelectedId(first || null);
  }, [suggested, assignedBySlug, doneBySlug]);

  const displayedTests = useMemo(
    () => tests.filter(t => assignedBySlug[t.id]),
    [assignedBySlug]
  );

  const handleSeleccionar = (id) => {
    if (!assignedBySlug[id]) return; // no asignada
    if (doneBySlug[id]) return;      // ya completada
    setSelectedId(id);
  };

  const handleRealizarTest = () => {
    if (!selectedId) return;
    if (!assignedBySlug[selectedId]) {
      alert("Esta prueba no está asignada al caso.");
      return;
    }
    if (doneBySlug[selectedId]) {
      alert("Esta prueba ya fue completada.");
      return;
    }

    const qs = new URLSearchParams();
    if (caseId) qs.set("case", caseId);
    if (nombre) qs.set("nombre", nombre);

    navigate(`/test/${selectedId}?${qs.toString()}`);
  };

  const loading = loadingAssigned || loadingDone;

  return (
    <div className="contenedor-tests">
      <h3>Pruebas psicológicas</h3>

      {nombre && (
        <div style={{ marginBottom: 12, opacity: 0.75 }}>
          Paciente: <strong>{nombre}</strong>
        </div>
      )}

      {loading && <div className="muted" style={{ marginTop: 12 }}>Cargando…</div>}

      {!loading && displayedTests.length === 0 && (
        <div className="muted" style={{ marginTop: 12 }}>
          Este caso no tiene pruebas asignadas.
        </div>
      )}

      <div className="grid-tests">
        {displayedTests.map((test) => {
          const done = !!doneBySlug[test.id];
          const isSelected = selectedId === test.id;

          return (
            <div
              key={test.id}
              className={`card-test ${isSelected ? "seleccionado" : ""} ${done ? "done" : ""}`}
              onClick={() => handleSeleccionar(test.id)}
              aria-disabled={done}
              title={done ? "Prueba completada" : "Seleccionar"}
            >
              {done && <span className="badge-done">Completada</span>}
              <img src={test.imagen} alt={test.nombre} />
              <div className="overlay" />
              <p>{test.nombre}</p>
            </div>
          );
        })}
      </div>

      <button
        className="btn-test"
        onClick={handleRealizarTest}
        disabled={!selectedId || !!doneBySlug[selectedId]}
        title={!selectedId ? "Selecciona una prueba" : (doneBySlug[selectedId] ? "Ya completada" : "Realizar")}
      >
        Realizar Prueba
      </button>
    </div>
  );
}
