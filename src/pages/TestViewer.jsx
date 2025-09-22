// src/pages/TestViewer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import AttemptSignature from "../components/AttemptSignature"; // ⬅️ NUEVO
import "../styles/TestViewer.css";

const SLUG2CODE = { pai: "PAI", "mcmi-iv": "MCMI-IV", "mmpi-2": "MMPI-2", custom: "CUSTOM" };

export default function TestViewer() {
  const { testId } = useParams();
  const [sp] = useSearchParams();
  const caseId = sp.get("case") || null;
  const pacienteNombre = sp.get("nombre") || "";
  const navigate = useNavigate();

  // ============ Estado principal ============
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  // Intento actual / prueba
  const [attemptId, setAttemptId] = useState(null);
  const [pruebaId, setPruebaId] = useState(null);
  const [attemptState, setAttemptState] = useState(null); // pendiente | en_evaluacion | interrumpido | evaluado
  const [attemptEnded, setAttemptEnded] = useState(false); // terminado_en != null

  // Fases
  const [preStart, setPreStart] = useState(true);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showFinishScreen, setShowFinishScreen] = useState(false);

  // Tiempo
  const [time, setTime] = useState(0);
  const tickingRef = useRef(null);
  const startedAtRef = useRef(null);

  // Locks
  const savingRef = useRef(false);
  const finishedRef = useRef(false);

  // Modal contraseña operador (re-autenticación real)
  const [askPassOpen, setAskPassOpen] = useState(false);
  const operatorPassInputRef = useRef(null);
  const operatorPassName = useMemo(() => "op_" + Math.random().toString(36).slice(2), []);
  const deferredActionRef = useRef(null);

  // Firma (solo consentimiento aquí; la firma real está en AttemptSignature)
  const [consentChecked, setConsentChecked] = useState(false);

  // clave para limpiar cache local del intento
  const storageKey = useMemo(
    () => (attemptId ? `attempt:${attemptId}:answers` : null),
    [attemptId]
  );

  const code = useMemo(
    () => SLUG2CODE[testId] ?? (testId || "").toUpperCase(),
    [testId]
  );

  // ====== TTS (opcional) ======
  const [ttsVoice, setTtsVoice] = useState(null);
  function pickBestSpanishVoice(voices) {
    const byName = (rex) => voices.find((v) => (v.lang || "").toLowerCase().startsWith("es") && rex.test(v.name || ""));
    return byName(/piper/i) || byName(/neural|natural|online/i) || voices.find(v => (v.lang || "").toLowerCase().startsWith("es")) || voices[0] || null;
  }
  useEffect(() => {
    function loadVoices() {
      const vs = (window.speechSynthesis.getVoices && window.speechSynthesis.getVoices()) || [];
      if (vs.length) setTtsVoice(pickBestSpanishVoice(vs));
    }
    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
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
      const clean = sanitizeForSpeech(texto || "");
      if (!clean) return;
      window.speechSynthesis.cancel?.();
      const chunks = chunkText(clean);
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = (ttsVoice && ttsVoice.lang) || "es-ES";
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
    return () => {
      document.body.classList.remove("focus-test");
      try { window.speechSynthesis.cancel?.(); } catch {}
    };
  }, []);

  // -------- Helpers --------
  function normalizeOptions(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch {}
      try { return JSON.parse(v.replace(/'/g, '"')); } catch {}
      return v.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (v && typeof v === "object") return v;
    return [];
  }

  function getRawFromOption(q, opcionElegida) {
    const opcion_txt =
      typeof opcionElegida === "string"
        ? opcionElegida
        : opcionElegida?.label ?? String(opcionElegida);

    if (!q?.opciones || q?.tipo !== "likert") return null;

    if (Array.isArray(q.opciones)) {
      const idx = q.opciones.findIndex(
        (o) => (typeof o === "string" ? o : o?.label ?? o?.txt ?? "") === opcion_txt
      );
      if (idx >= 0) {
        const o = q.opciones[idx];
        const cand = typeof o === "object" ? o.raw ?? o.value ?? o.score ?? o.puntaje : undefined;
        if (cand !== undefined && Number.isFinite(Number(cand))) return Number(cand);
        return idx;
      }
      return null;
    }

    if (q.opciones && typeof q.opciones === "object") {
      const entries = Object.entries(q.opciones);
      const found = entries.find(([key, val]) => {
        const lbl = val?.label ?? val?.txt ?? val?.text ?? key;
        return lbl === opcion_txt;
      });
      if (found) {
        const val = found[1];
        const cand = val?.raw ?? val?.value ?? val?.score ?? val?.puntaje;
        if (cand !== undefined && Number.isFinite(Number(cand))) return Number(cand);
      }
    }
    return null;
  }

  // === Buscar o crear intento abierto (terminado_en IS NULL) ===
  async function ensureAttempt(pid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión.");
    if (!caseId) throw new Error("Falta caseId.");

    // Uno abierto
    const { data: abiertos, error: e1 } = await supabase
      .from("intentos_prueba")
      .select("id, estado, terminado_en")
      .eq("caso_id", caseId)
      .eq("prueba_id", pid)
      .is("terminado_en", null)
      .limit(1);
    if (e1) throw e1;

    if (abiertos && abiertos.length) {
      const it = abiertos[0];
      setAttemptState(it.estado || null);
      setAttemptEnded(!!it.terminado_en);
      return it.id;
    }

    // crear
    const { data: creado, error: e2 } = await supabase
      .from("intentos_prueba")
      .insert({ caso_id: caseId, prueba_id: pid }) // default estado = 'pendiente'
      .select("id, estado, terminado_en")
      .single();
    if (e2) throw e2;

    setAttemptState(creado.estado || "pendiente");
    setAttemptEnded(!!creado.terminado_en);
    return creado.id;
  }

  // ------ Cargar prueba + items + progreso desde BD ------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        // 1) id prueba
        const { data: pruebas, error: eP } = await supabase
          .from("pruebas")
          .select("id, codigo")
          .ilike("codigo", SLUG2CODE[testId] ?? (testId || "").toUpperCase())
          .limit(1);
        if (eP) throw eP;
        if (!pruebas?.length) throw new Error("No se encontró la prueba en la base de datos.");
        const pid = pruebas[0].id;
        if (!alive) return;
        setPruebaId(pid);

        // 2) Bloquear si ya evaluada/terminada
        if (caseId) {
          const { data: comp, error: eComp } = await supabase
            .from("intentos_prueba")
            .select("id, estado, terminado_en")
            .eq("caso_id", caseId)
            .eq("prueba_id", pid)
            .or("terminado_en.not.is.null,estado.eq.evaluado")
            .limit(1);
          if (eComp) throw eComp;
          if (comp && comp.length) {
            if (alive) setErr("Esta prueba ya fue evaluada para este caso.");
            return;
          }
        }

        // 3) Cargar items de la prueba
        const { data, error } = await supabase
          .from("items_prueba")
          .select("id, enunciado, opciones, inverso, orden, activo, tipo")
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
          tipo: r.tipo || "opcion",
        }));
        if (!alive) return;
        setItems(mapped);

        // 4) Asegurar (o crear) intento abierto
        const atid = await ensureAttempt(pid);
        if (!alive) return;
        setAttemptId(atid);

        // 5) Reconstruir progreso sin localStorage
        const { data: resp } = await supabase
          .from("respuestas")
          .select("item_id")
          .eq("intento_id", atid);
        const answered = new Set((resp || []).map(r => r.item_id));
        const firstIdx = mapped.findIndex(q => !answered.has(q.id));
        setCurrentIndex(firstIdx === -1 ? mapped.length : firstIdx);
      } catch (e) {
        console.error(e);
        if (alive) setErr(e.message || "Error cargando la prueba.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, caseId]);

  // ------ Iniciar prueba -> estado en_evaluacion (RPC) ------
  async function startTest() {
    if (!attemptId) return;

    const { error: rpcErr } = await supabase.rpc("start_intento", { p_id: attemptId });
    if (rpcErr) {
      console.warn("[startTest] RPC falló, intento fallback .update()", rpcErr);
      const { error: updErr } = await supabase
        .from("intentos_prueba")
        .update({ estado: "en_evaluacion" })
        .eq("id", attemptId);
      if (updErr) {
        alert(updErr.message || "No se pudo iniciar la prueba.");
        return;
      }
    }

    const nowIso = new Date().toISOString();
    startedAtRef.current = Date.now();
    if (tickingRef.current) clearInterval(tickingRef.current);
    setTime(0);
    tickingRef.current = setInterval(() => setTime((t) => t + 1), 1000);

    setAttemptState("en_evaluacion");
    setPreStart(false);
  }

  // ------ Guardar respuesta ------
  async function handleAnswer(opcionElegida) {
    if (savingRef.current || !attemptId) return;

    if (attemptEnded || attemptState === "evaluado") {
      alert("Este intento ya no es editable.");
      return;
    }

    // Snapshot por seguridad de UI
    const idxSnapshot = currentIndex;
    const q = items[idxSnapshot];
    if (!q) return;

    savingRef.current = true;
    try {
      const opcion_txt =
        typeof opcionElegida === "string"
          ? opcionElegida
          : opcionElegida?.label ?? String(opcionElegida);

      const raw = q?.tipo === "likert" ? getRawFromOption(q, opcionElegida) : null;

      const payload = {
        caso_id: caseId,
        prueba_id: pruebaId,
        item_id: q.id,
        intento_id: attemptId,
        invertido: q.inverso ?? false,
        valor: { opcion_txt, raw },
      };

      const { error } = await supabase
        .from("respuestas")
        .upsert(payload, { onConflict: "intento_id,item_id", ignoreDuplicates: false });

      if (error) console.error("Error guardando respuesta:", error);
    } catch (e) {
      console.error("Excepción guardando respuesta:", e);
    } finally {
      // Avanza al siguiente ítem
      setCurrentIndex((i) => {
        const next = i + 1;
        return next >= items.length ? next : next;
      });
      savingRef.current = false;
    }
  }

  // ------ Firma ------
  function requestSignature() {
    setConsentChecked(false);
    setShowSignModal(true);
  }

  // Lo que pasa cuando AttemptSignature termina bien
  const handleSignatureDone = () => {
    // triggers en DB hacen: validar completo, calcular puntajes, poner 'evaluado', etc.
    try {
      if (storageKey) localStorage.removeItem(storageKey);
    } catch {}
    if (tickingRef.current) clearInterval(tickingRef.current);
    setShowSignModal(false);
    setShowFinishScreen(true);
  };

  // ====== Modal contraseña operador (re-autenticación real) ======
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
    if (operatorPassInputRef.current) operatorPassInputRef.current.value = "";
  }
  // estado nuevo arriba del componente:
  const [passSubmitting, setPassSubmitting] = useState(false);

  // reemplaza tu handleOperatorPassSubmit por este:
  function handleOperatorPassSubmit(e) {
    e.preventDefault();
    (async () => {
      if (passSubmitting) return;
      setPassSubmitting(true);
      try {
        const pass = operatorPassInputRef.current?.value || "";
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          alert("Sesión no válida.");
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: pass,
        });

        if (error) {
          // 400 = credenciales inválidas
          if (error.status === 400) {
            // feedback sutil sin alert
            operatorPassInputRef.current?.setCustomValidity("Contraseña incorrecta");
            operatorPassInputRef.current?.reportValidity();
            operatorPassInputRef.current?.setCustomValidity("");
            operatorPassInputRef.current?.focus?.();
            return;
          }
          alert(error.message || "No se pudo verificar. Revisa tu conexión e intenta de nuevo.");
          return;
        }

        // OK → ejecuta la acción diferida y cierra
        const cb = deferredActionRef.current;
        closeAskPassModal();
        deferredActionRef.current = null;
        cb && cb();
      } finally {
        setPassSubmitting(false);
      }
    })();
  }

  function requestExitToEvaluaciones() {
    openAskPassModal(() => {
      try { window.speechSynthesis.cancel?.(); } catch {}
      if (tickingRef.current) clearInterval(tickingRef.current);
      navigate("/evaluaciones");
    });
  }
  function backFromFinish() { openAskPassModal(() => navigate("/evaluaciones")); }

  // ===== Render =====
  if (loading) return <div className="loader">Cargando prueba...</div>;
  if (err) return <div className="loader" style={{ color: "crimson" }}>{err}</div>;

  const total = items.length;

  // Si ya respondió todo y aún no firmó → pedir firma
  if (!preStart && !showFinishScreen && !showSignModal && currentIndex >= total && !finishedRef.current) {
    requestSignature();
    return null;
  }

  if (preStart) {
    return (
      <div className="focus-wrap">
        <div className="focus-card">
          <h1 className="focus-title">Iniciar {code}</h1>
          {pacienteNombre && (
            <p className="focus-sub">Paciente: <strong>{pacienteNombre}</strong></p>
          )}
          <ul className="focus-bullets">
            <li>Se mostrará una pregunta a la vez.</li>
            <li>Al finalizar, firmarás tu conformidad.</li>
          </ul>
          <div className="focus-actions">
            <button className="btn-start" onClick={startTest} disabled={!attemptId}>
              Iniciar prueba
            </button>
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
          <p className="finish-sub">Se registró la firma. El operador revisará y finalizará.</p>
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
                  <button type="submit" className="btn-confirm-exit" disabled={passSubmitting}>
                    {passSubmitting ? "Verificando…" : "Confirmar"}
                  </button>
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
  const editable = !attemptEnded && attemptState !== "evaluado";
  const botonesDeshabilitados = savingRef.current || !attemptId || !editable;

  return (
    <div className="test-topbar-container">
      <div className="test-topbar">
        <div className="test-topbar-spacer" />
        <div className="test-topbar-title">{code}</div>
        <button className="btn-exit" onClick={requestExitToEvaluaciones} title="Salir">
          ✖
        </button>
      </div>

      <div className="test-container">
        <div className="test-header">
          <h3 className="test-title">
            {currentIndex < total ? `Pregunta ${currentIndex + 1}` : "Firmar"}
          </h3>
        </div>

        {currentIndex < total ? (
          <>
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
                  title={!attemptId ? "Preparando..." : (!editable ? "Intento no editable" : "Seleccionar")}
                >
                  {typeof op === "string" ? op : op?.label ?? "Opción"}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="muted">Preparando firma…</div>
        )}
      </div>

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
          <div className="modal-content" style={{ maxWidth: 820 }}>
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

            {/* AttemptSignature bloqueado hasta que marque conformidad */}
            <div style={{ opacity: consentChecked ? 1 : 0.5, pointerEvents: consentChecked ? "auto" : "none" }}>
              <AttemptSignature
                supabase={supabase}
                attemptId={attemptId}
                signer="paciente"
                onDone={handleSignatureDone}
                uploadToStorage={true}
                storageBucket="evidencias" // igual que usabas antes
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal contraseña operador */}
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
                <button type="button" className="btn-cancel-exit" onClick={closeAskPassModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm-exit">
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
