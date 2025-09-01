import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/TestViewer.css";

const SLUG2CODE = { pai: "PAI", "mcmi-iv": "MCMI-IV", "mmpi-2": "MMPI-2" };

export default function TestViewer() {
  const { testId } = useParams();
  const [sp] = useSearchParams();
  const caseId = sp.get("case") || null;
  const pacienteNombre = sp.get("nombre") || "";

  const navigate = useNavigate();

  const [items, setItems] = useState([]);  // [{id, texto, opciones, inverso, orden}]
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [time, setTime] = useState(0);

  const [attemptId, setAttemptId] = useState(null);
  const [pruebaId, setPruebaId] = useState(null);

  const tickingRef = useRef(null);
  const savingRef = useRef(false);     // ← candado anti doble-click
  const finishedRef = useRef(false);   // evita finish doble

  const storageKey = useMemo(
    () => `progress-${testId}-${caseId || "no-case"}`,
    [testId, caseId]
  );

  const code = useMemo(
    () => SLUG2CODE[testId] ?? (testId || "").toUpperCase(),
    [testId]
  );

  async function ensureAttempt(pid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión.");

    // 1) intento abierto
    const { data: abiertos, error: e1 } = await supabase
      .from("intentos_prueba")
      .select("id")
      .eq("caso_id", caseId)
      .eq("prueba_id", pid)
      .is("terminado_en", null)
      .limit(1);

    if (e1) throw e1;
    if (abiertos && abiertos.length) return abiertos[0].id;

    // 2) crear intento
    const { data: creado, error: e2 } = await supabase
      .from("intentos_prueba")
      .insert({ caso_id: caseId, prueba_id: pid })
      .select("id")
      .single();

    if (e2) throw e2;
    return creado.id;
  }

  // Cargar ítems y preparar viewer
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        // 0) prueba
        const { data: pruebas, error: eP } = await supabase
          .from("pruebas")
          .select("id, codigo")
          .ilike("codigo", code)
          .limit(1);

        if (eP) throw eP;
        if (!pruebas?.length) throw new Error("No se encontró la prueba en la base de datos.");

        const pid = pruebas[0].id;
        if (!alive) return;
        setPruebaId(pid);

        // 0.1) bloquear si ya está terminada para ESTE caso
        if (caseId) {
          const { data: comp, error: eComp } = await supabase
            .from("intentos_prueba")
            .select("id")
            .eq("caso_id", caseId)
            .eq("prueba_id", pid)
            .not("terminado_en", "is", null)
            .limit(1);

          if (eComp) throw eComp;
          if (comp && comp.length) {
            if (alive) setErr("Esta prueba ya fue completada para este caso.");
            return;
          }
        }

        // 1) ítems
        const { data, error } = await supabase
          .from("items_prueba")
          .select("id, enunciado, tipo, opciones, inverso, orden, activo")
          .eq("prueba_id", pid)
          .eq("activo", true)
          .order("orden", { ascending: true })
          .limit(1000);

        if (error) throw error;
        if (!data?.length) throw new Error("No hay ítems para esta prueba.");

        const mapped = data.map((r, i) => ({
          id: r.id,
          texto: r.enunciado,
          tipo: r.tipo || "opcion",
          opciones: normalizeOptions(r.opciones),
          inverso: !!r.inverso,
          orden: r.orden ?? i + 1,
        }));

        if (!alive) return;
        setItems(mapped);

        // 2) restaurar progreso
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const s = JSON.parse(saved);
            if (Number.isInteger(s.currentIndex)) setCurrentIndex(s.currentIndex);
            if (typeof s.time === "number") setTime(s.time);
          } catch {}
        }

        // 3) asegurar intento
        const atid = await ensureAttempt(pid);
        if (!alive) return;
        setAttemptId(atid);

        // 4) timer
        if (tickingRef.current) clearInterval(tickingRef.current);
        tickingRef.current = setInterval(() => {
          setTime((t) => t + 1);
        }, 1000);
      } catch (e) {
        console.error(e);
        if (alive) setErr(e.message || "Error cargando la prueba.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (tickingRef.current) clearInterval(tickingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, caseId, code, storageKey]);

  // Guardar progreso en localStorage
  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ testId, caseId, currentIndex, time })
    );
  }, [currentIndex, time, testId, caseId, storageKey]);

  // Guardar respuesta (idempotente + candado)
  async function handleAnswer(valor) {
    // bloquea si ya está guardando o no hay intento listo
    if (savingRef.current || !attemptId) return;

    const idxSnapshot = currentIndex;    // evita carreras con setState async
    const q = items[idxSnapshot];
    if (!q) return;

    savingRef.current = true;
    try {
      const payload = {
        caso_id: caseId,
        prueba_id: pruebaId,
        item_id: q.id,
        valor: String(valor),
        intento_id: attemptId,     // ← clave verdadera del intento
        invertido: q.inverso ?? false,
      };

      const { error } = await supabase
        .from("respuestas")
        .upsert(payload, {
          onConflict: "intento_id,item_id",  // ← IMPORTANTE
          ignoreDuplicates: false,
        });

      if (error) console.error("Error guardando respuesta:", error);
    } catch (e) {
      console.error("Excepción guardando respuesta:", e);
    } finally {
      // avanza SOLO si seguimos en el mismo índice
      setCurrentIndex((i) => (i === idxSnapshot ? i + 1 : i));
      savingRef.current = false;
    }
  }

  async function finishAttempt() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      if (attemptId) {
        await supabase
          .from("intentos_prueba")
          .update({ terminado_en: new Date().toISOString() })
          .eq("id", attemptId);
      }
    } catch (e) {
      console.error("Error marcando intento como terminado:", e);
    } finally {
      localStorage.removeItem(storageKey);
      navigate("/evaluaciones");
    }
  }

  // render
  if (loading) return <div className="loader">Cargando prueba...</div>;
  if (err) return <div className="loader" style={{ color: "crimson" }}>{err}</div>;

  const total = items.length;
  if (currentIndex >= total) {
    finishAttempt();
    return (
      <div className="finish-wrap">
        <div className="finish-card">
          <div className="finish-icon">✅</div>
          <h1 className="finish-title">¡Prueba completada!</h1>
          <div className="finish-actions">
            <button className="btn-back" onClick={() => navigate("/evaluaciones")}>
              ← Volver a Evaluaciones
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pregunta = items[currentIndex];
  const opciones = pregunta.opciones?.length ? pregunta.opciones : ["Nada", "Poco", "Algo", "Mucho"];
  const progreso = Math.round((currentIndex / Math.max(1, total)) * 100);

  const botonesDeshabilitados = savingRef.current || !attemptId;

  return (
    <div className="test-topbar-container">
      <div className="test-topbar">
        <img src="static/images/logo.png" alt="Logo" height={40} />
        <div className="test-timer">⏱ {formatTime(time)}</div>
        <button className="btn-exit" onClick={finishAttempt}>✖</button>
      </div>

      <div className="test-container">
        <div className="test-header">
          <h3>{code} · Pregunta {currentIndex + 1}</h3>
          <div style={{ marginLeft: "auto" }}>Paciente: {pacienteNombre || "—"}</div>
        </div>

        <div className="test-question">
          <p>
            {pregunta.texto}
            <button title="Escuchar" onClick={() => leerTexto(pregunta.texto)}>🔊</button>
          </p>
        </div>

        <div className="test-options">
          {opciones.map((op, idx) => (
            <button
              key={idx}
              className="btn-opcion"
              onClick={() => handleAnswer(op)}
              disabled={botonesDeshabilitados}
              title={!attemptId ? "Preparando intento..." : "Seleccionar"}
            >
              {op}
            </button>
          ))}
        </div>

        <div className="test-progress-bar">
          <div className="test-progress" style={{ width: `${progreso}%` }} />
          <span>{progreso}%</span>
        </div>
      </div>
    </div>
  );
}

// utils
function normalizeOptions(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch {}
    try { return JSON.parse(v.replace(/'/g, '"')); } catch {}
    return v.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function formatTime(total) {
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function leerTexto(texto) {
  try {
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = "es-LA";
    speechSynthesis.speak(utterance);
  } catch {}
}
