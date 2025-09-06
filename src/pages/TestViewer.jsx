// src/pages/TestViewer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/TestViewer.css";

const SLUG2CODE = { pai: "PAI", "mcmi-iv": "MCMI-IV", "mmpi-2": "MMPI-2", custom: "CUSTOM" };
const OPERATOR_PASS_DEMO = "1234"; // ← demo

export default function TestViewer() {
  const { testId } = useParams();
  const [sp] = useSearchParams();
  const caseId = sp.get("case") || null;
  const pacienteNombre = sp.get("nombre") || "";
  const navigate = useNavigate();

  // Estado principal
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  // Tiempo (no visible), pre-start y BD ids
  const [time, setTime] = useState(0);
  const tickingRef = useRef(null);
  const startedAtRef = useRef(null);
  const [preStart, setPreStart] = useState(true);
  const [attemptId, setAttemptId] = useState(null);
  const [pruebaId, setPruebaId] = useState(null);

  // Candados
  const savingRef = useRef(false);
  const finishedRef = useRef(false);

  // Final flow (firma + pantalla final)
  const [showSignModal, setShowSignModal] = useState(false);
  const [showFinishScreen, setShowFinishScreen] = useState(false);

  // Modal contraseña operador (reutilizable)
  const [askPassOpen, setAskPassOpen] = useState(false);
  const operatorPassInputRef = useRef(null);
  const operatorPassName = useMemo(() => "op_" + Math.random().toString(36).slice(2), []);
  const deferredActionRef = useRef(null); // callback tras validar pass

  // Firma (canvas)
  const canvasRef = useRef(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const storageKey = useMemo(
    () => `progress-${testId}-${caseId || "no-case"}`,
    [testId, caseId]
  );

  const code = useMemo(
    () => SLUG2CODE[testId] ?? (testId || "").toUpperCase(),
    [testId]
  );

  // ====== TTS: voz más humana y SIN signos ======
  const [ttsVoice, setTtsVoice] = useState(null);
  const PREFERRED_VOICE_CANDIDATES = [
    "Google español de Estados Unidos",
    "Google español",
    "Microsoft Sabina Online (Natural) - Spanish (Mexico)",
    "Microsoft Dalia Online (Natural) - Spanish (Spain)",
    "Microsoft Alvaro Online (Natural) - Spanish (Spain)",
  ];
  function pickBestSpanishVoice(voices) {
    for (const wanted of PREFERRED_VOICE_CANDIDATES) {
      const v = voices.find(x => (x.name || "").toLowerCase().includes(wanted.toLowerCase()));
      if (v) return v;
    }
    const esVoices = voices.filter(v => (v.lang || "").toLowerCase().startsWith("es"));
    const natural = esVoices.find(v => /natural|online|neural/i.test(v.name || "")) || esVoices[0];
    return natural || voices[0] || null;
  }
  useEffect(() => {
    function loadVoices() {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      if (voices.length) setTtsVoice(pickBestSpanishVoice(voices));
    }
    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, []);
  function sanitizeForSpeech(raw) {
    if (!raw) return "";
    let t = String(raw);
    t = t.replace(/\bhttps?:\/\/\S+/gi, " ");
    t = t.replace(/[_/|\\\-]+/g, " ");
    t = t.replace(/[^\p{L}\s]+/gu, " "); // solo letras y espacios
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }
  function chunkText(t, maxLen = 180) {
    const words = t.split(/\s+/);
    const chunks = [];
    let buf = [], len = 0;
    for (const w of words) {
      if (len + w.length + 1 > maxLen) {
        if (buf.length) chunks.push(buf.join(" "));
        buf = [w]; len = w.length;
      } else { buf.push(w); len += w.length + 1; }
    }
    if (buf.length) chunks.push(buf.join(" "));
    return chunks;
  }
  function speakPregunta(texto) {
    try {
      const clean = sanitizeForSpeech(texto);
      if (!clean) return;
      window.speechSynthesis?.cancel?.();
      const chunks = chunkText(clean);
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = (ttsVoice?.lang) || "es-ES";
        if (ttsVoice) u.voice = ttsVoice;
        u.rate = 0.92; u.pitch = 1.0; u.volume = 1.0;
        if (i > 0) u.text = " " + u.text;
        window.speechSynthesis.speak(u);
      });
    } catch {}
  }
  // ====== fin TTS ======

  // focus-mode: oculta sidebar mientras este componente está montado
  useEffect(() => {
    document.body.classList.add("focus-test");
    return () => { document.body.classList.remove("focus-test"); };
  }, []);

  async function ensureAttempt(pid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión.");
    const { data: abiertos, error: e1 } = await supabase
      .from("intentos_prueba")
      .select("id")
      .eq("caso_id", caseId)
      .eq("prueba_id", pid)
      .is("terminado_en", null)
      .limit(1);
    if (e1) throw e1;
    if (abiertos && abiertos.length) return abiertos[0].id;
    const { data: creado, error: e2 } = await supabase
      .from("intentos_prueba")
      .insert({ caso_id: caseId, prueba_id: pid })
      .select("id")
      .single();
    if (e2) throw e2;
    return creado.id;
  }

  // Carga prueba + ítems
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

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

        if (caseId) {
          const { data: comp, error: eComp } = await supabase
            .from("intentos_prueba")
            .select("id")
            .eq("caso_id", caseId)
            .eq("prueba_id", pid)
            .not("terminado_en", "is", null)
            .limit(1);
          if (eComp) throw eComp;
          if (comp && comp.length) { if (alive) setErr("Esta prueba ya fue completada para este caso."); return; }
        }

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

        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const s = JSON.parse(saved);
            if (Number.isInteger(s.currentIndex)) setCurrentIndex(s.currentIndex);
          } catch {}
        }

        const atid = await ensureAttempt(pid);
        if (!alive) return;
        setAttemptId(atid);
      } catch (e) {
        console.error(e);
        if (alive) setErr(e.message || "Error cargando la prueba.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, caseId, code, storageKey]);

  // Iniciar prueba → arranca cronómetro y marca iniciado_en
  async function startTest() {
    if (!attemptId) return;
    try {
      const nowIso = new Date().toISOString();
      startedAtRef.current = Date.now();
      await supabase.from("intentos_prueba").update({ iniciado_en: nowIso }).eq("id", attemptId);
      if (tickingRef.current) clearInterval(tickingRef.current);
      setTime(0);
      tickingRef.current = setInterval(() => setTime(t => t + 1), 1000);
      setPreStart(false);
    } catch (e) {
      console.error("No se pudo marcar inicio:", e);
      if (tickingRef.current) clearInterval(tickingRef.current);
      setTime(0);
      tickingRef.current = setInterval(() => setTime(t => t + 1), 1000);
      setPreStart(false);
    }
  }

  // Guardar progreso índice
  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ testId, caseId, currentIndex })
    );
  }, [currentIndex, testId, caseId, storageKey]);

  // Guardar respuesta
  async function handleAnswer(valor) {
    if (savingRef.current || !attemptId) return;
    const idxSnapshot = currentIndex;
    const q = items[idxSnapshot];
    if (!q) return;

    savingRef.current = true;
    try {
      const payload = {
        caso_id: caseId,
        prueba_id: pruebaId,
        item_id: q.id,
        valor: String(valor),
        intento_id: attemptId,
        invertido: q.inverso ?? false,
      };
      const { error } = await supabase
        .from("respuestas")
        .upsert(payload, { onConflict: "intento_id,item_id", ignoreDuplicates: false });
      if (error) console.error("Error guardando respuesta:", error);
    } catch (e) {
      console.error("Excepción guardando respuesta:", e);
    } finally {
      setCurrentIndex((i) => (i === idxSnapshot ? i + 1 : i));
      savingRef.current = false;
    }
  }

  // === Fin de prueba: 1) pedir firma paciente -> 2) finalizar intento -> 3) pantalla final ===
  function requestSignature() {
    // abrir modal de firma
    setConsentChecked(false);
    setHasDrawn(false);
    setShowSignModal(true);
    setTimeout(setupCanvas, 0);
  }

  async function finalizeAttemptAfterSignature() {
    // Cierra modal de firma y marca finalizado
    setShowSignModal(false);
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      let dur = time;
      if (startedAtRef.current) {
        const ms = Date.now() - startedAtRef.current;
        dur = Math.max(dur, Math.floor(ms / 1000));
      }
      if (attemptId) {
        await supabase
          .from("intentos_prueba")
          .update({
            terminado_en: new Date().toISOString(),
            duracion_segundos: dur,
          })
          .eq("id", attemptId);
        // Si luego quieres guardar la firma (base64) en BD, aquí puedes tomarla:
        // const dataUrl = canvasRef.current?.toDataURL("image/png");
        // … y enviarla a una columna nueva (firma_base64) si existe.
      }
    } catch (e) {
      console.error("Error marcando intento como terminado:", e);
    } finally {
      localStorage.removeItem(storageKey);
      if (tickingRef.current) clearInterval(tickingRef.current);
      setShowFinishScreen(true);
    }
  }

  function normalizeOptions(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch {}
      try { return JSON.parse(v.replace(/'/g, '"')); } catch {}
      return v.split(",").map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  // ====== Canvas de firma ======
  function setupCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // tamaño responsivo básico
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(600, window.innerWidth - 48);
    const h = 180;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);
    // fondo blanco
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    // guía
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, h - 32);
    ctx.lineTo(w - 16, h - 32);
    ctx.stroke();
  }

  useEffect(() => {
    function onResize() {
      if (showSignModal) setupCanvas();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [showSignModal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let last = null;

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x, y };
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      last = pos(e);
      setHasDrawn(true);
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }
    function end(e) { drawing = false; last = null; }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);

    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);

      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [showSignModal]);

  function clearSignature() {
    setupCanvas();
    setHasDrawn(false);
  }
  // ====== fin firma ======

  // ====== Modal contraseña operador (anti-autofill) ======
  function openAskPassModal(onSuccess) {
    deferredActionRef.current = onSuccess;
    setAskPassOpen(true);
    setTimeout(() => {
      operatorPassInputRef.current?.setAttribute("value", ""); // evita autofill
      operatorPassInputRef.current?.focus();
    }, 0);
  }
  function closeAskPassModal() {
    setAskPassOpen(false);
    if (operatorPassInputRef.current) {
      operatorPassInputRef.current.value = "";
    }
  }
  function handleOperatorPassSubmit(e) {
    e.preventDefault();
    const val = operatorPassInputRef.current?.value || "";
    if (val === OPERATOR_PASS_DEMO) {
      const cb = deferredActionRef.current;
      closeAskPassModal();
      deferredActionRef.current = null;
      cb && cb();
    } else {
      alert("Contraseña incorrecta.");
      operatorPassInputRef.current?.focus();
    }
  }
  // ====== fin modal pass ======

  // Salir con X durante la prueba → pide pass y vuelve sin finalizar intento
  function requestExitToEvaluaciones() {
    openAskPassModal(() => {
      // cancelar lectura si estuviera activa
      try { window.speechSynthesis?.cancel?.(); } catch {}
      // no cerramos intento aquí (se deja abierto)
      localStorage.removeItem(storageKey);
      if (tickingRef.current) clearInterval(tickingRef.current);
      navigate("/evaluaciones");
    });
  }

  // Botón "Volver" en pantalla final → pide pass y vuelve
  function backFromFinish() {
    openAskPassModal(() => {
      navigate("/evaluaciones");
    });
  }

  // ===== render =====
  if (loading) return <div className="loader">Cargando prueba...</div>;
  if (err) return <div className="loader" style={{ color: "crimson" }}>{err}</div>;

  const total = items.length;

  // Si terminó de responder → pedir firma (una sola vez)
  if (!preStart && !showFinishScreen && !showSignModal && currentIndex >= total && !finishedRef.current) {
    // en lugar de finalizar directo, pedimos firma
    requestSignature();
    return null;
  }

  // Pantalla de inicio
  if (preStart) {
    return (
      <div className="focus-wrap">
        <div className="focus-card">
          <img src="static/images/logo.png" alt="Logo" height={46} style={{ opacity: .9 }} />
          <h1 className="focus-title">Iniciar {code}</h1>
          <p className="focus-sub">
            {pacienteNombre ? <>Paciente: <strong>{pacienteNombre}</strong></> : "Listo para comenzar."}
          </p>
          <ul className="focus-bullets">
            <li>Se mostrará una pregunta a la vez.</li>
            <li>No verás temporizador ni porcentaje de avance.</li>
            <li>Puedes escuchar cada pregunta con el botón “🔊”.</li>
          </ul>
          <div className="focus-actions">
            <button className="btn-start" onClick={startTest} disabled={!attemptId}>Iniciar prueba</button>
            <button className="btn-cancel" onClick={() => requestExitToEvaluaciones()}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla final (tras firmar)
  if (showFinishScreen) {
    return (
      <div className="finish-wrap">
        <div className="finish-card">
          <div className="finish-icon">✅</div>
          <h1 className="finish-title">¡Prueba terminada!</h1>
          <p className="finish-sub">Se registró la conformidad del paciente.</p>
          <div className="finish-actions">
            <button className="btn-back" onClick={backFromFinish}>
              ← Volver a Evaluaciones
            </button>
          </div>
        </div>

        {/* Modal contraseña operador */}
        {askPassOpen && (
          <div className="exit-modal">
            <div className="modal-content" style={{ maxWidth: 420 }}>
              <h3>Confirmación del operador</h3>
              <p>Ingresa la contraseña del operador para continuar.</p>
              <form
                onSubmit={handleOperatorPassSubmit}
                autoComplete="off"
                style={{ marginTop: 10 }}
              >
                <input
                  ref={operatorPassInputRef}
                  type="password"
                  name={operatorPassName}
                  autoComplete="new-password"
                  inputMode="numeric"
                  pattern="\d*"
                  placeholder="Contraseña de operador"
                  onPaste={(e) => e.preventDefault()}
                  onDrop={(e) => e.preventDefault()}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  style={{ width: "100%", padding: 10, marginBottom: 12 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn-cancel-exit" onClick={closeAskPassModal}>Cancelar</button>
                  <button type="submit" className="btn-confirm-exit">Confirmar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Modal de firma (antes de finalizar)
  const pregunta = items[currentIndex];
  const opciones = pregunta?.opciones?.length ? pregunta.opciones : ["Nada", "Poco", "Algo", "Mucho"];
  const botonesDeshabilitados = savingRef.current || !attemptId;

  return (
    <div className="test-topbar-container">
      <div className="test-topbar">
        <img src="static/images/logo.png" alt="Logo" height={40} />
        {/* sin timer ni porcentaje visibles */}
        <button className="btn-exit" onClick={requestExitToEvaluaciones} title="Salir">✖</button>
      </div>

      <div className="test-container">
        <div className="test-header">
          <h3 className="test-title">{code} · Pregunta {currentIndex + 1}</h3>
          <div className="test-paciente">{pacienteNombre ? <>Paciente: <strong>{pacienteNombre}</strong></> : " "}</div>
        </div>

        <div className="test-question">
          <p className="test-question-text">{pregunta?.texto}</p>
        </div>

        <div className="test-options">
          {opciones.map((op, idx) => (
            <button
              key={idx}
              className="btn-opcion"
              onClick={() => handleAnswer(op)}
              disabled={botonesDeshabilitados}
              title={!attemptId ? "Preparando..." : "Seleccionar"}
            >
              {op}
            </button>
          ))}
        </div>
      </div>

      {/* Botón fijo para leer (sanitiza y usa voz natural si hay) */}
      <button
        className="fab-read"
        onClick={() => speakPregunta(pregunta?.texto || "")}
        aria-label="Escuchar pregunta"
        title="Escuchar pregunta"
      >
        🔊
      </button>

      {/* Modal de firma del paciente */}
      {showSignModal && (
        <div className="exit-modal">
          <div className="modal-content" style={{ maxWidth: 720 }}>
            <h3 style={{ marginTop: 0 }}>Confirmación del paciente</h3>
            <p style={{ margin: "8px 0 14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <span>Declaro que estoy conforme con las respuestas dadas.</span>
              </label>
            </p>

            <div style={{ margin: "8px 0 10px" }}>
              <small style={{ color: "#555" }}>Firma del paciente (use el dedo o el mouse):</small>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fafafa" }}>
              <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "180px", background: "#fff", borderRadius: 6 }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
                <button className="btn-cancel-exit" onClick={clearSignature}>Limpiar</button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-cancel-exit" onClick={() => { /* no cerramos sin firmar */ }}>
                Cancelar
              </button>
              <button
                className="btn-confirm-exit"
                onClick={() => {
                  if (!consentChecked) { alert("Debes aceptar la conformidad."); return; }
                  if (!hasDrawn) { alert("Por favor, agrega la firma del paciente."); return; }
                  finalizeAttemptAfterSignature();
                }}
              >
                Firmar y finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal contraseña operador (para salir durante la prueba) */}
      {askPassOpen && (
        <div className="exit-modal">
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <h3>Confirmación del operador</h3>
            <p>Ingresa la contraseña del operador para continuar.</p>
            <form onSubmit={handleOperatorPassSubmit} autoComplete="off" style={{ marginTop: 10 }}>
              <input
                ref={operatorPassInputRef}
                type="password"
                name={operatorPassName}
                autoComplete="new-password"
                inputMode="numeric"
                pattern="\d*"
                placeholder="Contraseña de operador"
                onPaste={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                style={{ width: "100%", padding: 10, marginBottom: 12 }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn-cancel-exit" onClick={closeAskPassModal}>Cancelar</button>
                <button type="submit" className="btn-confirm-exit">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
