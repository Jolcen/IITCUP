// src/pages/Tests.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/Tests.css";

// Slug -> código (como en la BD `pruebas.codigo`)
const SLUG2CODE = {
  "pai": "PAI",
  "mcmi-iv": "MCMI-IV",
  "mmpi-2": "MMPI-2",
  "custom": "CUSTOM",
};
const CODE2SLUG = Object.fromEntries(Object.entries(SLUG2CODE).map(([s, c]) => [c, s]));

const tests = [
  { id: "pai",     nombre: "Personality Assessment Inventory",                imagen: "static/images/pai.jpg" },
  { id: "mcmi-iv", nombre: "Millon Clinical Multiaxial Inventory - IV",      imagen: "static/images/mcmi-iv.jpg" },
  { id: "mmpi-2",  nombre: "Minnesota Multiphasic Personality Inventory - 2", imagen: "static/images/mmpi-2.jpg" },
  { id: "custom",  nombre: "Test personalizado",                              imagen: "static/images/testP.jpg" },
];

export default function Tests() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const caseId = sp.get("case") || "";
  const nombre = sp.get("nombre") || "";
  const suggested = sp.get("suggested") || ""; // opcional

  const [selectedId, setSelectedId]   = useState(null);
  const [doneBySlug, setDoneBySlug]   = useState({}); // { pai:true, ... }
  const [loading, setLoading]         = useState(true);

  // preseleccionar sugerida
  useEffect(() => {
    if (suggested && tests.some(t => t.id === suggested)) {
      setSelectedId(suggested);
    }
  }, [suggested]);

  // Carga qué pruebas ya están completadas para este caso
  useEffect(() => {
    let alive = true;
    async function loadDone() {
      setLoading(true);

      if (!caseId) {
        setDoneBySlug({});
        setLoading(false);
        return;
      }

      // 1) Intentar join a `pruebas` para traer `codigo`
      const res = await supabase
        .from("intentos_prueba")
        .select("id, terminado_en, pruebas!inner(codigo)")
        .eq("caso_id", caseId)
        .not("terminado_en", "is", null);

      let codes = new Set();

      if (!res.error && Array.isArray(res.data)) {
        res.data.forEach(r => {
          const code = r?.pruebas?.codigo;
          if (code) codes.add(code);
        });
      } else {
        // 2) Fallback (algunas instalaciones no permiten el join por RLS):
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

      // Convertimos códigos -> slugs
      const done = {};
      codes.forEach(code => {
        const slug = CODE2SLUG[code];
        if (slug) done[slug] = true;
      });
      setDoneBySlug(done);
      setLoading(false);
    }

    loadDone();
    return () => { alive = false; };
  }, [caseId]);

  const handleSeleccionar = (id) => {
    setSelectedId(id);
  };

  const handleRealizarTest = () => {
    if (!selectedId) {
      alert("❗ Debes seleccionar una prueba.");
      return;
    }
    if (doneBySlug[selectedId]) {
      alert("Esta prueba ya fue completada para este caso.");
      return;
    }

    const qs = new URLSearchParams();
    if (caseId) qs.set("case", caseId);
    if (nombre) qs.set("nombre", nombre);

    navigate(`/test/${selectedId}?${qs.toString()}`);
  };

  return (
    <div className="contenedor-tests">
      <h3>Pruebas psicológicas</h3>

      {/* Opcional: muestra el paciente si llega por query */}
      {nombre && (
        <div style={{ marginBottom: 12, opacity: 0.75 }}>
          Paciente: <strong>{nombre}</strong>
        </div>
      )}

      <div className="grid-tests">
        {tests.map((test) => {
          const done = !!doneBySlug[test.id];
          const isSelected = selectedId === test.id;

          return (
            <div
              key={test.id}
              className={`card-test ${isSelected ? "seleccionado" : ""} ${done ? "done" : ""}`}
              onClick={() => !done && handleSeleccionar(test.id)}
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
