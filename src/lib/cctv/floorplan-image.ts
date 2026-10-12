export const MAX_FLOORPLAN_BYTES = 15 * 1024 * 1024;
export type PixelCrop = { x: number; y: number; width: number; height: number };

export function validateFloorplanFile(file: Pick<File, "name" | "size">) {
  if (file.size > MAX_FLOORPLAN_BYTES) throw new Error("الحد الأقصى لحجم المخطط 15 MB");
  if (!/\.(png|jpe?g|webp|bmp|pdf)$/i.test(file.name)) {
    throw new Error("اختر JPG أو PNG أو WEBP أو BMP أو PDF؛ ملفات CAD تحتاج تصديراً إلى PDF أو صورة");
  }
}

export function rotatedBounds(width: number, height: number, rotation: number) {
  const angle = rotation * Math.PI / 180;
  return {
    width: Math.round(Math.abs(Math.cos(angle) * width) + Math.abs(Math.sin(angle) * height)),
    height: Math.round(Math.abs(Math.sin(angle) * width) + Math.abs(Math.cos(angle) * height)),
  };
}

export async function cropFloorplan(source: string, rotation: number, crop: PixelCrop | null) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const bounds = rotatedBounds(image.naturalWidth, image.naturalHeight, rotation);
  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذّر تجهيز الصورة");
  context.translate(bounds.width / 2, bounds.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(crop?.width ?? bounds.width));
  output.height = Math.max(1, Math.round(crop?.height ?? bounds.height));
  const out = output.getContext("2d");
  if (!out) throw new Error("تعذّر قص الصورة");
  out.drawImage(canvas, crop?.x ?? 0, crop?.y ?? 0, output.width, output.height, 0, 0, output.width, output.height);
  const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(
    (result) => result ? resolve(result) : reject(new Error("تعذّر تجهيز الصورة")), "image/png",
  ));
  if (blob.size > MAX_FLOORPLAN_BYTES) throw new Error("الصورة الناتجة تتجاوز 15 MB؛ قلّل مساحة القص");
  return new File([blob], "floorplan.png", { type: "image/png" });
}

export async function renderPdfPage(file: File, pageNumber: number) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const documentTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await documentTask.promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 4096 / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return { url: canvas.toDataURL("image/png"), pageCount: pdf.numPages };
  } finally {
    await documentTask.destroy();
  }
}