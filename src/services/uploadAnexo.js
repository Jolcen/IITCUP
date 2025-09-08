// src/services/uploadAnexo.js
import { supabase } from "../lib/supabaseClient";
import { buildAnexoPaths } from "../lib/storagePaths";
import { makeThumbs } from "../lib/imageThumbs";

export async function uploadAnexo({
  pacienteId,
  file,
  tipo,                // "carnet" | "cert_medico" | "cert_psicologico" | "antecedentes_policiales" | "antecedentes_penales" | "otros"
  titulo,
  descripcion,
  casoId = null,
  bucket = "anexos",
}) {
  if (!pacienteId) throw new Error("pacienteId requerido");
  if (!file)       throw new Error("file requerido");
  const paths = buildAnexoPaths(pacienteId, tipo, file.name);

  // 1) subir original
  const up1 = await supabase.storage.from(bucket)
    .upload(paths.originalPath, file, { contentType: file.type, upsert: false });
  if (up1.error) throw up1.error;

  // 2) thumbnails (solo imágenes)
  if (file.type.startsWith("image/")) {
    const thumbs = await makeThumbs(file);           // <- ya lo tienes en src/lib/imageThumbs.js
    if (thumbs?.thumb) {
      const t1 = await supabase.storage.from(bucket)
        .upload(paths.thumbPath, thumbs.thumb, { contentType: "image/jpeg", upsert: true });
      if (t1.error) throw t1.error;
    }
    if (thumbs?.medium) {
      const t2 = await supabase.storage.from(bucket)
        .upload(paths.mediumPath, thumbs.medium, { contentType: "image/jpeg", upsert: true });
      if (t2.error) throw t2.error;
    }
  }

  // 3) registro en BD (el trigger crea el log)
  const { data, error } = await supabase
    .from("anexos")
    .insert({
      paciente_id: pacienteId,
      caso_id: casoId,
      titulo: titulo ?? tipo,
      descripcion: descripcion ?? null,
      tipo,
      mime_type: file.type,
      size_bytes: file.size,
      bucket,
      path: paths.originalPath,
      // uploaded_by lo completa RLS si no lo pones, pero es útil guardarlo explícito:
      uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return { anexo: data, paths };
}
