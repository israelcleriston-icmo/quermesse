/** Reduz a imagem (foto do celular tem 3–5 MB) antes de enviar: JPEG, lado maior limitado. */
export function dimensoes(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export async function comprimirImagem(arquivo: File, max = 1024, qualidade = 0.7): Promise<Blob> {
  const bmp = await createImageBitmap(arquivo);
  const { w, h } = dimensoes(bmp.width, bmp.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Falha ao comprimir a imagem."))), "image/jpeg", qualidade));
}
