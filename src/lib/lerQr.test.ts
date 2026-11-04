import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { gerarPayloadPix } from "../pix/brcode";
import { lerBrCode } from "../pix/brcode";
import { decodificarPixels } from "./lerQr";

// Desenha o QR em pixels (sem navegador) para provar que a leitura funciona com os nossos códigos Pix.
function pixels(texto: string, escala = 6, margem = 4) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const lado = (n + margem * 2) * escala;
  const data = new Uint8ClampedArray(lado * lado * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!qr.modules.get(x, y)) continue;
    for (let dy = 0; dy < escala; dy++) for (let dx = 0; dx < escala; dx++) {
      const i = (((y + margem) * escala + dy) * lado + (x + margem) * escala + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, lado };
}

describe("ler QR Pix a partir de imagem", () => {
  it("decodifica o QR do banco e extrai chave, nome e cidade", () => {
    const banco = "00020126580014br.gov.bcb.pix013629ac127f-8327-4a45-8879-2fedc34adb0c5204000053039865802BR5925MITRA_ARQUIDIOCESANA_DE_F6009Fortaleza610960743-21862290525EXYD1190752017791410198306304471D";
    const { data, lado } = pixels(banco);
    const lido = decodificarPixels(data, lado, lado);
    expect(lido).toBe(banco);
    expect(lerBrCode(lido!)).toMatchObject({ ok: true, dados: { cidade: "Fortaleza" } });
  });
  it("decodifica o QR gerado pelo próprio sistema", () => {
    const p = gerarPayloadPix({ chave: "29ac127f-8327-4a45-8879-2fedc34adb0c", valor: 15, txid: "FMS26V000002A", mensagem: "FMS26V000002A Festa" });
    const { data, lado } = pixels(p, 4, 2);
    expect(decodificarPixels(data, lado, lado)).toBe(p);
  });
  it("imagem sem QR devolve null", () => {
    expect(decodificarPixels(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100)).toBeNull();
  });
});
