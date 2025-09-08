// src/lib/imageThumbs.js
// Genera 2 blobs JPEG: thumbnail (≈400px) y medium (≈1200px) a partir de un File de imagen.
export async function makeThumbs(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) return null;

  // lee el File a dataURL
  const readAsDataURL = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  // crea un objeto Image y espera a que cargue
  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  // redimensiona a maxWidth manteniendo proporción, devuelve Blob JPEG
  const resize = async (img, maxWidth) => {
    let w = img.width;
    let h = img.height;
    if (w > maxWidth) {
      const scale = maxWidth / w;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    return blob;
  };

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const thumb = await resize(img, 400);
  const medium = await resize(img, 1200);

  return { thumb, medium };
}
