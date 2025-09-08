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

  // Tiempo / intento
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

  // ====== TTS: prioriza Piper / neural ======
  const [ttsVoice, setTtsVoice] = useState(null);
  function pickBestSpanishVoice(voices) {
    const piper = voices.find(v =>
      (v.lang || "").toLowerCase().startsWith("es") && /piper/i.test(v.name || "")
    );
    if (piper) return piper;
    const natural = voices.find(v =>
      (v.lang || "").toLowerCase().startsWith("es") &&
      /neural|natural|online/i.test(v.name || "")
    );
    if (natural) return natural;
    const es = voices.find(v => (v.lang || "").toLowerCase().startsWith("es"));
    return es || voices[0] || null;
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
    t = t.replace(/[^\p{L}\s]+/gu, " ");
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
        u.rate = 0.95; u.pitch = 1.0; u.volume = 1.0;
        if (i > 0) u.text = " " + u.text;
        window.speechSynthesis.speak(u);
      });
    } catch {}
  }
  // ====== fin TTS ======

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
          .select("id, enunciado, opciones, inverso, orden, activo")
          .eq("prueba_id", pid)
          .eq("activo", true)
          .order("orden", { ascending: true })
          .limit(2000);
        if (error) throw error;
        if (!data?.length) throw new Error("No hay ítems para esta prueba.");
        const mapped = data.map((r, i) => ({
          id: r.id,
          texto: r.enunciado,
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

  // Iniciar prueba → cronómetro e iniciado_en
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

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ testId, caseId, currentIndex })
    );
  }, [currentIndex, testId, caseId, storageKey]);

  // --- helper: puntaje por opción ---
  function scoreFromOption(op, idxEnLista) {
    if (op && typeof op === "object") {
      if (Number.isFinite(op.score)) return op.score;
      if (typeof op.value === "number") return op.value;
    }
    // fallback Nada/Poco/Algo/Mucho → 0..3
    return idxEnLista ?? 0;
  }

  // Guardar respuesta (JSONB requerido por el backend)
  async function handleAnswer(opcionElegida) {
    if (savingRef.current || !attemptId) return;
    const idxSnapshot = currentIndex;
    const q = items[idxSnapshot];
    if (!q) return;

    savingRef.current = true;
    try {
      const idxEnLista = Array.isArray(q.opciones)
        ? q.opciones.findIndex(o => o === opcionElegida || o?.label === opcionElegida)
        : 0;

      const code_txt =
        typeof opcionElegida === "string"
          ? opcionElegida
          : (opcionElegida?.label ?? String(opcionElegida));

      const score_num = scoreFromOption(opcionElegida, Math.max(0, idxEnLista));

      const payload = {
        caso_id: caseId,
        prueba_id: pruebaId,
        item_id: q.id,
        intento_id: attemptId,
        invertido: q.inverso ?? false,
        valor: { code_txt, score_num }, // ← JSONB
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

  // === Fin de prueba: firma → finalizar intento → pantalla final ===
  function requestSignature() {
    setConsentChecked(false);
    setHasDrawn(false);
    setShowSignModal(true);
    setTimeout(setupCanvas, 0);
  }

  async function finalizeAttemptAfterSignature() {
    setShowSignModal(false);
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      // --- subir firma al bucket ---
      let firmaPath = null;
      if (canvasRef.current) {
        const dataUrl = canvasRef.current.toDataURL("image/png");
        const blob = await (await fetch(dataUrl)).blob();
        const filePath = `${caseId || "sin-caso"}/${code}/${attemptId}/${Date.now()}.png`;

        const { error: upErr } = await supabase
          .storage.from("evidencias")
          .upload(filePath, blob, { contentType: "image/png", upsert: false });

        if (upErr) {
          console.error("Error subiendo firma:", upErr);
          alert("No se pudo guardar la firma, intenta de nuevo.");
          finishedRef.current = false;
          setShowSignModal(true);
          return;
        }
        firmaPath = filePath;
      }

      // --- cerrar intento vía RPC (la función ya marca terminado/duración) ---
      const { error: rpcErr } = await supabase.rpc("finalizar_intento", {
        p_intento_id: attemptId,
        p_firma_bucket: "evidencias",
        p_firma_path: firmaPath,
        p_firma_mime: "image/png",
        p_user_agent: navigator.userAgent,
        p_comentario: null,
      });

      if (rpcErr) {
        console.error("finalizar_intento RPC error:", rpcErr);
        alert("No se pudo cerrar la prueba. Revisa tu conexión e inténtalo otra vez.");
        finishedRef.current = false;
        setShowSignModal(true);
        return;
      }

    } catch (e) {
      console.error("Error finalizando:", e);
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
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(700, window.innerWidth - 48);
    const h = 200;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
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
    function end() { drawing = false; last = null; }

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

  // ====== Modal contraseña operador ======
  function openAskPassModal(onSuccess) {
    deferredActionRef.current = onSuccess;
    setAskPassOpen(true);
    setTimeout(() => {
      operatorPassInputRef.current?.setAttribute("value", "");
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

  function requestExitToEvaluaciones() {
    openAskPassModal(() => {
      try { window.speechSynthesis?.cancel?.(); } catch {}
      localStorage.removeItem(storageKey);
      if (tickingRef.current) clearInterval(tickingRef.current);
      navigate("/evaluaciones");
    });
  }

  function backFromFinish() {
    openAskPassModal(() => {
      navigate("/evaluaciones");
    });
  }

  // ===== render =====
  if (loading) return <div className="loader">Cargando prueba...</div>;
  if (err) return <div className="loader" style={{ color: "crimson" }}>{err}</div>;

  const total = items.length;

  if (!preStart && !showFinishScreen && !showSignModal && currentIndex >= total && !finishedRef.current) {
    requestSignature();
    return null;
  }

  if (preStart) {
    return (
      <div className="focus-wrap">
        <div className="focus-card">
          <h1 className="focus-title">Iniciar {code}</h1>
          {pacienteNombre && <p className="focus-sub">Paciente: <strong>{pacienteNombre}</strong></p>}
          <ul className="focus-bullets">
            <li>Se mostrará una pregunta a la vez.</li>
            <li>Al finalizar, firmarás tu conformidad.</li>
          </ul>
          <div className="focus-actions">
            <button className="btn-start" onClick={startTest} disabled={!attemptId}>Iniciar prueba</button>
            {/*
            <button className="btn-cancel" onClick={() => requestExitToEvaluaciones()}>Cancelar</button>
            */}
          </div>
        </div>
      </div>
    );
  }

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

  const pregunta = items[currentIndex];
  const opciones = pregunta?.opciones?.length ? pregunta.opciones : ["Nada", "Poco", "Algo", "Mucho"];
  const botonesDeshabilitados = savingRef.current || !attemptId;

  return (
    <div className="test-topbar-container">
      <div className="test-topbar">
        <div className="test-topbar-spacer" />
        <div className="test-topbar-title">{code}</div>
        <button className="btn-exit" onClick={requestExitToEvaluaciones} title="Salir">✖</button>
      </div>

      <div className="test-container">
        <div className="test-header">
          <h3 className="test-title">Pregunta {currentIndex + 1}</h3>
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
              {typeof op === "string" ? op : (op?.label ?? "Opción")}
            </button>
          ))}
        </div>
      </div>

      {/* Botón fijo para leer */}
      <button
        className="fab-read"
        onClick={() => speakPregunta(pregunta?.texto || "")}
        aria-label="Escuchar pregunta"
        title="Escuchar pregunta"
      >
        🔊
      </button>

      {/* Modal de firma */}
      {showSignModal && (
        <div className="exit-modal">
          <div className="modal-content" style={{ maxWidth: 760 }}>
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
              <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "200px", background: "#fff", borderRadius: 6 }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
                <button className="btn-cancel-exit" onClick={clearSignature}>Limpiar</button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-cancel-exit" onClick={() => { /* modal no se cierra sin firmar */ }}>
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
