import { describe, expect, it } from "vitest";
import { conciliar, lerOfx, type PixPagamento } from "./pixconf";

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<DTSTART>20261101120000[-3:BRT]</DTSTART>
<DTEND>20261105120000[-3:BRT]</DTEND>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20261103120000[-3:BRT]</DTPOSTED>
<TRNAMT>10.00</TRNAMT>
<FITID>a1</FITID>
<MEMO>PIX RECEBIDO - OUTRA IF</MEMO>
<NAME>Recebimento Pix FULANO DE TAL</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20261103120000[-3:BRT]</DTPOSTED>
<TRNAMT>10.00</TRNAMT>
<FITID>a2</FITID>
<MEMO>PIX RECEBIDO - OUTRA IF</MEMO>
<NAME>Recebimento Pix CICLANO</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20261103120000[-3:BRT]</DTPOSTED>
<TRNAMT>500.00</TRNAMT>
<FITID>a3</FITID>
<MEMO>DEPOSITO EM DINHEIRO</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20261104120000[-3:BRT]</DTPOSTED>
<TRNAMT>-20.00</TRNAMT>
<FITID>a4</FITID>
<MEMO>PIX EMITIDO OUTRA IF</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20261104120000[-3:BRT]</DTPOSTED>
<TRNAMT>2,50</TRNAMT>
<FITID>a5</FITID>
<MEMO>PIX RECEBIDO - OUTRA IF</MEMO>
<NAME>Recebimento Pix BELTRANO</NAME>
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const pix = (id: string, valor: number, dia: string, n: number): PixPagamento => ({
  id, valor, txid: "T" + id, comprovante: null, conferidoEm: null, vendaNumero: n, vendaStatus: "finalizada", quando: dia + "T15:00:00Z", dia, caixa: "Maria", vendedorId: "x",
});

describe("extrato OFX", () => {
  it("lê só os Pix recebidos (ignora depósito e saídas), com período e valores", () => {
    const e = lerOfx(OFX);
    expect(e.inicio).toBe("2026-11-01");
    expect(e.fim).toBe("2026-11-05");
    expect(e.creditos.map((c) => [c.dia, c.centavos, c.nome])).toEqual([
      ["2026-11-03", 1000, "FULANO DE TAL"], ["2026-11-03", 1000, "CICLANO"], ["2026-11-04", 250, "BELTRANO"],
    ]);
  });
});

describe("conciliação banco x sistema", () => {
  const e = lerOfx(OFX);
  it("casa por valor com tolerância de 1 dia e aponta o que sobra de cada lado", () => {
    const r = conciliar(e, [pix("1", 10, "2026-11-03", 1), pix("2", 2.5, "2026-11-03", 2), pix("3", 77, "2026-11-04", 3), pix("4", 5, "2026-12-20", 4)]);
    expect(r.casados.map((x) => x.pix.id).sort()).toEqual(["1", "2"]);        // 2,50 casou com 1 dia de diferença
    expect(r.soBanco.map((b) => b.nome)).toEqual(["CICLANO"]);                 // segundo Pix de 10 não tem venda
    expect(r.soSistema.map((p) => p.id)).toEqual(["3"]);                       // 77 não entrou; a venda de dezembro está fora do período
  });
  it("cada venda só casa uma vez", () => {
    const r = conciliar(e, [pix("1", 10, "2026-11-03", 1)]);
    expect(r.casados).toHaveLength(1);
    expect(r.soBanco).toHaveLength(2);                                         // CICLANO e BELTRANO (2,50 sem venda)
  });
});
