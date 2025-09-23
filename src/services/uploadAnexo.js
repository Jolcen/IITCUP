// src/services/uploadAnexo.js
import { supabase } from "../lib/supabaseClient";
import { buildAnexoPaths } from "../lib/storagePaths";
import { makeThumbs } from "../lib/imageThumbs";

// Conjunto de tipos permitidos en este flujo (sin "carnet")
export const TIPOS_PERMITIDOS = new Set([
  "cert_medico",
  "cert_psicologico",
  "antecedentes_policiales",
  "antecedentes_penales",
  "otros",
]);

// Si algún otro flujo (p. ej. creación de paciente) requiere subir carnet,
// ahí podrás llamar con allowCarnet: true
export async function uploadAnexo({
  pacienteId,
  file,
  tipo,                // uno de TIPOS_PERMITIDOS; "carnet" solo si allowCarnet=true
  titulo,
  descripcion,
  bucket = "anexos",
  allowCarnet = false, // <- por defecto NO se permite carnet aquí
}) {
  // ─────────────────────────────────────────────
  // Validaciones
  // ─────────────────────────────────────────────
  if (!pacienteId) throw new Error("pacienteId requerido");
  if (!file)       throw new Error("file requerido");

  const mime = file.type || "";
  const isPdf   = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  if (!isPdf && !isImage) {
    throw new Error(`Formato no permitido: ${mime}. Solo PDF o imágenes.`);
  }

  // Tipo permitido (bloquea 'carnet' en este flujo)
  if (tipo === "carnet" && !allowCarnet) {
    throw new Error("El tipo 'carnet' solo puede subirse en la creación del paciente.");
  }
  if (tipo !== "carnet" && !TIPOS_PERMITIDOS.has(tipo)) {
    throw new Error(`Tipo de documento no permitido en este flujo: ${tipo}`);
  }

  // Usuario (para uploaded_by)
  const userResp = await supabase.auth.getUser();
  const uploadedBy = userResp?.data?.user?.id ?? null;

  // ─────────────────────────────────────────────
  // Rutas y subida del original
  // ─────────────────────────────────────────────
  // buildAnexoPaths(pacienteId, tipo, fileName) debería devolver:
  // { originalPath, thumbPath, mediumPath }
  // Si tu implementación no garantiza unicidad, considera agregar sufijo con fecha/uuid.
  const paths = buildAnexoPaths(pacienteId, tipo, file.name);

  // Subir el archivo original (no sobrescribir)
  const up1 = await supabase
    .storage
    .from(bucket)
    .upload(paths.originalPath, file, { contentType: mime, upsert: false });

  if (up1.error) {
    // Si es conflicto por nombre (409), puedes reintentar con otro nombre aquí si quieres.
    throw up1.error;
  }

  // ─────────────────────────────────────────────
  // Thumbnails (solo imágenes)
  // ─────────────────────────────────────────────
  if (isImage) {
    try {
      const thumbs = await makeThumbs(file); // { thumb, medium } (Blob JPEG)
      if (thumbs?.thumb) {
        const t1 = await supabase.storage.from(bucket)
          .upload(paths.thumbPath, thumbs.thumb, { contentType: "image/jpeg", upsert: true });
        if (t1.error) console.warn("Warn: no se pudo subir thumbnail:", t1.error.message);
      }
      if (thumbs?.medium) {
        const t2 = await supabase.storage.from(bucket)
          .upload(paths.mediumPath, thumbs.medium, { contentType: "image/jpeg", upsert: true });
        if (t2.error) console.warn("Warn: no se pudo subir preview medium:", t2.error.message);
      }
    } catch (e) {
      // No detengas el flujo solo por thumbs
      console.warn("Warn: generación/subida de thumbs falló:", e?.message || e);
    }
  }

  // ─────────────────────────────────────────────
  // Registro en BD (sin caso_id)
  // ─────────────────────────────────────────────
  // Asegúrate que en tu tabla public.anexos la columna caso_id sea NULLABLE o inexistente.
  const { data, error } = await supabase
    .from("anexos")
    .insert({
      paciente_id: pacienteId,
      // caso_id: null,              // <- NO grabamos caso_id en este flujo
      titulo: titulo ?? tipo,        // usa el título lógico que mandas desde UI
      descripcion: descripcion ?? null,
      tipo,
      mime_type: mime,
      size_bytes: file.size,
      bucket,
      path: paths.originalPath,
      uploaded_by: uploadedBy,
    })
    .select("id, paciente_id, tipo, titulo, bucket, path, created_at")
    .single(); // aquí sí queremos que falle si no inserta

  if (error) throw error;

  // Retorno estandarizado
  return {
    anexo: data,         // fila insertada
    paths,               // rutas usadas para original/preview/thumb
    bucket,
  };
}
