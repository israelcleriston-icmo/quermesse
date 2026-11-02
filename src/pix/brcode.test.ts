import { describe, expect, it } from "vitest";
import {
  CIDADE_FIXA, NOME_FIXO, crc16, decodificar, formatarValor, gerarPayloadPix,
  limiteMensagem, montarMensagem, montarPayload, montarTxid, normalizarTexto,
} from "./brcode";

const CHAVE = "123e4567-e12b-12d1-a456-426655440000"; // chave aleatória do manual
// Payload de exemplo do próprio manual do Pix (seção 2.6.3), CRC 1D3D
const EXEMPLO_MANUAL =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

describe("exemplo oficial do manual", () => {
  it("CRC16 do exemplo é 1D3D", () => {
    expect(crc16(EXEMPLO_MANUAL.slice(0, -4))).toBe("1D3D");
  });
  it("montarPayload reproduz o exemplo do manual byte a byte", () => {
    expect(
      montarPayload({ chave: CHAVE, nomeRecebedor: "Fulano de Tal", cidade: "BRASILIA" }),
    ).toBe(EXEMPLO_MANUAL);
  });
});

describe("limite da mensagem (infoAdicional)", () => {
  it("chave aleatória (36): 37 caracteres", () => {
    expect(limiteMensagem(CHAVE)).toBe(37);
  });
  it("chave de 9 caracteres: 64 (exemplo do manual)", () => {
    expect(limiteMensagem("123456789")).toBe(64);
  });
});

describe("mensagem com TXID", () => {
  const txid = "EVT1ABCDEFGHJKMNPQRSTUVWX";
  it("TXID sozinho quando não há complemento", () => {
    expect(montarMensagem(txid, CHAVE)).toBe(txid);
  });
  it("complemento é cortado, TXID nunca", () => {
    const m = montarMensagem(txid, CHAVE, "Festa do Padroeiro Sao Jose");
    expect(m.startsWith(txid)).toBe(true);
    expect(m.length).toBeLessThanOrEqual(37);
    expect(m).toBe(`${txid} Festa do Pa`);
  });
  it("com o TXID legível sobra espaço para o nome do evento", () => {
    const t = montarTxid("EVT1", 123);
    expect(montarMensagem(t, CHAVE, "Festa do Padroeiro")).toBe("EVT1V000123 Festa do Padroeiro");
  });
  it("recusa TXID inválido", () => {
    expect(() => montarMensagem("TX-1", CHAVE)).toThrow();
    expect(() => montarMensagem("A".repeat(26), CHAVE)).toThrow();
  });
});

describe("gerarPayloadPix", () => {
  const txid = "EVT1K7M2P9Q4R6S8T3V5W2X4Y";
  const base = {
    chave: CHAVE, nomeRecebedor: "Paróquia São José", cidade: "Fortaleza",
    valor: 12.5, txid, mensagem: montarMensagem(txid, CHAVE, "Festa"),
  };
  it("gera payload decodificável com CRC válido e campos certos", () => {
    const p = gerarPayloadPix(base);
    const l = decodificar(p);
    expect(l.crcOk).toBe(true);
    expect(l.campos["54"]).toBe("12.50");
    expect(l.campos["59"]).toBe("Paroquia Sao Jose");
    expect(l.campos["60"]).toBe("Fortaleza");
    expect(l.campos["58"]).toBe("BR");
    expect(l.campos["53"]).toBe("986");
    expect(l.conta["00"]).toBe("br.gov.bcb.pix");
    expect(l.conta["01"]).toBe(CHAVE);
    expect(l.conta["02"]).toContain(txid);
    expect(l.adicionais["05"]).toBe(txid);
  });
  it("tag 26 nunca passa de 99 caracteres", () => {
    const l = decodificar(gerarPayloadPix(base));
    expect(l.campos["26"].length).toBeLessThanOrEqual(99);
  });
  it("só valor, txid e mensagem mudam entre vendas (resto idêntico)", () => {
    const a = decodificar(gerarPayloadPix(base));
    const t2 = "EVT1ZZZZZZZZZZZZZZZZZZZZZ";
    const b = decodificar(gerarPayloadPix({ ...base, valor: 3, txid: t2, mensagem: montarMensagem(t2, CHAVE) }));
    for (const id of ["00", "52", "53", "58", "59", "60"]) expect(a.campos[id]).toBe(b.campos[id]);
    expect(a.conta["01"]).toBe(b.conta["01"]);
    expect(a.campos["54"]).not.toBe(b.campos["54"]);
  });
  it("recusa mensagem sem o TXID", () => {
    expect(() => gerarPayloadPix({ ...base, mensagem: "so uma frase" })).toThrow(/TXID/);
  });
  it("recusa mensagem acima do limite", () => {
    expect(() => gerarPayloadPix({ ...base, mensagem: txid + " " + "x".repeat(30) })).toThrow(/excede/);
  });
  it("recusa mensagem com acento", () => {
    expect(() => gerarPayloadPix({ ...base, mensagem: txid + " Sao Jose é" })).toThrow();
  });
  it("recusa TXID inválido", () => {
    expect(() => gerarPayloadPix({ ...base, txid: "abc-1", mensagem: "abc-1" })).toThrow();
  });
  it("CRC sempre válido (200 combinações aleatórias)", () => {
    const alfa = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 200; i++) {
      let t = "EVT1";
      while (t.length < 25) t += alfa[Math.floor(Math.random() * alfa.length)];
      const centavos = 1 + Math.floor(Math.random() * 500000);
      const p = gerarPayloadPix({ ...base, valor: centavos / 100, txid: t, mensagem: montarMensagem(t, CHAVE, "Festa") });
      expect(decodificar(p).crcOk).toBe(true);
    }
  });
});

