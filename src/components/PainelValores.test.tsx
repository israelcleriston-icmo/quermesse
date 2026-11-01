// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { calcular, centavosParaTexto, lerReais, type Entrada } from "../lib/pagamento";
import PainelValores, { type Campo, type Textos } from "./PainelValores";

const TOTAL = 5200;
function Harness() {
  const [t, setT] = useState<Textos>({ pix: "", credito: "", debito: "", entregue: "" });
  const e = { pix: lerReais(t.pix), credito: lerReais(t.credito), debito: lerReais(t.debito), entregue: lerReais(t.entregue) };
  const ok = Object.values(e).every((x) => x !== null);
  const calculo = ok ? calcular(TOTAL, e as Entrada) : null;
  const preencher = (c: Campo) => { if (c === "entregue" && calculo) setT({ ...t, entregue: centavosParaTexto(calculo.dinheiro) }); };
  return <PainelValores total={TOTAL} textos={t} onTexto={(c, v) => setT({ ...t, [c]: v })} onPreencher={preencher} calculo={calculo} />;
}

describe("tela de valores por forma de pagamento", () => {
  afterEach(cleanup);
  it("Pix 17 + crédito 15, cliente entrega 50: restante 20 em dinheiro e TROCO 30", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Pix"), { target: { value: "17" } });
    fireEvent.change(screen.getByLabelText("Crédito"), { target: { value: "15" } });
    expect(screen.getByText(/Restante em dinheiro/).parentElement?.textContent).toMatch(/R\$\s*20,00/);
    expect(screen.getByText(/Falta/).textContent).toMatch(/R\$\s*20,00/);
    fireEvent.change(screen.getByLabelText("Dinheiro entregue"), { target: { value: "50" } });
    expect(screen.getByText(/TROCO/).textContent).toMatch(/R\$\s*30,00/);
  });
  it("débito é campo próprio", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Débito"), { target: { value: "52" } });
    expect(screen.getByText(/Pagamento completo/)).toBeTruthy();
  });
  it("valor inválido mostra aviso e não quebra", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Pix"), { target: { value: "abc" } });
    expect(screen.getByText(/valor inválido/)).toBeTruthy();
  });
});
