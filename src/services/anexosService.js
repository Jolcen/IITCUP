import { supabase } from "../lib/supabaseClient";

// Derivar rutas de preview a partir del original
export function previewPathsFromOriginal(originalPath) {
  // pacientes/{paciente}/{anexo}/original/archivo.ext
  const parts = (originalPath || "").split("/");
  if (parts.length < 5) return { medium: null, thumb: null };
  const base = parts.slice(0, 3).join("/"); // pacientes/{paciente}/{anexo}
  return {
    medium: `${base}/preview/medium.jpg`,
    thumb:  `${base}/preview/thumbnail.jpg`,
  };
}

export async function deleteAnexo(anexo) {
  const bucket = anexo.bucket || "anexos";
  const previews = previewPathsFromOriginal(anexo.path);

  // 1) eliminar objetos en Storage (si existen)
  await supabase.storage.from(bucket).remove(
    [anexo.path, previews.medium, previews.thumb].filter(Boolean)
  );

  // 2) eliminar fila en BD (si configuraste la política de DELETE)
  await supabase.from("anexos").delete().eq("id", anexo.id);
}

export async function replaceAnexoFile(anexo, newFile) {
  // Reemplazar el original (upsert)
  const bucket = anexo.bucket || "anexos";
  const { error } = await supabase.storage
    .from(bucket)
    .upload(anexo.path, newFile, { contentType: newFile.type, upsert: true });
  if (error) throw error;
  // Si es imagen, vuelve a generar previews en tu flujo (o hazlo server-side)
}
