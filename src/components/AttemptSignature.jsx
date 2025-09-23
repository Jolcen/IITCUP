// AttemptSignature.jsx
// Componente de firma: dibuja en canvas y guarda en `firmas_intento`.
// Props:
//   supabase: cliente de supabase
//   attemptId: uuid del intento
//   signer: "paciente" | "operador" (default "paciente")
//   onDone: callback tras guardar OK (o duplicado)
//   uploadToStorage: bool (default false) — si true, sube PNG a Storage
//   storageBucket: string (default "firmas")
//   disabled: bool — para bloquear el botón externamente (opcional)

import { useEffect, useRef, useState } from "react";

export default function AttemptSignature({
  supabase,
  attemptId,
  signer = "paciente",
  onDone,
  uploadToStorage = false,
  storageBucket = "firmas",
  disabled = false,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // clave para limpiar cache local si usas localStorage
  const storageKey = `attempt:${attemptId}:answers`;

  // ----- Canvas sizing (DPR) -----
  const paintGuides = (ctx, cssW, cssH) => {
    // fondo blanco
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cssW, cssH);
    // borde guía
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, cssW - 20, cssH - 20);
  };

  const resizeCanvas = () => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();

    // tamaño CSS fijo (para no “encoger” visualmente)
    const cssW = Math.max(320, rect.width);
    const cssH = 220;

    // aplicamos tamaño lógico con DPR
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    // reset total y luego escalar una sola vez
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    paintGuides(ctx, cssW, cssH);
    setHasStroke(false);
  };

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (wrapRef.current) ro.observe(wrapRef.current);
    const onWin = () => resizeCanvas();
    window.addEventListener("orientationchange", onWin);
    window.addEventListener("resize", onWin);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", onWin);
      window.removeEventListener("resize", onWin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Dibujo -----
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
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const drawTo = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    setErr("");
    drawing.current = true;
    const { x, y } = getXY(e);
    begin(x, y);
  };
  const onPointerMove = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = getXY(e);
    drawTo(x, y);
    if (!hasStroke) setHasStroke(true);
  };
  const stopDrawing = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // restaurar estado y repintar (sin re-apilar scale)
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // respetar el DPR y el tamaño CSS actual
    const cssW = parseFloat(canvas.style.width);
    const cssH = parseFloat(canvas.style.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);

    paintGuides(ctx, cssW, cssH);
    setHasStroke(false);
  };

  const canvasToBlob = () =>
    new Promise((resolve) => {
      canvasRef.current.toBlob((b) => resolve(b), "image/png", 0.92);
    });

  // ----- Guardado -----
  const registrarFirma = async () => {
    if (saving || disabled) return;
    setErr("");
    setSaving(true);

    try {
      // 1) caso -> paciente
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

      // 2) (opcional) subir firma al Storage
      let firmaPath = null;
      let mime = "image/png";
      if (uploadToStorage) {
        if (!hasStroke) {
          throw new Error("Dibuja tu firma en el lienzo antes de continuar.");
        }
        const blob = await canvasToBlob();
        mime = blob?.type || "image/png";
        const fileName = `${attemptId}-${Date.now()}.png`;
        const filePath = `attempts/${attemptId}/${fileName}`;
        const { error: upErr } = await supabase.storage
          .from(storageBucket)
          .upload(filePath, blob, { contentType: mime, upsert: false });
        if (upErr) throw upErr;
        firmaPath = filePath;
      }

      // 3) insertar en firmas_intento
      const payload = {
        intento_id: attemptId,
        paciente_id: caso.paciente_id,
        firmado_por: signer, // 'paciente' o 'operador'
        firma_mime: mime,
        ...(firmaPath ? { firma_path: firmaPath } : {}),
      };

      // Insert "normal": si hay duplicado (23505) lo tratamos como OK
      const { error: insErr } = await supabase
        .from("firmas_intento")
        .insert(payload);

      if (insErr) {
        // 23505 => conflicto único (ya está firmado)
        if (insErr.code === "23505") {
          // lo consideramos éxito idempotente
          onDone?.();
          return;
        }
        // 42501 => RLS/permiso
        if (insErr.code === "42501") {
          throw new Error(
            "No tienes permiso para firmar este intento (política RLS)."
          );
        }
        // 42P01 u otros => mensaje original
        throw insErr;
      }

      // 4) limpiar cache local de respuestas (si la usas)
      try {
        localStorage.removeItem(storageKey);
      } catch {}

      // 5) listo
      onDone?.();
    } catch (e) {
      console.error(e);
      const msg =
        e?.message ||
        e?.hint ||
        "No se pudo registrar la firma. Revisa tu conexión o permisos.";
      setErr(msg);
      // opcional: alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sig__wrap">
      <h3 className="sig__title">Firmar</h3>

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
      >
        <canvas ref={canvasRef} className="sig__canvas" />
      </div>

      <div className="sig__buttons" style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={clearCanvas} disabled={saving}>
          Limpiar
        </button>
        <button
          type="button"
          onClick={registrarFirma}
          disabled={saving || disabled}
          style={{ background: "#16a34a", color: "white", padding: "6px 12px" }}
        >
          {saving ? "Guardando..." : "Finalizar y firmar"}
        </button>
      </div>

      {err && (
        <div
          style={{
            color: "#b91c1c",
            marginTop: 8,
            fontSize: 14,
            lineHeight: 1.3,
          }}
        >
          {err}
        </div>
      )}

      <p style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
        Al firmar, se validará que el intento esté completo, se calcularán los
        puntajes y se cerrará la prueba. Si falta algo, verás un mensaje.
      </p>

    </div>
  );
}
