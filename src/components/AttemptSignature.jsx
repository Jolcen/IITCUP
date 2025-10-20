// AttemptSignature.jsx
import { useEffect, useRef, useState } from "react";
import "../styles/AttemptSignature.css";

export default function AttemptSignature({
  supabase,
  attemptId,
  signer = "paciente",        // 'paciente' | 'operador'
  onDone,
  uploadToStorage = false,
  storageBucket = "firmas",
  disabled = false,
  minStrokePx = 40,           // longitud mínima de trazo para aceptar firma
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const [hasStroke, setHasStroke] = useState(false);
  const [strokeLen, setStrokeLen] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // ---------- Canvas & DPR ----------
  const paintGuides = (ctx, cssW, cssH) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, cssW - 20, cssH - 20);
  };

  const resizeCanvas = () => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = wrap.getBoundingClientRect();

    const cssW = Math.max(360, rect.width);
    const cssH = Math.max(200, Math.min(260, rect.height - 40) || 220);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    paintGuides(ctx, cssW, cssH);
    setHasStroke(false);
    setStrokeLen(0);
  };

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("orientationchange", resizeCanvas);
    };
  }, []);

  // ---------- Dibujo ----------
  const getXY = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0];
    const clientX = t ? t.clientX : e.clientX;
    const clientY = t ? t.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const begin = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.75;
    ctx.beginPath();
    ctx.moveTo(x, y);
    lastPointRef.current = { x, y };
  };

  const drawTo = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    const dx = x - lastPointRef.current.x;
    const dy = y - lastPointRef.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) setStrokeLen((s) => s + dist);
    lastPointRef.current = { x, y };
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    setErr("");
    drawingRef.current = true;
    const { x, y } = getXY(e);
    begin(x, y);
  };
  const onPointerMove = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const { x, y } = getXY(e);
    drawTo(x, y);
    if (!hasStroke) setHasStroke(true);
  };
  const stopDrawing = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = parseFloat(canvas.style.width);
    const cssH = parseFloat(canvas.style.height);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);
    paintGuides(ctx, cssW, cssH);

    setHasStroke(false);
    setStrokeLen(0);
    setErr("");
  };

  const canvasToBlob = () =>
    new Promise((resolve) => {
      canvasRef.current.toBlob((b) => resolve(b), "image/png", 0.92);
    });

  // ---------- Guardado / firma ----------
  const registrarFirma = async () => {
    if (saving || disabled) return;
    setErr("");

    if (!attemptId) {
      setErr("Intento no válido.");
      return;
    }
    if (!hasStroke || strokeLen < minStrokePx) {
      setErr("Dibuja tu firma en el lienzo antes de continuar.");
      return;
    }

    setSaving(true);
    try {
      // 0) Idempotencia: si ya hay firma del mismo signer para este intento, salir OK (evita 409)
      const { data: ya, error: eYa } = await supabase
        .from("firmas_intento")
        .select("id")
        .eq("intento_id", attemptId)
        .eq("firmado_por", signer)
        .limit(1);
      if (eYa) throw eYa;
      if (ya && ya.length) {
        onDone?.();
        return;
      }

      // 1) obtener paciente_id a partir del intento
      const { data: ip, error: e1 } = await supabase
        .from("intentos_prueba")
        .select("caso_id")
        .eq("id", attemptId)
        .single();
      if (e1) throw e1;

      const { data: caso, error: e2 } = await supabase
        .from("casos")
        .select("paciente_id")
        .eq("id", ip.caso_id)
        .single();
      if (e2) throw e2;

      // 2) subir evidencia (opcional) — nombre único + upsert:true
      let firmaPath = null;
      let mime = "image/png";
      if (uploadToStorage) {
        const blob = await canvasToBlob();
        mime = blob?.type || "image/png";
        const uid = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
        const filePath = `attempts/${attemptId}/firma-${signer}-${uid}.png`;

        const { error: upErr } = await supabase.storage
          .from(storageBucket)
          .upload(filePath, blob, { contentType: mime, upsert: true });
        if (upErr) throw upErr;

        firmaPath = filePath;
      }

      // 3) insertar en firmas_intento (ya prevenimos duplicados con el paso 0)
      const payload = {
        intento_id: attemptId,
        paciente_id: caso.paciente_id,
        firmado_por: signer,
        firma_mime: mime,
        ...(firmaPath ? { firma_path: firmaPath, firma_bucket: storageBucket } : {}),
      };

      const { error: insErr } = await supabase.from("firmas_intento").insert(payload);
      if (insErr) throw insErr;

      onDone?.();
    } catch (e) {
      console.error(e);
      const hint = (e?.hint || e?.message || "").toLowerCase();
      if (hint.includes("bucket") || hint.includes("storage")) {
        setErr("No se pudo guardar la imagen en Storage. Revisa el bucket y permisos.");
      } else if (e?.code === "23505" || e?.status === 409) {
        // por si existe un índice único y alguien hizo doble click entre el paso 0 y el insert
        onDone?.();
        return;
      } else {
        setErr(e?.message || "No se pudo registrar la firma.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sig__wrap">
      <div className="sig__header">
        <h3 className="sig__title">Firmar</h3>
        <div className="sig__hint">Traza tu firma dentro del recuadro</div>
      </div>

      <div
        ref={wrapRef}
        className="sig__canvasWrap"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={stopDrawing}
        aria-label="Área para firmar"
        role="img"
      >
        <canvas ref={canvasRef} className="sig__canvas" />
      </div>

      <div className="sig__buttons">
        <button type="button" className="sig__btn" onClick={clearCanvas} disabled={saving}>
          Limpiar
        </button>
        <button
          type="button"
          className="sig__btn sig__btn--primary"
          onClick={registrarFirma}
          disabled={saving || disabled || !hasStroke || strokeLen < minStrokePx}
          title={!hasStroke ? "Dibuja tu firma" : undefined}
        >
          {saving ? "Guardando..." : "Finalizar y firmar"}
        </button>
      </div>

      {err && <div className="sig__error">{err}</div>}

      <p className="sig__note">
        Al firmar, se validará que el intento esté completo y se cerrará la prueba.
      </p>
    </div>
  );
}
