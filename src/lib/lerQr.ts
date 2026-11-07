import jsQR from "jsqr";

/** Decodifica um QR a partir de pixels RGBA. Devolve o texto, ou null se não achou. */
export function decodificarPixels(data: Uint8ClampedArray, largura: number, altura: number): string | null {
  return jsQR(data, largura, altura, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

/** Lê o QR de uma foto/imagem (celular ou arquivo). Reduz fotos grandes antes de procurar. */
export async function lerQrDeArquivo(arquivo: File, ladoMax = 1600): Promise<string | null> {
  const bmp = await createImageBitmap(arquivo);
  try {
    const f = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
    const l = Math.max(1, Math.round(bmp.width * f));
    const a = Math.max(1, Math.round(bmp.height * f));
    const tela = document.createElement("canvas");
    tela.width = l;
    tela.height = a;
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, l, a);
    const img = ctx.getImageData(0, 0, l, a);
    return decodificarPixels(img.data, l, a);
  } finally {
    bmp.close?.();
  }
}
