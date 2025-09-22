// AttemptSignature.jsx
// Componente de firma autocontenido: dibuja en un canvas y guarda en `firmas_intento`.
// Requiere props: supabase (cliente), attemptId (uuid), signer ("paciente"|"operador"), onDone()

import { useEffect, useRef, useState } from "react";
import "../styles/AttemptSignature.css";

export default function AttemptSignature({
  supabase,
  attemptId,
  signer = "paciente",
  onDone,
  // Si quieres subir la imagen a Storage, pon esto en true y configura el bucket:
  uploadToStorage = false,
  storageBucket = "firmas",
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Para evitar el ReferenceError que tenías:
  const storageKey = `attempt:${attemptId}:answers`;

  // Ajusta el tamaño del canvas al contenedor con DPR para nitidez
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(300, rect.width) * dpr;
      canvas.height = 220 * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      // Fondo blanco para que el PNG no quede transparente (opcional)
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // guía
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, Math.max(280, rect.width - 20), 200);
      setHasStroke(false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const begin = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };

  // Helpers puntero->coords
  const getXY = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const isTouch = e.touches && e.touches.length;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    const { x, y } = getXY(e);
    setIsDrawing(true);
    begin(x, y);
  };

  const onPointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getXY(e);
    draw(x, y);
  };

  const onPointerUp = (e) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    // Limpia y repinta fondo + guía
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    const rect = wrapRef.current.getBoundingClientRect();
    ctx.strokeRect(10, 10, Math.max(280, rect.width - 20), 200);

    setHasStroke(false);
  };

  const canvasToBlob = () =>
    new Promise((resolve) => {
      canvasRef.current.toBlob((b) => resolve(b), "image/png", 0.9);
    });

  const registrarFirma = async () => {
    setErrorMsg("");
    setSaving(true);
    try {
      // 1) Obtener paciente_id a partir del intento
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

      let firmaPath = null;
      let mime = "image/png";

      // 2) (Opcional) subir la imagen a Storage
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
          .upload(filePath, blob, { contentType: mime });
        if (upErr) throw upErr;
        firmaPath = filePath;
      }

      // 3) Insertar fila mínima en firmas_intento (triggers harán el resto)
      const payload = {
        intento_id: attemptId,
        paciente_id: caso.paciente_id,
        firmado_por: signer,
        firma_mime: mime,
      };
      if (firmaPath) payload.firma_path = firmaPath;

      const { error: insErr } = await supabase
        .from("firmas_intento")
        .insert(payload);
      if (insErr) throw insErr;

      // 4) Limpiar caché local del intento
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* no-op */
      }

      // 5) listo
      onDone?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err?.message ||
          "No se pudo registrar la firma. Revisa tu conexión o permisos."
      );
      alert("No se pudo registrar la firma. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sig__wrap">
      <h2 className="sig__title">Firmar</h2>

      <div
        ref={wrapRef}
        className="sig__canvasWrap"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        <canvas ref={canvasRef} className="sig__canvas" />
      </div>

      <div className="sig__buttons">
        <button className="sig__btn sig__btnSecondary" onClick={clearCanvas}>
          Limpiar
        </button>
        <button
          className="sig__btn sig__btnPrimary"
          onClick={registrarFirma}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Finalizar y firmar"}
        </button>
      </div>

      {errorMsg && <div className="sig__error">{errorMsg}</div>}
      <p className="sig__hint">
        Al firmar, se validará que el intento esté completo y se calcularán los
        puntajes. Si falta algo, verás un mensaje.
      </p>
    </div>
  );
}