describe("TXID legível (evento + venda)", () => {
  it("monta código + V + 6 dígitos", () => {
    expect(montarTxid("EVT1", 123)).toBe("EVT1V000123");
    expect(montarTxid("FESTA2026", 1)).toBe("FESTA2026V000001");
    expect(montarTxid("EVT1", 999999)).toBe("EVT1V999999");
  });
  it("sempre cabe em 25 caracteres e é aceito pelo gerador", () => {
    const txid = montarTxid("ABCDEFGHIJ", 999999); // código com 10 caracteres
    expect(txid.length).toBe(17);
    const p = gerarPayloadPix({ chave: CHAVE, valor: 1, txid, mensagem: montarMensagem(txid, CHAVE, "Evento") });
    expect(decodificar(p).adicionais["05"]).toBe(txid);
  });
  it("recusa código ou número inválidos", () => {
    expect(() => montarTxid("evt1", 1)).toThrow();
    expect(() => montarTxid("EVT-1", 1)).toThrow();
    expect(() => montarTxid("ABCDEFGHIJK", 1)).toThrow();
    expect(() => montarTxid("EVT1", 0)).toThrow();
    expect(() => montarTxid("EVT1", 1000000)).toThrow();
    expect(() => montarTxid("EVT1", 1.5)).toThrow();
  });
});

describe("nome e cidade fixos", () => {
  it("sem informar nome/cidade usa os valores fixos", () => {
    const txid = montarTxid("EVT1", 7);
    const l = decodificar(gerarPayloadPix({ chave: CHAVE, valor: 2, txid, mensagem: txid }));
    expect(l.campos["59"]).toBe(NOME_FIXO);
    expect(l.campos["60"]).toBe(CIDADE_FIXA);
    expect(l.crcOk).toBe(true);
  });
});

describe("valor", () => {
  it("formata com ponto e 2 casas", () => {
    expect(formatarValor(5)).toBe("5.00");
    expect(formatarValor(0.01)).toBe("0.01");
    expect(formatarValor(1234.5)).toBe("1234.50");
    expect(formatarValor(19.9)).toBe("19.90");
  });
  it("recusa zero, negativo, 3 casas, NaN", () => {
    expect(() => formatarValor(0)).toThrow();
    expect(() => formatarValor(-1)).toThrow();
    expect(() => formatarValor(1.005)).toThrow();
    expect(() => formatarValor(NaN)).toThrow();
  });
});

describe("normalizarTexto", () => {
  it("remove acentos e corta no limite", () => {
    expect(normalizarTexto("Paróquia São José do Ceará", 25)).toBe("Paroquia Sao Jose do Cear");
  });
});
