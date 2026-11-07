import { describe, expect, it } from "vitest";
import { celula, gerarCsv, type Relatorio } from "./relatorio";

const R: Relatorio = {
  evento: { id: "e", codigo: "EVT1", nome: "Festa; do \"Padroeiro\"", status: "aberto" }, gerado_em: "2026-11-05T15:00:00Z",
  resumo: { vendas: 3, anuladas: 1, parciais: 0, cortesias: 0, bruto: 1234.5, devolvido: 34.5, liquido: 1200 },
  por_forma: [{ forma: "dinheiro", vendido: 1000, devolvido: 34.5, liquido: 965.5 }],
  por_produto: [{ nome: "=Pastel", quantidade: 10, faturamento: 80 }], por_caixa: [{ caixa: "Maria", vendas: 3, liquido: 1200 }],
  por_dia: [{ dia: "2026-11-05", vendas: 3, liquido: 1200 }],
  anulacoes: [{ numero: 7, valor: 34.5, motivo: "cliente; desistiu", por: "Zé", em: "2026-11-05T16:00:00Z" }],
  sangrias: { total: 300, pendentes: 0 }, turnos: { total: 2, abertos: 0, sem_conferir: 1 },
};

describe("CSV do relatório (Excel brasileiro)", () => {
  const csv = gerarCsv(R);
  it("começa com BOM, usa ; e vírgula decimal", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Total vendido (bruto);1.234,50");
    expect(csv).toContain("Dinheiro;1.000,00;34,50;965,50");
    expect(csv).toContain("05/11/2026;3;1.200,00");
  });
  it("protege contra fórmulas e escapa ; e aspas", () => {
    expect(csv).toContain("'=Pastel;10;80,00");
    expect(csv).toContain('"Festa; do ""Padroeiro"""');
    expect(csv).toContain('"cliente; desistiu"');
    expect(celula("+1")).toBe("'+1");
    expect(celula(-5)).toBe("-5");                      // número negativo não é fórmula
  });
});
