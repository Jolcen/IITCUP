// TestViewer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import AttemptSignature from "../components/AttemptSignature";
import "../styles/TestViewer.css";

const SLUG2CODE = { pai: "PAI", "mcmi-iv": "MCMI-IV", "mmpi-2": "MMPI-2", custom: "CUSTOM" };

export default function TestViewer() {
  const { testId } = useParams();
  const [sp] = useSearchParams();
  const caseId = sp.get("case") || null;
  const pacienteNombre = sp.get("nombre") || "";
  const debugAudit = sp.get("debug") === "1"; // compat
  const navigate = useNavigate();

  // Auditoría por localStorage: activar con localStorage.setItem('auditCalc','1')
  const auditFlag = (typeof localStorage !== "undefined" && localStorage.getItem("auditCalc") === "1");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  const [attemptId, setAttemptId] = useState(null);
  const [pruebaId, setPruebaId] = useState(null);
  const [attemptState, setAttemptState] = useState(null);
  const [attemptEnded, setAttemptEnded] = useState(false);

  const [preStart, setPreStart] = useState(true);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showFinishScreen, setShowFinishScreen] = useState(false);

  const [time, setTime] = useState(0);
  const tickingRef = useRef(null);
  const startedAtRef = useRef(null);

  const savingRef = useRef(false);
  const finishedRef = useRef(false);

  const [askPassOpen, setAskPassOpen] = useState(false);
  const operatorPassInputRef = useRef(null);
  const operatorPassName = useMemo(() => "op_" + Math.random().toString(36).slice(2), []);
  const deferredActionRef = useRef(null);
  const [passSubmitting, setPassSubmitting] = useState(false);

  const [consentChecked, setConsentChecked] = useState(false);

  const storageKey = useMemo(() => (attemptId ? `attempt:${attemptId}:answers` : null), [attemptId]);
  const code = useMemo(() => SLUG2CODE[testId] ?? (testId || "").toUpperCase(), [testId]);

  // ====== TTS opcional ======
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
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
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
    const words = t.split(/\s+/), chunks = [];
    let buf = [], len = 0;
    for (const w of words) {
      if (len + w.length + 1 > maxLen) { if (buf.length) chunks.push(buf.join(" ")); buf = [w]; len = w.length; }
      else { buf.push(w); len += w.length + 1; }
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

  useEffect(() => {
    document.body.classList.add("focus-test");
    return () => {
      document.body.classList.remove("focus-test");
      try { window.speechSynthesis.cancel?.(); } catch {}
    };
  }, []);

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

  function optionsForQuestion(q) {
    const hasCustom = Array.isArray(q?.opciones) && q.opciones.length > 0;
    if (hasCustom) return q.opciones;
    const t = (q?.tipo || "").toLowerCase();
    if (["boolean","vf","tf","mmpi","mcmi"].some(s => t.includes(s))) {
      return ["Verdadero", "Falso"];
    }
    return ["Nada", "Poco", "Algo", "Mucho"];
  }

  function getRawFromOption(q, opcionElegida) {
    const label = typeof opcionElegida === "string"
      ? opcionElegida
      : (opcionElegida?.label ?? String(opcionElegida));
    const norm = (s) =>
      String(s ?? "")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .trim().toLowerCase();
    const t = norm(label);

    if (t === "verdadero" || t === "true" || t === "si" || t === "sí") return 1;
    if (t === "falso" || t === "false" || t === "no") return 0;

    if (t === "nada")  return 0;
    if (t === "poco")  return 1;
    if (t === "algo")  return 2;
    if (t === "mucho") return 3;

    if (Array.isArray(q?.opciones)) {
      const idx = q.opciones.findIndex((o) => {
        const lbl = typeof o === "string" ? o : (o?.label ?? o?.txt ?? o?.text ?? "");
        return norm(lbl) === t;
      });
      if (idx >= 0) {
        const o = q.opciones[idx];
        if (o && typeof o === "object") {
          const cand = o.raw ?? o.value ?? o.score ?? o.puntaje;
          if (cand !== undefined && Number.isFinite(Number(cand))) return Number(cand);
        }
        return idx;
      }
    } else if (q?.opciones && typeof q.opciones === "object") {
      for (const [key, val] of Object.entries(q.opciones)) {
        const lbl = norm(val?.label ?? val?.txt ?? val?.text ?? key);
        if (lbl === t) {
          const cand = val?.raw ?? val?.value ?? val?.score ?? val?.puntaje;
          if (cand !== undefined && Number.isFinite(Number(cand))) return Number(cand);
          return null;
        }
      }
    }

    return null;
  }

  // ===== ensureAttempt
  async function ensureAttempt(pid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sin sesión.");
    if (!caseId) throw new Error("Falta caseId.");

    const { data: anyTry, error: e0 } = await supabase
      .from("intentos_prueba")
      .select("id, estado, terminado_en")
      .eq("caso_id", caseId)
      .eq("prueba_id", pid)
      .order("iniciado_en", { ascending: false })
      .limit(1);
    if (e0) throw e0;

    if (anyTry && anyTry.length) {
      const it = anyTry[0];
      setAttemptState(it.estado || null);
      setAttemptEnded(!!it.terminado_en);
      return it.id;
    }

    const { data: creado, error: e2 } = await supabase
      .from("intentos_prueba")
      .insert({ caso_id: caseId, prueba_id: pid })
      .select("id, estado, terminado_en")
      .single();
    if (e2) throw e2;

    setAttemptState(creado.estado || "pendiente");
    setAttemptEnded(!!creado.terminado_en);
    return creado.id;
  }

  // ---------- Cargar prueba e intento ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        // 1) Resolver prueba
        let pid = null;
        {
          const bySlug = await supabase
            .from("pruebas")
            .select("id, slug, codigo")
            .eq("slug", testId)
            .limit(1)
            .maybeSingle();

          if (bySlug.error) throw bySlug.error;
          if (bySlug.data) {
            pid = bySlug.data.id;
          } else {
            const code = SLUG2CODE[testId] ?? (testId || "").toUpperCase();
            const byCode = await supabase
              .from("pruebas")
              .select("id, codigo")
              .ilike("codigo", code)
              .limit(1);
            if (byCode.error) throw byCode.error;
            if (!byCode.data?.length) throw new Error("No se encontró la prueba en la base de datos.");
            pid = byCode.data[0].id;
          }
        }
        if (!alive) return;
        setPruebaId(pid);

        // 2) Verificar asignación
        if (caseId) {
          const { data: asignada, error: eAsign } = await supabase
            .from("casos_pruebas")
            .select("prueba_id")
            .eq("caso_id", caseId)
            .eq("prueba_id", pid)
            .limit(1);
          if (eAsign) throw eAsign;
          if (!asignada || !asignada.length) {
            if (alive) setErr("Esta prueba no está asignada a este caso.");
            return;
          }

          // 3) Bloquear si ya está evaluada/terminada
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

        // 4) Cargar ítems
        const { data, error } = await supabase
          .from("items_prueba")
          .select("id, enunciado, opciones, inverso, orden, tipo")
          .eq("prueba_id", pid)
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
        setItems(mapped);

        // 5) Crear / reutilizar intento
        const atid = await ensureAttempt(pid);
        if (!alive) return;
        setAttemptId(atid);

        // 6) Continuar donde se dejó
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

  // ---------- Iniciar prueba ----------
  async function startTest() {
    if (!attemptId || !pruebaId || !caseId) {
      alert("Preparando la prueba…");
      return;
    }

    const { error: rpcErr } = await supabase.rpc("start_intento", { p_id: attemptId });
    if (rpcErr) {
      const { error: updErr } = await supabase
        .from("intentos_prueba")
        .update({ estado: "en_evaluacion" })
        .eq("id", attemptId);
      if (updErr) {
        alert(updErr.message || "No se pudo iniciar la prueba.");
        return;
      }
    }

    const { error: eCase } = await supabase.rpc("marcar_prueba_en_progreso", {
      p_caso_id: caseId,
      p_prueba_id: pruebaId,
    });
    if (eCase) console.warn("No se pudo marcar en_evaluacion:", eCase);

    startedAtRef.current = Date.now();
    if (tickingRef.current) clearInterval(tickingRef.current);
    setTime(0);
    tickingRef.current = setInterval(() => setTime((t) => t + 1), 1000);

    setAttemptState("en_evaluacion");
    setPreStart(false);
  }

  // ---------- Guardar respuesta ----------
  async function handleAnswer(opcionElegida) {
    if (savingRef.current || !attemptId) return;
    if (attemptEnded || attemptState === "evaluado") {
      alert("Este intento ya no es editable.");
      return;
    }
    const idxSnapshot = currentIndex;
    const q = items[idxSnapshot];
    if (!q) return;

    savingRef.current = true;
    try {
      const opcion_txt = typeof opcionElegida === "string" ? opcionElegida : (opcionElegida?.label ?? String(opcionElegida));
      const raw = getRawFromOption(q, opcionElegida);

      const payload = {
        caso_id: caseId,
        prueba_id: pruebaId,
        item_id: q.id,
        intento_id: attemptId,
        invertido: q.inverso ?? false,
        valor: { opcion_txt, raw },
      };

      await supabase
        .from("respuestas")
        .delete()
        .match({ intento_id: attemptId, item_id: q.id });

      const { error: insErr } = await supabase.from("respuestas").insert(payload);
      if (insErr) console.error("Error guardando respuesta:", insErr);
    } catch (e) {
      console.error("Excepción guardando respuesta:", e);
    } finally {
      setCurrentIndex((i) => (i + 1));
      savingRef.current = false;
    }
  }

  // ---------- Auditoría (solo lectura, consola) ----------
  async function auditAttempt(atid) {
    if (!atid) return;

    try {
      // 1) Llama al resumen crudo (ya existente)
      const { data: audit, error } = await supabase.rpc(
        "calc_puntajes_por_intento_resumen",
        { p_intento: atid }
      );
      if (error) { console.error("[AUDIT] error:", error); return; }
      const rows = audit || [];
      if (!rows.length) { console.warn("[AUDIT] vacío"); return; }

      // 2) Enriquecer con metadatos: escalas (codigo, prueba_id)
      const escalaIds = [...new Set(rows.map(r => r.escala_id))];
      const { data: escs, error: eEsc } = await supabase
        .from("escalas")
        .select("id,codigo,prueba_id")
        .in("id", escalaIds);
      if (eEsc) { console.warn("[AUDIT] escalas error:", eEsc); }

      const escalaMap = Object.fromEntries((escs || []).map(e => [e.id, e]));

      // 3) Códigos de prueba
      const pruebaIds = [...new Set((escs || []).map(e => e.prueba_id).filter(Boolean))];
      const { data: prbs, error: ePrb } = await supabase
        .from("pruebas")
        .select("id,codigo")
        .in("id", pruebaIds);
      if (ePrb) { console.warn("[AUDIT] pruebas error:", ePrb); }
      const pruebaMap = Object.fromEntries((prbs || []).map(p => [p.id, p]));

      // 4) Orden de ítems
      const itemIds = [
        ...new Set(rows.flatMap(r => (Array.isArray(r.detalle) ? r.detalle : []).map(d => d.item_id)).filter(Boolean))
      ];
      const { data: its, error: eItems } = await supabase
        .from("items_prueba")
        .select("id,orden")
        .in("id", itemIds);
      if (eItems) { console.warn("[AUDIT] items error:", eItems); }
      const itemOrder = Object.fromEntries((its || []).map(i => [i.id, i.orden]));

      // 5) Log bonito
      console.groupCollapsed("[AUDIT] calc_puntajes_por_intento_resumen", atid);

      rows.forEach((row, i) => {
        const e = escalaMap[row.escala_id];
        const escalaCodigo  = e?.codigo || row.escala_id;
        const pruebaCodigo  = (e?.prueba_id && pruebaMap[e.prueba_id]?.codigo) || "(?)";

        console.groupCollapsed(`Escala ${i + 1}: ${escalaCodigo}  —  Prueba: ${pruebaCodigo}`);
        console.table([{
          escala_id: row.escala_id,
          escala_codigo: escalaCodigo,
          prueba_codigo: pruebaCodigo,
          total_items: row.total_items,
          items_respondidos: row.items_respondidos,
          suma_raw: row.suma_raw,
          suma_ponderada: row.suma_ponderada,
        }]);

        // detalle con 'orden' del ítem
        const detalle = (Array.isArray(row.detalle) ? row.detalle : []).map(d => ({
          orden: itemOrder[d.item_id] ?? null,
          item_id: d.item_id,
          regla: d.regla,
          peso: d.peso,
          v_normalizado: d.v_normalizado ?? d.v, // por compat
          v_final: d.v_final,
          aporte: d.aporte,
          respondido: d.respondido,
        })).sort((a,b) => (a.orden ?? 1e9) - (b.orden ?? 1e9));

        console.log("Detalle por ítem →");
        console.table(detalle);
        console.groupEnd();
      });

      console.groupEnd();
    } catch (e) {
      console.error("[AUDIT] exception:", e);
    }
  }
  // helper global opcional para disparar desde consola
  try { window.auditCalc = () => auditAttempt(attemptId); } catch {}


  // ---------- Firma ----------
  function requestSignature() {
    setConsentChecked(false);
    setShowSignModal(true);
  }

  const handleSignatureDone = async () => {
    try {
      // Ya NO llamamos a finalizar_intento ni a actualizar_estado_*:
      // el trigger AFTER INSERT en firmas_intento se encarga de calcular puntajes,
      // cerrar el intento, marcar casos_pruebas y actualizar casos.

      // Auditoría opcional (solo lectura)
      if (attemptId && (auditFlag || debugAudit)) {
        await auditAttempt(attemptId);
      }
    } catch (e) {
      console.warn("Post-firma falló:", e);
    }

    try { if (storageKey) localStorage.removeItem(storageKey); } catch {}
    if (tickingRef.current) clearInterval(tickingRef.current);
    setShowSignModal(false);
    setShowFinishScreen(true);
  };

  // ----- contraseña operador / salida protegida -----
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
  function handleOperatorPassSubmit(e) {
    e.preventDefault();
    (async () => {
      if (passSubmitting) return;
      setPassSubmitting(true);
      try {
        const pass = operatorPassInputRef.current?.value || "";
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) { alert("Sesión no válida."); return; }

        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: pass,
        });

        if (error) {
          if (error.status === 400) {
            operatorPassInputRef.current?.setCustomValidity("Contraseña incorrecta");
            operatorPassInputRef.current?.reportValidity();
            operatorPassInputRef.current?.setCustomValidity("");
            operatorPassInputRef.current?.focus?.();
            return;
          }
          alert(error.message || "No se pudo verificar. Revisa tu conexión e intenta de nuevo.");
          return;
        }

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
    openAskPassModal(async () => {
      try {
        if (attemptId) {
          await supabase.from("intentos_prueba").update({ estado: "interrumpido" }).eq("id", attemptId);
        }
        if (caseId && pruebaId) {
          await supabase.rpc("actualizar_estado_prueba_y_caso", {
            p_caso_id: caseId,
            p_prueba_id: pruebaId,
            p_estado: "interrumpido",
          });
        }
      } catch (e) {
        console.warn("No se pudo marcar interrumpido:", e);
      } finally {
        try { window.speechSynthesis.cancel?.(); } catch {}
        if (tickingRef.current) clearInterval(tickingRef.current);
        navigate("/evaluaciones");
      }
    });
  }
  function backFromFinish() { openAskPassModal(() => navigate("/evaluaciones")); }

  // ---------- Render ----------
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
            <li><strong>No podrás salir hasta finalizar.</strong></li>
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
            <button className="btn-back" onClick={backFromFinish}>← Volver a Evaluaciones</button>
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
  const opciones = optionsForQuestion(pregunta);
  const editable = !attemptEnded && attemptState !== "evaluado";
  const botonesDeshabilitados = savingRef.current || !attemptId || !editable;

  return (
    <div className="test-topbar-container">
      <div className="test-topbar">
        <div className="test-topbar-spacer" />
        <div className="test-topbar-title">{code}</div>
        <button className="btn-exit" onClick={requestExitToEvaluaciones} title="Salir">✖</button>
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

      <button className="fab-read" onClick={() => speakPregunta(pregunta?.texto || "")} aria-label="Escuchar pregunta" title="Escuchar pregunta">
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

            <div style={{ opacity: consentChecked ? 1 : 0.5, pointerEvents: consentChecked ? "auto" : "none" }}>
              <AttemptSignature
                supabase={supabase}
                attemptId={attemptId}
                signer="paciente"
                onDone={handleSignatureDone}
                uploadToStorage={true}
                storageBucket="evidencias"
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
